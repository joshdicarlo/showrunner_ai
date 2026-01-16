/**
 * DriveProvider.tsx
 * 
 * Manages Google Drive integration state:
 * - Connection status
 * - Mock mode for offline development
 * - Auto-save functionality
 * 
 * Wraps the driveClient API for use in React components.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { getDriveClient } from '../services/api';
import { Project } from '../types';

// ============================================================================
// Types
// ============================================================================

interface DriveState {
    isConnected: boolean;
    isMockMode: boolean;
    isInitializing: boolean;
    error: string | null;
}

interface DriveContextType {
    // State
    isConnected: boolean;
    isMockMode: boolean;
    isInitializing: boolean;
    error: string | null;
    
    // Operations
    connect: () => Promise<boolean>;
    disconnect: () => void;
    forceOffline: () => void;
    
    // Project sync operations
    createProjectFolder: (projectTitle: string) => Promise<string>;
    uploadAssetImage: (projectFolderId: string, assetId: string, imageDataUrl: string, filename: string) => Promise<string | null>;
}

// ============================================================================
// Context
// ============================================================================

const DriveContext = createContext<DriveContextType | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface DriveProviderProps {
    children: React.ReactNode;
    autoConnect?: boolean;
}

export const DriveProvider: React.FC<DriveProviderProps> = ({
    children,
    autoConnect = false,
}) => {
    const [state, setState] = useState<DriveState>({
        isConnected: false,
        isMockMode: false,
        isInitializing: false,
        error: null,
    });
    
    const driveClient = useRef(getDriveClient());
    
    // Initialize on mount if autoConnect is enabled
    useEffect(() => {
        if (autoConnect) {
            connect();
        }
    }, [autoConnect]);
    
    const connect = useCallback(async (): Promise<boolean> => {
        setState(prev => ({ ...prev, isInitializing: true, error: null }));
        
        try {
            const client = driveClient.current;
            const initialized = await client.initialize();
            
            if (!initialized) {
                setState(prev => ({
                    ...prev,
                    isInitializing: false,
                    isMockMode: true,
                    isConnected: true,
                }));
                return true;
            }
            
            const token = await client.signIn();
            
            if (token) {
                // Check if it's mock mode
                const isMock = client.isMockMode();
                setState({
                    isConnected: true,
                    isMockMode: isMock,
                    isInitializing: false,
                    error: null,
                });
                return true;
            } else {
                setState(prev => ({
                    ...prev,
                    isInitializing: false,
                    error: 'Sign-in cancelled or failed',
                }));
                return false;
            }
        } catch (e: any) {
            console.error('[DriveProvider] Connection error:', e);
            setState(prev => ({
                ...prev,
                isInitializing: false,
                error: e.message || 'Connection failed',
            }));
            return false;
        }
    }, []);
    
    const disconnect = useCallback(() => {
        setState({
            isConnected: false,
            isMockMode: false,
            isInitializing: false,
            error: null,
        });
    }, []);
    
    const forceOffline = useCallback(() => {
        driveClient.current.enableMockMode();
        setState({
            isConnected: true,
            isMockMode: true,
            isInitializing: false,
            error: null,
        });
    }, []);
    
    const createProjectFolder = useCallback(async (projectTitle: string): Promise<string> => {
        const client = driveClient.current;
        
        // Create root folder first
        const rootFolderId = await client.findOrCreateFolder('ShowrunnerAI Projects');
        // Then create project folder inside
        const projectFolderId = await client.findOrCreateFolder(projectTitle, rootFolderId);
        
        return projectFolderId;
    }, []);
    
    const uploadAssetImage = useCallback(async (
        projectFolderId: string,
        assetId: string,
        imageDataUrl: string,
        filename: string
    ): Promise<string | null> => {
        try {
            const client = driveClient.current;
            const assetFolderId = await client.findOrCreateFolder(assetId, projectFolderId);
            const result = await client.uploadFile(assetFolderId, filename, imageDataUrl, 'image/png');
            return result.webViewLink || null;
        } catch (e: any) {
            console.error('[DriveProvider] Upload error:', e);
            return null;
        }
    }, []);
    
    // Context value
    const value: DriveContextType = useMemo(() => ({
        isConnected: state.isConnected,
        isMockMode: state.isMockMode,
        isInitializing: state.isInitializing,
        error: state.error,
        connect,
        disconnect,
        forceOffline,
        createProjectFolder,
        uploadAssetImage,
    }), [
        state,
        connect,
        disconnect,
        forceOffline,
        createProjectFolder,
        uploadAssetImage,
    ]);
    
    return (
        <DriveContext.Provider value={value}>
            {children}
        </DriveContext.Provider>
    );
};

// ============================================================================
// Hook
// ============================================================================

export const useDrive = (): DriveContextType => {
    const context = useContext(DriveContext);
    if (!context) {
        throw new Error('useDrive must be used within a DriveProvider');
    }
    return context;
};

// Convenience hooks
export const useDriveStatus = () => {
    const { isConnected, isMockMode, isInitializing, error } = useDrive();
    return { isConnected, isMockMode, isInitializing, error };
};

export const useDriveOperations = () => {
    const { connect, disconnect, forceOffline, createProjectFolder, uploadAssetImage } = useDrive();
    return { connect, disconnect, forceOffline, createProjectFolder, uploadAssetImage };
};

export default DriveProvider;
