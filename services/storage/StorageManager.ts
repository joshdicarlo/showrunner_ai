/**
 * Storage Manager
 * 
 * Coordinates between storage providers and app state.
 * Handles sync, caching, and provider switching.
 */

import { 
    IStorageManager, 
    IStorageProvider, 
    StorageProviderType, 
    StorageConfig,
    StorageAuthState,
    StorageEvent,
    StorageEventListener,
    ProjectStructure,
} from './types';
import { GoogleDriveStorage, googleDriveStorage } from './GoogleDriveStorage';
import { Project } from '../../types';

// ============================================================================
// Constants
// ============================================================================

const STORAGE_CONFIG_KEY = 'showrunner-storage-config';
const PROJECT_STRUCTURES_KEY = 'showrunner-project-structures';

// ============================================================================
// Storage Manager Implementation
// ============================================================================

class StorageManager implements IStorageManager {
    private provider: IStorageProvider | null = null;
    private listeners: Set<StorageEventListener> = new Set();
    private projectStructures: Map<string, ProjectStructure> = new Map();
    private syncInProgress: Set<string> = new Set();
    
    constructor() {
        this.loadProjectStructures();
    }
    
    // ========================================================================
    // Provider Management
    // ========================================================================
    
    getProvider(): IStorageProvider | null {
        return this.provider;
    }
    
