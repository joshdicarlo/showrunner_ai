/**
 * useStorage Hook
 * 
 * React hook for interacting with the storage system.
 * Handles state management, events, and provides a clean API.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { storageManager } from './StorageManager';
import { 
    StorageProviderType, 
    StorageAuthState, 
    StorageEvent,
    ProjectStructure,
} from './types';
import { Project } from '../../types';

// ============================================================================
// Types
// ============================================================================

export interface UseStorageResult {
    // State
    isInitialized: boolean;
    isAuthenticated: boolean;
    isMockMode: boolean;
    isLoading: boolean;
    isSyncing: boolean;
    authState: StorageAuthState | null;
    providerType: StorageProviderType | null;
    error: string | null;
    
    // Actions
    initialize: (type?: StorageProviderType) => Promise<void>;
    authenticate: () => Promise<StorageAuthState | null>;
    signOut: () => Promise<void>;
    enableMockMode: () => void;
    restoreSession: () => Promise<boolean>;
    
    // Project operations
    syncProject: (project: Project) => Promise<void>;
    loadProjects: () => Promise<Project[]>;
    createProjectInStorage: (project: Project) => Promise<ProjectStructure | null>;
    getProjectStructure: (projectId: string) => ProjectStructure | null;
    uploadMedia: (projectId: string, assetId: string, mediaUrl: string) => Promise<string | null>;
    deleteProjectFromStorage: (projectId: string) => Promise<boolean>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useStorage(): UseStorageResult {
    const [isInitialized, setIsInitialized] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isMockMode, setIsMockMode] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [authState, setAuthState] = useState<StorageAuthState | null>(null);
    const [providerType, setProviderType] = useState<StorageProviderType | null>(null);
    const [error, setError] = useState<string | null>(null);
    
    const syncingProjects = useRef<Set<string>>(new Set());
    
    // ========================================================================
    // Event Handler
    // ========================================================================
    
    useEffect(() => {
        const handleEvent = (event: StorageEvent) => {
            switch (event.type) {
                case 'auth:changed':
                    setAuthState(event.data as StorageAuthState | null);
                    setIsAuthenticated(!!event.data?.isAuthenticated);
                    break;
                case 'sync:started':
                    syncingProjects.current.add(event.data.projectId);
                    setIsSyncing(syncingProjects.current.size > 0);
                    break;
                case 'sync:completed':
                case 'sync:failed':
                    syncingProjects.current.delete(event.data.projectId);
                    setIsSyncing(syncingProjects.current.size > 0);
                    if (event.error) {
                        setError(event.error.message);
                    }
                    break;
                case 'upload:failed':
                    setError(event.error?.message || 'Upload failed');
                    break;
            }
        };
        
        storageManager.addEventListener(handleEvent);
        return () => storageManager.removeEventListener(handleEvent);
    }, []);
    
    // ========================================================================
    // Actions
    // ========================================================================
    
    const initialize = useCallback(async (type: StorageProviderType = 'google-drive') => {
        setIsLoading(true);
        setError(null);
        
        try {
            await storageManager.setProvider(type);
            setProviderType(type);
            setIsInitialized(true);
            setIsMockMode(storageManager.isMockMode());
        } catch (e: any) {
            setError(e.message || 'Failed to initialize storage');
        } finally {
            setIsLoading(false);
        }
    }, []);
    
    const authenticate = useCallback(async (): Promise<StorageAuthState | null> => {
        setIsLoading(true);
        setError(null);
        
        try {
            const state = await storageManager.authenticate();
            setAuthState(state);
            setIsAuthenticated(state.isAuthenticated);
            setIsMockMode(storageManager.isMockMode());
            return state;
        } catch (e: any) {
            setError(e.message || 'Authentication failed');
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);
    
    const signOut = useCallback(async () => {
        setIsLoading(true);
        try {
            await storageManager.signOut();
            setAuthState(null);
            setIsAuthenticated(false);
        } catch (e: any) {
            setError(e.message || 'Sign out failed');
        } finally {
            setIsLoading(false);
        }
    }, []);
    
    const enableMockMode = useCallback(() => {
        storageManager.enableMockMode();
        setIsMockMode(true);
        setIsAuthenticated(true);
        setAuthState({
            isAuthenticated: true,
            userEmail: 'mock@offline.local',
            accessToken: 'mock-token',
            tokenExpiry: Date.now() + 3600000,
            providerType: providerType || 'none',
        });
    }, [providerType]);
    
    const restoreSession = useCallback(async (): Promise<boolean> => {
        setIsLoading(true);
        setError(null);
        
        try {
            // First try to restore provider config
            await storageManager.initializeFromSaved();
            
            const provider = storageManager.getProvider();
            if (provider) {
                setProviderType(provider.type);
                setIsInitialized(true);
            }
            
            // Then try to restore auth session
            const state = await storageManager.restoreSession();
            
            if (state) {
                setAuthState(state);
                setIsAuthenticated(state.isAuthenticated);
                setIsMockMode(storageManager.isMockMode());
                return true;
            }
            
            return false;
        } catch (e: any) {
            console.warn('[useStorage] Failed to restore session:', e);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);
    
    // ========================================================================
    // Project Operations
    // ========================================================================
    
    const syncProject = useCallback(async (project: Project) => {
        await storageManager.syncProject(project);
    }, []);
    
    const loadProjects = useCallback(async (): Promise<Project[]> => {
        setIsLoading(true);
        setError(null);
        
        try {
            return await storageManager.loadProjects();
        } catch (e: any) {
            setError(e.message || 'Failed to load projects');
            return [];
        } finally {
            setIsLoading(false);
        }
    }, []);
    
    const createProjectInStorage = useCallback(async (project: Project): Promise<ProjectStructure | null> => {
        return await storageManager.createProjectInStorage(project);
    }, []);
    
    const getProjectStructure = useCallback((projectId: string): ProjectStructure | null => {
        return storageManager.getProjectStructure(projectId);
    }, []);
    
    const uploadMedia = useCallback(async (
        projectId: string, 
        assetId: string, 
        mediaUrl: string
    ): Promise<string | null> => {
        return await storageManager.uploadMedia(projectId, assetId, mediaUrl);
    }, []);
    
    const deleteProjectFromStorage = useCallback(async (projectId: string): Promise<boolean> => {
        return await storageManager.deleteProject(projectId);
    }, []);
    
    // ========================================================================
    // Return
    // ========================================================================
    
    return {
        // State
        isInitialized,
        isAuthenticated,
        isMockMode,
        isLoading,
        isSyncing,
        authState,
        providerType,
        error,
        
        // Actions
        initialize,
        authenticate,
        signOut,
        enableMockMode,
        restoreSession,
        
        // Project operations
        syncProject,
        loadProjects,
        createProjectInStorage,
        getProjectStructure,
        uploadMedia,
        deleteProjectFromStorage,
    };
}

export default useStorage;
