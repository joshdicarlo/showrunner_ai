/**
 * Storage Provider Types
 * 
 * Defines the interface for pluggable storage backends.
 * Current implementations: Google Drive
 * Future: S3, Azure Blob, Local File System, etc.
 */

import { Project, ProjectAsset } from '../../types';

// ============================================================================
// Core Types
// ============================================================================

export type StorageProviderType = 'google-drive' | 's3' | 'azure-blob' | 'local' | 'none';

export interface StorageConfig {
    type: StorageProviderType;
    // Provider-specific config
    googleDrive?: {
        clientId: string;
        scopes: string[];
    };
    s3?: {
        bucket: string;
        region: string;
        accessKeyId?: string;
        secretAccessKey?: string;
    };
    azure?: {
        containerName: string;
        connectionString?: string;
    };
}

export interface StorageAuthState {
    isAuthenticated: boolean;
    userEmail: string | null;
    accessToken: string | null;
    refreshToken?: string | null;
    tokenExpiry: number | null;
    providerType: StorageProviderType;
}

export interface StorageFile {
    id: string;
    name: string;
    mimeType: string;
    size?: number;
    createdAt?: Date;
    modifiedAt?: Date;
    webViewLink?: string;
    downloadUrl?: string;
    parentId?: string;
}

export interface StorageFolder {
    id: string;
    name: string;
    parentId?: string;
    path?: string;
}

export interface ProjectStructure {
    appDataId: string;
    rootId: string;
    projectId: string;
    dbFileId: string;
    folders: Record<string, string>;
}

export interface UploadOptions {
    filename: string;
    content: string | Blob;
    mimeType: string;
    folderId: string;
    overwrite?: boolean;
}

export interface UploadResult {
    id: string;
    webViewLink?: string;
    downloadUrl?: string;
}

// ============================================================================
// Storage Provider Interface
// ============================================================================

/**
 * Abstract interface for storage providers.
 * Implementations must provide all these methods.
 */
export interface IStorageProvider {
    // Identity
    readonly type: StorageProviderType;
    readonly displayName: string;
    
    // State
    isInitialized(): boolean;
    isAuthenticated(): boolean;
    isMockMode(): boolean;
    
    // Auth
    initialize(): Promise<boolean>;
    authenticate(): Promise<StorageAuthState>;
    signOut(): Promise<void>;
    getAuthState(): StorageAuthState | null;
    restoreSession(): Promise<StorageAuthState | null>;
    
    // Enable offline/mock mode
    enableMockMode(): void;
    
    // Folders
    findFolder(name: string, parentId?: string): Promise<string | null>;
    createFolder(name: string, parentId?: string): Promise<string>;
    findOrCreateFolder(name: string, parentId?: string): Promise<string>;
    
    // Files
    uploadFile(options: UploadOptions): Promise<UploadResult>;
    downloadFile(fileId: string): Promise<Blob>;
    deleteFile(fileId: string): Promise<void>;
    listFiles(folderId: string): Promise<StorageFile[]>;
    
    // Project-specific operations
    createProjectStructure(projectName: string): Promise<ProjectStructure>;
    saveProject(project: Project, structure: ProjectStructure): Promise<void>;
    loadProject(projectId: string, structure: ProjectStructure): Promise<Project | null>;
    listProjects(): Promise<Array<{ id: string; name: string; modifiedAt: Date }>>;
    deleteProject(projectId: string, structure: ProjectStructure): Promise<void>;
    
    // Asset operations
    syncAsset(asset: ProjectAsset, projectStructure: ProjectStructure): Promise<string>;
    uploadAssetMedia(assetId: string, mediaUrl: string, projectStructure: ProjectStructure): Promise<string>;
}

// ============================================================================
// Storage Events
// ============================================================================

export type StorageEventType = 
    | 'auth:changed'
    | 'sync:started'
    | 'sync:completed'
    | 'sync:failed'
    | 'upload:progress'
    | 'upload:completed'
    | 'upload:failed';

export interface StorageEvent {
    type: StorageEventType;
    provider: StorageProviderType;
    data?: any;
    error?: Error;
    timestamp: number;
}

export type StorageEventListener = (event: StorageEvent) => void;

// ============================================================================
// Storage Manager Interface
// ============================================================================

/**
 * Manages storage providers and handles sync logic.
 */
export interface IStorageManager {
    // Provider management
    getProvider(): IStorageProvider | null;
    setProvider(type: StorageProviderType, config?: Partial<StorageConfig>): Promise<void>;
    
    // Convenience methods that delegate to current provider
    isAuthenticated(): boolean;
    authenticate(): Promise<StorageAuthState>;
    signOut(): Promise<void>;
    
    // Sync
    syncProject(project: Project): Promise<void>;
    loadProjects(): Promise<Project[]>;
    
    // Events
    addEventListener(listener: StorageEventListener): void;
    removeEventListener(listener: StorageEventListener): void;
}