    async setProvider(type: StorageProviderType, config?: Partial<StorageConfig>): Promise<void> {
        switch (type) {
            case 'google-drive':
                this.provider = googleDriveStorage;
                break;
            case 'none':
                this.provider = null;
                break;
            case 's3':
            case 'azure-blob':
            case 'local':
                // Future implementations
                console.warn(`[StorageManager] Provider ${type} not yet implemented`);
                this.provider = null;
                break;
            default:
                this.provider = null;
        }
        
        if (this.provider) {
            await this.provider.initialize();
        }
        
        // Save config
        localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify({ type, config }));
    }
    
    async initializeFromSaved(): Promise<boolean> {
        const saved = localStorage.getItem(STORAGE_CONFIG_KEY);
        if (!saved) return false;
        
        try {
            const { type, config } = JSON.parse(saved);
            await this.setProvider(type, config);
            return true;
        } catch (e) {
            console.warn('[StorageManager] Failed to restore saved provider:', e);
            return false;
        }
    }
    
    // ========================================================================
    // Convenience Methods
    // ========================================================================
    
    isAuthenticated(): boolean {
        return this.provider?.isAuthenticated() ?? false;
    }
    
    async authenticate(): Promise<StorageAuthState> {
        if (!this.provider) {
            throw new Error('No storage provider configured');
        }
        
        const authState = await this.provider.authenticate();
        
        this.emit({
            type: 'auth:changed',
            provider: this.provider.type,
            data: authState,
            timestamp: Date.now(),
        });
        
        return authState;
    }
    
    async restoreSession(): Promise<StorageAuthState | null> {
        if (!this.provider) {
            // Try to initialize from saved config
            await this.initializeFromSaved();
        }
        
        if (!this.provider) {
            return null;
        }
        
        const authState = await this.provider.restoreSession();
        
        if (authState) {
            this.emit({
                type: 'auth:changed',
                provider: this.provider.type,
                data: authState,
                timestamp: Date.now(),
            });
        }
        
        return authState;
    }
    
    async signOut(): Promise<void> {
        if (this.provider) {
            await this.provider.signOut();
            
            this.emit({
                type: 'auth:changed',
                provider: this.provider.type,
                data: null,
                timestamp: Date.now(),
            });
        }
    }
    
    enableMockMode(): void {
        if (this.provider) {
            this.provider.enableMockMode();
        }
    }
    
    isMockMode(): boolean {
        return this.provider?.isMockMode() ?? true;
    }
    
    // ========================================================================
    // Project Structure Management
    // ========================================================================
    
    getProjectStructure(projectId: string): ProjectStructure | null {
        return this.projectStructures.get(projectId) || null;
    }
    
    setProjectStructure(projectId: string, structure: ProjectStructure): void {
        this.projectStructures.set(projectId, structure);
        this.saveProjectStructures();
    }
    
    private loadProjectStructures(): void {
        const saved = localStorage.getItem(PROJECT_STRUCTURES_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.projectStructures = new Map(Object.entries(parsed));
            } catch (e) {
                this.projectStructures = new Map();
            }
        }
    }
    
    private saveProjectStructures(): void {
        const obj = Object.fromEntries(this.projectStructures);
        localStorage.setItem(PROJECT_STRUCTURES_KEY, JSON.stringify(obj));
    }
    
    // ========================================================================
    // Sync Operations
    // ========================================================================
    
    async createProjectInStorage(project: Project): Promise<ProjectStructure | null> {
        if (!this.provider || !this.provider.isAuthenticated()) {
            return null;
        }
        
        try {
            const structure = await this.provider.createProjectStructure(project.title);
            this.setProjectStructure(project.id, structure);
            
            // Save initial project data
            await this.provider.saveProject(project, structure);
            
            return structure;
        } catch (e) {
            console.error('[StorageManager] Failed to create project in storage:', e);
            return null;
        }
    }
    
    async syncProject(project: Project): Promise<void> {
        if (!this.provider || !this.provider.isAuthenticated()) {
            return;
        }
        
        // Prevent concurrent syncs for same project
        if (this.syncInProgress.has(project.id)) {
            return;
        }
        
        this.syncInProgress.add(project.id);
        
        this.emit({
            type: 'sync:started',
            provider: this.provider.type,
            data: { projectId: project.id },
            timestamp: Date.now(),
        });
        
        try {
            let structure = this.getProjectStructure(project.id);
            
            // Create structure if not exists
            if (!structure) {
                structure = await this.createProjectInStorage(project);
            }
            
            if (structure) {
                await this.provider.saveProject(project, structure);
                
                this.emit({
                    type: 'sync:completed',
                    provider: this.provider.type,
                    data: { projectId: project.id },
                    timestamp: Date.now(),
                });
            }
        } catch (e: any) {
            this.emit({
                type: 'sync:failed',
                provider: this.provider.type,
                data: { projectId: project.id },
                error: e,
                timestamp: Date.now(),
            });
        } finally {
            this.syncInProgress.delete(project.id);
        }
    }
    
    async loadProjects(): Promise<Project[]> {
        if (!this.provider || !this.provider.isAuthenticated()) {
            return [];
        }
        
        try {
            const projectList = await this.provider.listProjects();
            const projects: Project[] = [];
            
            for (const projectInfo of projectList) {
                // Find or reconstruct structure
                let structure = this.getProjectStructure(projectInfo.id);
                
                if (!structure) {
                    // Need to find the project.json file
                    const dbFileId = await this.findProjectDataFile(projectInfo.id);
                    if (dbFileId) {
                        structure = {
                            appDataId: '',
                            rootId: '',
                            projectId: projectInfo.id,
                            dbFileId,
                            folders: {},
                        };
                        this.setProjectStructure(projectInfo.id, structure);
                    }
                }
                
                if (structure) {
                    const project = await this.provider.loadProject(projectInfo.id, structure);
                    if (project) {
                        projects.push(project);
                    }
                }
            }
            
            return projects;
        } catch (e) {
            console.error('[StorageManager] Failed to load projects:', e);
            return [];
        }
    }
    
    private async findProjectDataFile(projectFolderId: string): Promise<string | null> {
        if (!this.provider) return null;
        
        try {
            const files = await this.provider.listFiles(projectFolderId);
            const projectFile = files.find(f => f.name === 'project.json');
            return projectFile?.id || null;
        } catch (e) {
            return null;
        }
    }
    
    async uploadMedia(
        projectId: string, 
        assetId: string, 
        mediaUrl: string
    ): Promise<string | null> {
        if (!this.provider || !this.provider.isAuthenticated()) {
            return null;
        }
        
        const structure = this.getProjectStructure(projectId);
        if (!structure) return null;
        
        try {
            this.emit({
                type: 'upload:progress',
                provider: this.provider.type,
                data: { projectId, assetId, progress: 0 },
                timestamp: Date.now(),
            });
            
            const driveUrl = await this.provider.uploadAssetMedia(assetId, mediaUrl, structure);
            
            this.emit({
                type: 'upload:completed',
                provider: this.provider.type,
                data: { projectId, assetId, url: driveUrl },
                timestamp: Date.now(),
            });
            
            return driveUrl;
        } catch (e: any) {
            this.emit({
                type: 'upload:failed',
                provider: this.provider.type,
                data: { projectId, assetId },
                error: e,
                timestamp: Date.now(),
            });
            return null;
        }
    }
    
    // ========================================================================
    // Events
    // ========================================================================
    
    addEventListener(listener: StorageEventListener): void {
        this.listeners.add(listener);
    }
    
    removeEventListener(listener: StorageEventListener): void {
        this.listeners.delete(listener);
    }
    
    private emit(event: StorageEvent): void {
        this.listeners.forEach(listener => {
            try {
                listener(event);
            } catch (e) {
                console.error('[StorageManager] Event listener error:', e);
            }
        });
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const storageManager = new StorageManager();
