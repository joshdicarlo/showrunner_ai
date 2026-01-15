/**
 * useDrive Hook
 * 
 * React hook for Google Drive operations.
 * Provides state management for authentication and file operations.
 */

import { useState, useCallback, useEffect } from 'react';
import { getDriveClient } from '../api';
import { Project, ProjectAsset, DepartmentType } from '../../types';

// --- Types ---

export interface UseDriveState {
    /** Whether the user is authenticated with Google */
    isAuthenticated: boolean;
    /** Whether running in mock/offline mode */
    isMockMode: boolean;
    /** Whether initialization is in progress */
    isInitializing: boolean;
    /** Whether a file operation is in progress */
    isOperating: boolean;
    /** Error message if an operation failed */
    error: string | null;
}

export interface ProjectStructure {
    rootId: string;
    projectId: string;
    dbId: string;
    folders: Record<string, string>;
}

export interface UseDriveActions {
    /** Initialize the Drive client */
    initialize: () => Promise<boolean>;
    
    /** Sign in to Google account */
    signIn: () => Promise<string>;
    
    /** Enable mock/offline mode */
    enableMockMode: () => void;
    
    /** Create project folder structure in Drive */
    createProjectStructure: (projectName: string) => Promise<ProjectStructure>;
    
    /** Upload a file to Drive */
    uploadFile: (folderId: string, filename: string, content: string | Blob, contentType: string) => Promise<string>;
    
    /** Sync asset folder */
    syncAssetFolder: (asset: ProjectAsset, projectFolderId: string, folders: Record<string, string>) => Promise<string>;
    
    /** Update project database spreadsheet */
    updateProjectDB: (dbId: string, assets: ProjectAsset[]) => Promise<void>;
}

export interface UseDriveReturn extends UseDriveState, UseDriveActions {}

// --- Hook ---

export const useDrive = (): UseDriveReturn => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isMockMode, setIsMockMode] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [isOperating, setIsOperating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const client = getDriveClient();

    // Check if already in mock mode
    useEffect(() => {
        setIsMockMode(client.isMockMode());
    }, [client]);

    const initialize = useCallback(async (): Promise<boolean> => {
        setIsInitializing(true);
        setError(null);
        
        try {
            const result = await client.initialize();
            setIsMockMode(client.isMockMode());
            return result;
        } catch (e: any) {
            setError(e.message || 'Failed to initialize Drive');
            return false;
        } finally {
            setIsInitializing(false);
        }
    }, [client]);

    const signIn = useCallback(async (): Promise<string> => {
        setError(null);
        
        try {
            const token = await client.signIn();
            const isMock = token.startsWith('mock-');
            setIsMockMode(isMock);
            setIsAuthenticated(!isMock);
            return token;
        } catch (e: any) {
            setError(e.message || 'Sign in failed');
            throw e;
        }
    }, [client]);

    const enableMockMode = useCallback(() => {
        client.enableMockMode();
        setIsMockMode(true);
        setIsAuthenticated(false);
    }, [client]);

    const createProjectStructure = useCallback(async (projectName: string): Promise<ProjectStructure> => {
        setIsOperating(true);
        setError(null);
        
        try {
            const rootId = await client.findOrCreateFolder("Showrunner-AI");
            const projectId = await client.findOrCreateFolder(projectName, rootId);

            const folders: Record<string, string> = {};
            folders['Scripts'] = await client.findOrCreateFolder('Scripts', projectId);
            folders['Cast'] = await client.findOrCreateFolder('Cast', projectId);
            folders['Sets'] = await client.findOrCreateFolder('Sets', projectId);
            folders['Story'] = await client.findOrCreateFolder('Story', projectId);
            folders['Prod'] = await client.findOrCreateFolder('Prod', projectId);

            // Find or create project database spreadsheet
            let dbId = await client.findSpreadsheet('project_db', projectId);
            
            if (!dbId) {
                dbId = await client.createSpreadsheet('project_db', projectId);
                // Add headers
                await client.updateSpreadsheet(dbId, 'Sheet1!A1:F1', [
                    ['ID', 'Department', 'Type', 'Title', 'Description', 'DriveLink']
                ]);
            }

            return { rootId, projectId, dbId: dbId!, folders };
        } catch (e: any) {
            setError(e.message || 'Failed to create project structure');
            throw e;
        } finally {
            setIsOperating(false);
        }
    }, [client]);

    const uploadFile = useCallback(async (
        folderId: string,
        filename: string,
        content: string | Blob,
        contentType: string
    ): Promise<string> => {
        setIsOperating(true);
        setError(null);
        
        try {
            const result = await client.uploadFile(folderId, filename, content, contentType);
            return result.webViewLink || '';
        } catch (e: any) {
            setError(e.message || 'Failed to upload file');
            throw e;
        } finally {
            setIsOperating(false);
        }
    }, [client]);

    const syncAssetFolder = useCallback(async (
        asset: ProjectAsset,
        projectFolderId: string,
        folders: Record<string, string>
    ): Promise<string> => {
        if (asset.driveId) return asset.driveId;

        let parentFolderId = projectFolderId;

        if (asset.department === DepartmentType.CASTING_WARDROBE) parentFolderId = folders['Cast'];
        else if (asset.department === DepartmentType.SET_DESIGN) parentFolderId = folders['Sets'];
        else if (asset.department === DepartmentType.WRITERS_ROOM) parentFolderId = folders['Scripts'];
        else if (asset.department === DepartmentType.STORY) parentFolderId = folders['Story'];
        else if (asset.department === DepartmentType.PRODUCTION) parentFolderId = folders['Prod'];

        if (asset.department === DepartmentType.PRODUCTION || asset.department === DepartmentType.STORY) {
            return await client.findOrCreateFolder(asset.title, parentFolderId);
        }

        return parentFolderId;
    }, [client]);

    const updateProjectDB = useCallback(async (dbId: string, assets: ProjectAsset[]): Promise<void> => {
        setIsOperating(true);
        setError(null);
        
        try {
            const rows = assets.map(a => [
                a.id,
                a.department,
                'Asset',
                a.title,
                a.description.substring(0, 100),
                a.thumbnailUrl || ''
            ]);

            await client.updateSpreadsheet(dbId, 'Sheet1!A2', rows);
        } catch (e: any) {
            setError(e.message || 'Failed to update project database');
            throw e;
        } finally {
            setIsOperating(false);
        }
    }, [client]);

    return {
        // State
        isAuthenticated,
        isMockMode,
        isInitializing,
        isOperating,
        error,
        // Actions
        initialize,
        signIn,
        enableMockMode,
        createProjectStructure,
        uploadFile,
        syncAssetFolder,
        updateProjectDB
    };
};

export default useDrive;
