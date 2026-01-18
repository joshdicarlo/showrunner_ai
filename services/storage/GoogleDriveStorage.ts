/**
 * Google Drive Storage Provider
 * 
 * Implements IStorageProvider for Google Drive.
 * Handles OAuth, file operations, and project sync.
 */

import { 
    IStorageProvider, 
    StorageProviderType, 
    StorageAuthState, 
    StorageFile,
    ProjectStructure,
    UploadOptions,
    UploadResult,
} from './types';
import { Project, ProjectAsset, DepartmentType } from '../../types';
import { GOOGLE_CLIENT_ID } from '../../constants';

// ============================================================================
// Types
// ============================================================================

declare global {
    interface Window {
        gapi: any;
        google: any;
    }
}

const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY_DOCS = [
    'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
    'https://sheets.googleapis.com/$discovery/rest?version=v4'
];

const AUTH_STORAGE_KEY = 'showrunner-google-auth';
const FOLDER_CACHE_KEY = 'showrunner-folder-cache';

// ============================================================================
// Implementation
// ============================================================================

export class GoogleDriveStorage implements IStorageProvider {
    readonly type: StorageProviderType = 'google-drive';
    readonly displayName = 'Google Drive';
    
    private tokenClient: any = null;
    private gapiInited = false;
    private gisInited = false;
    private isMock = false;
    private authState: StorageAuthState | null = null;
    private folderCache: Map<string, string> = new Map();
    
    // ========================================================================
    // State Methods
    // ========================================================================
    
    isInitialized(): boolean {
        return this.gapiInited && this.gisInited;
    }
    
    isAuthenticated(): boolean {
        return this.authState?.isAuthenticated ?? false;
    }
    
    isMockMode(): boolean {
        return this.isMock;
    }
    
    enableMockMode(): void {
        this.isMock = true;
        this.authState = {
            isAuthenticated: true,
            userEmail: 'mock@offline.local',
            accessToken: 'mock-token',
            tokenExpiry: Date.now() + 3600000,
            providerType: 'google-drive',
        };
        console.log('[GoogleDriveStorage] Mock mode enabled');
    }
    
    // ========================================================================
    // Initialization
    // ========================================================================
    
    async initialize(): Promise<boolean> {
        if (this.isMock) return true;
        
        return new Promise((resolve) => {
            const checkGapi = setInterval(() => {
                if (window.gapi && window.google) {
                    clearInterval(checkGapi);
                    
                    try {
                        window.gapi.load('client', async () => {
                            try {
                                await window.gapi.client.init({
                                    clientId: GOOGLE_CLIENT_ID,
                                    discoveryDocs: DISCOVERY_DOCS,
                                });
                                this.gapiInited = true;
                            } catch (e) {
                                console.warn('[GoogleDriveStorage] GAPI init failed:', e);
                            }
                        });
                        
                        this.tokenClient = window.google.accounts.oauth2.initTokenClient({
                            client_id: GOOGLE_CLIENT_ID,
                            scope: SCOPES,
                            callback: () => {}, // Will be overridden per-request
                        });
                        this.gisInited = true;
                        
                        // Load folder cache
                        this.loadFolderCache();
                        
                        resolve(true);
                    } catch (e) {
                        console.warn('[GoogleDriveStorage] Failed to initialize:', e);
                        resolve(false);
                    }
                }
            }, 100);
            
            setTimeout(() => {
                clearInterval(checkGapi);
                if (!this.gapiInited) {
                    console.warn('[GoogleDriveStorage] Init timed out');
                    resolve(false);
                }
            }, 10000);
        });
    }
    
    // ========================================================================
    // Authentication
    // ========================================================================
    
    async authenticate(): Promise<StorageAuthState> {
        if (this.isMock) {
            return this.authState!;
        }
        
        if (!this.tokenClient) {
            throw new Error('Google API not initialized');
        }
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Authentication timed out'));
            }, 120000); // 2 minutes for consent screens
            
            this.tokenClient.callback = async (resp: any) => {
                clearTimeout(timeout);
                
                if (resp.error) {
                    reject(new Error(resp.error_description || 'Authentication failed'));
                    return;
                }
                
                // Get user info
                let userEmail = null;
                try {
                    const userInfo = await window.gapi.client.drive.about.get({
                        fields: 'user'
                    });
                    userEmail = userInfo.result.user?.emailAddress;
                } catch (e) {
                    console.warn('[GoogleDriveStorage] Failed to get user info:', e);
                }
                
                this.authState = {
                    isAuthenticated: true,
                    userEmail,
                    accessToken: resp.access_token,
                    tokenExpiry: Date.now() + (resp.expires_in * 1000),
                    providerType: 'google-drive',
                };
                
                // Persist auth state
                this.saveAuthState();
                
                resolve(this.authState);
            };
            
            if (window.gapi.client.getToken() === null) {
                this.tokenClient.requestAccessToken({ prompt: 'consent' });
            } else {
                this.tokenClient.requestAccessToken({ prompt: '' });
            }
        });
    }
    
    async signOut(): Promise<void> {
        const token = window.gapi?.client?.getToken();
        if (token) {
            window.google.accounts.oauth2.revoke(token.access_token);
            window.gapi.client.setToken(null);
        }
        
        this.authState = null;
        localStorage.removeItem(AUTH_STORAGE_KEY);
        this.folderCache.clear();
        localStorage.removeItem(FOLDER_CACHE_KEY);
    }
    
    getAuthState(): StorageAuthState | null {
        return this.authState;
    }
    
    async restoreSession(): Promise<StorageAuthState | null> {
        if (this.isMock) {
            return this.authState;
        }
        
        const stored = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!stored) return null;
        
        try {
            const parsed: StorageAuthState = JSON.parse(stored);
            
            // Check if token is expired
            if (parsed.tokenExpiry && Date.now() > parsed.tokenExpiry) {
                console.log('[GoogleDriveStorage] Stored token expired');
                localStorage.removeItem(AUTH_STORAGE_KEY);
                return null;
            }
            
            // Try to restore the token to gapi
            if (parsed.accessToken && window.gapi?.client) {
                window.gapi.client.setToken({
                    access_token: parsed.accessToken,
                });
                
                // Validate the token is still working
                try {
                    await window.gapi.client.drive.about.get({ fields: 'user' });
                    this.authState = parsed;
                    this.loadFolderCache();
                    return this.authState;
                } catch (e) {
                    console.log('[GoogleDriveStorage] Stored token invalid');
                    localStorage.removeItem(AUTH_STORAGE_KEY);
                    return null;
                }
            }
            
            return null;
        } catch (e) {
            console.warn('[GoogleDriveStorage] Failed to restore session:', e);
            return null;
        }
    }
    
    private saveAuthState(): void {
        if (this.authState && !this.isMock) {
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.authState));
        }
    }
    
    private loadFolderCache(): void {
        const stored = localStorage.getItem(FOLDER_CACHE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                this.folderCache = new Map(Object.entries(parsed));
            } catch (e) {
                this.folderCache = new Map();
            }
        }
    }
    
    private saveFolderCache(): void {
        const obj = Object.fromEntries(this.folderCache);
        localStorage.setItem(FOLDER_CACHE_KEY, JSON.stringify(obj));
    }
    
    // ========================================================================
    // Folder Operations
    // ========================================================================
    
    async findFolder(name: string, parentId?: string): Promise<string | null> {
        if (this.isMock) {
            const cacheKey = `${parentId || 'root'}:${name}`;
            return this.folderCache.get(cacheKey) || null;
        }
        
        try {
            let query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
            if (parentId) {
                query += ` and '${parentId}' in parents`;
            } else {
                query += ` and 'root' in parents`;
            }
            
            const response = await window.gapi.client.drive.files.list({
                q: query,
                fields: 'files(id, name)',
                spaces: 'drive',
            });
            
            if (response.result.files && response.result.files.length > 0) {
                return response.result.files[0].id;
            }
            
            return null;
        } catch (e) {
            console.error('[GoogleDriveStorage] Find folder failed:', e);
            return null;
        }
    }
    
    async createFolder(name: string, parentId?: string): Promise<string> {
        if (this.isMock) {
            const mockId = `mock-folder-${name.toLowerCase().replace(/\s/g, '-')}-${Date.now()}`;
            const cacheKey = `${parentId || 'root'}:${name}`;
            this.folderCache.set(cacheKey, mockId);
            return mockId;
        }
        
        const fileMetadata: any = {
            name: name,
            mimeType: 'application/vnd.google-apps.folder',
        };
        
        if (parentId) {
            fileMetadata.parents = [parentId];
        }
        
        const response = await window.gapi.client.drive.files.create({
            resource: fileMetadata,
            fields: 'id',
        });
        
        return response.result.id;
    }
    
    async findOrCreateFolder(name: string, parentId?: string): Promise<string> {
        const cacheKey = `${parentId || 'root'}:${name}`;
        
        // Check cache first
        const cached = this.folderCache.get(cacheKey);
        if (cached) {
            // Validate cache in background for non-mock
            if (!this.isMock) {
                this.validateCachedFolder(cached, cacheKey);
            }
            return cached;
        }
        
        // Try to find existing
        const existingId = await this.findFolder(name, parentId);
        if (existingId) {
            this.folderCache.set(cacheKey, existingId);
            this.saveFolderCache();
            return existingId;
        }
        
        // Create new
        const newId = await this.createFolder(name, parentId);
        this.folderCache.set(cacheKey, newId);
        this.saveFolderCache();
        return newId;
    }
    
    private async validateCachedFolder(folderId: string, cacheKey: string): Promise<void> {
        try {
            await window.gapi.client.drive.files.get({
                fileId: folderId,
                fields: 'id, trashed',
            });
        } catch (e) {
            // Folder doesn't exist anymore, remove from cache
            this.folderCache.delete(cacheKey);
            this.saveFolderCache();
        }
    }
    
    // ========================================================================
    // File Operations
    // ========================================================================
    
    async uploadFile(options: UploadOptions): Promise<UploadResult> {
        const { filename, content, mimeType, folderId } = options;
        
        if (this.isMock) {
            console.log(`[GoogleDriveStorage Mock] Upload: ${filename}`);
            return {
                id: `mock-file-${Date.now()}`,
                webViewLink: typeof content === 'string' && content.startsWith('data:') 
                    ? content 
                    : 'https://mock.drive.google.com/view',
            };
        }
        
        let fileContent: Blob;
        
        if (typeof content === 'string') {
            if (content.startsWith('data:')) {
                const res = await fetch(content);
                fileContent = await res.blob();
            } else {
                fileContent = new Blob([content], { type: mimeType });
            }
        } else {
            fileContent = content;
        }
        
        const metadata = {
            name: filename,
            mimeType: mimeType,
            parents: [folderId],
        };
        
        const accessToken = window.gapi.auth.getToken().access_token;
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', fileContent);
        
        const res = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
            {
                method: 'POST',
                headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
                body: form,
            }
        );
        
        const result = await res.json();
        return {
            id: result.id,
            webViewLink: result.webViewLink,
        };
    }
    
    async downloadFile(fileId: string): Promise<Blob> {
        if (this.isMock) {
            return new Blob(['mock content'], { type: 'text/plain' });
        }
        
        const accessToken = window.gapi.auth.getToken().access_token;
        const res = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            {
                headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            }
        );
        
        return await res.blob();
    }
    
    async deleteFile(fileId: string): Promise<void> {
        if (this.isMock) {
            console.log(`[GoogleDriveStorage Mock] Delete: ${fileId}`);
            return;
        }
        
        await window.gapi.client.drive.files.delete({ fileId });
    }
    
    async listFiles(folderId: string): Promise<StorageFile[]> {
        if (this.isMock) {
            return [];
        }
        
        const response = await window.gapi.client.drive.files.list({
            q: `'${folderId}' in parents and trashed=false`,
            fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink)',
            spaces: 'drive',
        });
        
        return (response.result.files || []).map((f: any) => ({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            size: f.size ? parseInt(f.size) : undefined,
            createdAt: f.createdTime ? new Date(f.createdTime) : undefined,
            modifiedAt: f.modifiedTime ? new Date(f.modifiedTime) : undefined,
            webViewLink: f.webViewLink,
            parentId: folderId,
        }));
    }
    
    // ========================================================================
    // Project Operations
    // ========================================================================
    
    async createProjectStructure(projectName: string): Promise<ProjectStructure> {
        console.log(`[GoogleDriveStorage] Creating structure for: ${projectName}`);
        
        // Create folder hierarchy
        const appDataId = await this.findOrCreateFolder('AppData');
        const rootId = await this.findOrCreateFolder('Showrunner-AI', appDataId);
        const projectId = await this.findOrCreateFolder(projectName, rootId);
        
        // Create department folders
        const folders: Record<string, string> = {};
        folders['Scripts'] = await this.findOrCreateFolder('Scripts', projectId);
        folders['Cast'] = await this.findOrCreateFolder('Cast', projectId);
        folders['Sets'] = await this.findOrCreateFolder('Sets', projectId);
        folders['Story'] = await this.findOrCreateFolder('Story', projectId);
        folders['Prod'] = await this.findOrCreateFolder('Prod', projectId);
        folders['Media'] = await this.findOrCreateFolder('Media', projectId);
        
        // Create or find project data file (JSON instead of spreadsheet for full project data)
        let dbFileId = await this.findProjectDataFile(projectId);
        
        if (!dbFileId) {
            dbFileId = await this.createProjectDataFile(projectId, projectName);
        }
        
        return { appDataId, rootId, projectId, dbFileId, folders };
    }
    
    private async findProjectDataFile(projectFolderId: string): Promise<string | null> {
        if (this.isMock) {
            return null;
        }
        
        try {
            const response = await window.gapi.client.drive.files.list({
                q: `name='project.json' and '${projectFolderId}' in parents and trashed=false`,
                fields: 'files(id)',
                spaces: 'drive',
            });
            
            if (response.result.files && response.result.files.length > 0) {
                return response.result.files[0].id;
            }
            return null;
        } catch (e) {
            return null;
        }
    }
    
    private async createProjectDataFile(projectFolderId: string, projectName: string): Promise<string> {
        if (this.isMock) {
            return `mock-project-json-${Date.now()}`;
        }
        
        const initialData = {
            version: 1,
            name: projectName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        
        const result = await this.uploadFile({
            filename: 'project.json',
            content: JSON.stringify(initialData, null, 2),
            mimeType: 'application/json',
            folderId: projectFolderId,
        });
        
        return result.id;
    }
    
    async saveProject(project: Project, structure: ProjectStructure): Promise<void> {
        console.log(`[GoogleDriveStorage] Saving project: ${project.title}`);
        
        if (this.isMock) {
            console.log('[GoogleDriveStorage Mock] Project saved');
            return;
        }
        
        const projectData = {
            version: 1,
            ...project,
            updatedAt: new Date().toISOString(),
        };
        
        // Update the project.json file
        const accessToken = window.gapi.auth.getToken().access_token;
        
        await fetch(
            `https://www.googleapis.com/upload/drive/v3/files/${structure.dbFileId}?uploadType=media`,
            {
                method: 'PATCH',
                headers: new Headers({
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type': 'application/json',
                }),
                body: JSON.stringify(projectData, null, 2),
            }
        );
    }
    
    async loadProject(projectId: string, structure: ProjectStructure): Promise<Project | null> {
        if (this.isMock) {
            return null;
        }
        
        try {
            const blob = await this.downloadFile(structure.dbFileId);
            const text = await blob.text();
            const data = JSON.parse(text);
            
            // Convert date strings back to Date objects
            if (data.updatedAt) {
                data.updatedAt = new Date(data.updatedAt);
            }
            
            return data as Project;
        } catch (e) {
            console.error('[GoogleDriveStorage] Failed to load project:', e);
            return null;
        }
    }
    
    async listProjects(): Promise<Array<{ id: string; name: string; modifiedAt: Date }>> {
        if (this.isMock) {
            return [];
        }
        
        try {
            // Find the Showrunner-AI folder
            const appDataId = await this.findFolder('AppData');
            if (!appDataId) return [];
            
            const rootId = await this.findFolder('Showrunner-AI', appDataId);
            if (!rootId) return [];
            
            // List all project folders
            const response = await window.gapi.client.drive.files.list({
                q: `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id, name, modifiedTime)',
                spaces: 'drive',
                orderBy: 'modifiedTime desc',
            });
            
            return (response.result.files || []).map((f: any) => ({
                id: f.id,
                name: f.name,
                modifiedAt: new Date(f.modifiedTime),
            }));
        } catch (e) {
            console.error('[GoogleDriveStorage] Failed to list projects:', e);
            return [];
        }
    }
    
    async deleteProject(projectId: string, structure: ProjectStructure): Promise<void> {
        if (this.isMock) {
            console.log('[GoogleDriveStorage Mock] Project deleted');
            return;
        }
        
        // Move folder to trash
        await window.gapi.client.drive.files.update({
            fileId: structure.projectId,
            resource: { trashed: true },
        });
    }
    
    // ========================================================================
    // Asset Operations
    // ========================================================================
    
    async syncAsset(asset: ProjectAsset, projectStructure: ProjectStructure): Promise<string> {
        const { folders, projectId } = projectStructure;
        
        let targetFolderId = projectId;
        
        // Map department to folder
        const folderMap: Record<string, string> = {
            [DepartmentType.CASTING_WARDROBE]: folders['Cast'],
            [DepartmentType.SET_DESIGN]: folders['Sets'],
            [DepartmentType.WRITERS_ROOM]: folders['Scripts'],
            [DepartmentType.STORY]: folders['Story'],
            [DepartmentType.PRODUCTION]: folders['Prod'],
        };
        
        if (folderMap[asset.department]) {
            targetFolderId = folderMap[asset.department];
        }
        
        // For Story/Production, create sub-folders
        if (asset.department === DepartmentType.STORY || 
            asset.department === DepartmentType.PRODUCTION) {
            targetFolderId = await this.findOrCreateFolder(asset.title, targetFolderId);
        }
        
        return targetFolderId;
    }
    
    async uploadAssetMedia(
        assetId: string, 
        mediaUrl: string, 
        projectStructure: ProjectStructure
    ): Promise<string> {
        const { folders } = projectStructure;
        const mediaFolderId = folders['Media'];
        
        // Generate filename from asset ID and timestamp
        const filename = `${assetId}-${Date.now()}.png`;
        
        const result = await this.uploadFile({
            filename,
            content: mediaUrl,
            mimeType: 'image/png',
            folderId: mediaFolderId,
        });
        
        return result.webViewLink || result.id;
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const googleDriveStorage = new GoogleDriveStorage();
