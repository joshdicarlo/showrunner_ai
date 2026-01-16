/**
 * Project Store
 * 
 * Zustand store for managing project state:
 * - Projects list
 * - Current project selection
 * - Assets and nodes
 * - CRUD operations
 * 
 * Uses persist middleware for localStorage backup.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { 
    Project, ProjectAsset, FlowNode, FlowConnection, 
    DepartmentType, NodeType, ProjectSettings 
} from '../types';
import { DEFAULT_PROJECT_SETTINGS } from '../constants';

// ============================================================================
// Types
// ============================================================================

interface ProjectState {
    // State
    projects: Project[];
    currentProjectId: string | null;
    
    // Computed (via getters)
    activeProject: () => Project | null;
    getAsset: (assetId: string) => ProjectAsset | undefined;
    getNode: (nodeId: string) => FlowNode | undefined;
    
    // Project actions
    setCurrentProjectId: (id: string | null) => void;
    createProject: (project: Omit<Project, 'id' | 'updatedAt'>) => Project;
    updateProject: (id: string, updates: Partial<Project>) => void;
    deleteProject: (id: string) => void;
    
    // Asset actions
    createAsset: (asset: Omit<ProjectAsset, 'id'>) => ProjectAsset;
    updateAsset: (assetId: string, updates: Partial<ProjectAsset>) => void;
    deleteAsset: (assetId: string) => void;
    archiveAsset: (assetId: string) => void;
    restoreAsset: (assetId: string) => void;
    
    // Node actions
    setNodes: (nodes: FlowNode[]) => void;
    addNode: (node: FlowNode) => void;
    addNodes: (nodes: FlowNode[]) => void;
    updateNode: (nodeId: string, data: Partial<FlowNode['data']>) => void;
    updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
    deleteNode: (nodeId: string) => void;
    deleteNodes: (nodeIds: string[]) => void;
    
    // Connection actions
    setConnections: (connections: FlowConnection[]) => void;
    addConnection: (connection: FlowConnection) => void;
    deleteConnection: (connectionId: string) => void;
    
    // Settings actions
    updateSettings: (settings: ProjectSettings) => void;
    
    // Derived data helpers
    getAssetThumbnails: () => Record<string, string>;
    getRefinedImagesMap: () => Record<string, string[]>;
    getApprovedImagesMap: () => Record<string, string[]>;
    
    // Bulk operations
    importProjects: (projects: Project[]) => void;
    clearAllProjects: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

const generateId = (prefix: string) => 
    `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Custom serializer to handle Date objects
const dateReviver = (_key: string, value: any) => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        return new Date(value);
    }
    return value;
};

// ============================================================================
// Store
// ============================================================================

export const useProjectStore = create<ProjectState>()(
    persist(
        (set, get) => ({
            // Initial state
            projects: [],
            currentProjectId: null,
            
            // ================================================================
            // Computed Getters
            // ================================================================
            
            activeProject: () => {
                const { projects, currentProjectId } = get();
                return projects.find(p => p.id === currentProjectId) || null;
            },
            
            getAsset: (assetId: string) => {
                const project = get().activeProject();
                return project?.assets.find(a => a.id === assetId);
            },
            
            getNode: (nodeId: string) => {
                const project = get().activeProject();
                return project?.nodes.find(n => n.id === nodeId);
            },
            
            // ================================================================
            // Project Actions
            // ================================================================
            
            setCurrentProjectId: (id) => set({ currentProjectId: id }),
            
            createProject: (projectData) => {
                const newProject: Project = {
                    ...projectData,
                    id: generateId('project'),
                    updatedAt: new Date(),
                    settings: projectData.settings || DEFAULT_PROJECT_SETTINGS,
                };
                
                set(state => ({
                    projects: [...state.projects, newProject]
                }));
                
                return newProject;
            },
            
            updateProject: (id, updates) => {
                set(state => ({
                    projects: state.projects.map(p => 
                        p.id === id 
                            ? { ...p, ...updates, updatedAt: new Date() }
                            : p
                    )
                }));
            },
            
            deleteProject: (id) => {
                set(state => ({
                    projects: state.projects.filter(p => p.id !== id),
                    currentProjectId: state.currentProjectId === id ? null : state.currentProjectId
                }));
            },
            
            // ================================================================
            // Asset Actions
            // ================================================================
            
            createAsset: (assetData) => {
                const newAsset: ProjectAsset = {
                    ...assetData,
                    id: generateId('asset'),
                };
                
                set(state => ({
                    projects: state.projects.map(p => {
                        if (p.id === state.currentProjectId) {
                            return {
                                ...p,
                                assets: [...p.assets, newAsset],
                                updatedAt: new Date()
                            };
                        }
                        return p;
                    })
                }));
                
                return newAsset;
            },
            
            updateAsset: (assetId, updates) => {
                set(state => ({
                    projects: state.projects.map(p => {
                        if (p.id === state.currentProjectId) {
                            return {
                                ...p,
                                assets: p.assets.map(a => 
                                    a.id === assetId ? { ...a, ...updates } : a
                                ),
                                updatedAt: new Date()
                            };
                        }
                        return p;
                    })
                }));
            },
            
            deleteAsset: (assetId) => {
                set(state => ({
                    projects: state.projects.map(p => {
                        if (p.id === state.currentProjectId) {
                            return {
                                ...p,
                                assets: p.assets.filter(a => a.id !== assetId),
                                nodes: p.nodes.filter(n => n.assetId !== assetId),
                                updatedAt: new Date()
                            };
                        }
                        return p;
                    })
                }));
            },
            
            archiveAsset: (assetId) => {
                get().updateAsset(assetId, { status: 'archived' });
            },
            
            restoreAsset: (assetId) => {
                get().updateAsset(assetId, { status: 'active' });
            },
            
            // ================================================================
            // Node Actions
            // ================================================================
            
            setNodes: (nodes) => {
                set(state => ({
                    projects: state.projects.map(p => {
                        if (p.id === state.currentProjectId) {
                            return { ...p, nodes, updatedAt: new Date() };
                        }
                        return p;
                    })
                }));
            },
            
            addNode: (node) => {
                set(state => ({
                    projects: state.projects.map(p => {
                        if (p.id === state.currentProjectId) {
                            return {
                                ...p,
                                nodes: [...p.nodes, node],
                                updatedAt: new Date()
                            };
                        }
                        return p;
                    })
                }));
            },
            
            addNodes: (nodes) => {
                set(state => ({
                    projects: state.projects.map(p => {
                        if (p.id === state.currentProjectId) {
                            return {
                                ...p,
                                nodes: [...p.nodes, ...nodes],
                                updatedAt: new Date()
                            };
                        }
                        return p;
                    })
                }));
            },
            
            updateNode: (nodeId, data) => {
                set(state => ({
                    projects: state.projects.map(p => {
                        if (p.id === state.currentProjectId) {
                            return {
                                ...p,
                                nodes: p.nodes.map(n => 
                                    n.id === nodeId 
                                        ? { ...n, data: { ...n.data, ...data } }
                                        : n
                                ),
                                updatedAt: new Date()
                            };
                        }
                        return p;
                    })
                }));
            },
            
            updateNodePosition: (nodeId, position) => {
                set(state => ({
                    projects: state.projects.map(p => {
                        if (p.id === state.currentProjectId) {
                            return {
                                ...p,
                                nodes: p.nodes.map(n => 
                                    n.id === nodeId ? { ...n, position } : n
                                ),
                                updatedAt: new Date()
                            };
                        }
                        return p;
                    })
                }));
            },
            
            deleteNode: (nodeId) => {
                set(state => ({
                    projects: state.projects.map(p => {
                        if (p.id === state.currentProjectId) {
                            return {
                                ...p,
                                nodes: p.nodes.filter(n => n.id !== nodeId),
                                connections: p.connections.filter(
                                    c => c.fromNode !== nodeId && c.toNode !== nodeId
                                ),
                                updatedAt: new Date()
                            };
                        }
                        return p;
                    })
                }));
            },
            
            deleteNodes: (nodeIds) => {
                const nodeIdSet = new Set(nodeIds);
                set(state => ({
                    projects: state.projects.map(p => {
                        if (p.id === state.currentProjectId) {
                            return {
                                ...p,
                                nodes: p.nodes.filter(n => !nodeIdSet.has(n.id)),
                                connections: p.connections.filter(
                                    c => !nodeIdSet.has(c.fromNode) && !nodeIdSet.has(c.toNode)
                                ),
                                updatedAt: new Date()
                            };
                        }
                        return p;
                    })
                }));
            },
            
            // ================================================================
            // Connection Actions
            // ================================================================
            
            setConnections: (connections) => {
                set(state => ({
                    projects: state.projects.map(p => {
                        if (p.id === state.currentProjectId) {
                            return { ...p, connections, updatedAt: new Date() };
                        }
                        return p;
                    })
                }));
            },
            
            addConnection: (connection) => {
                set(state => ({
                    projects: state.projects.map(p => {
                        if (p.id === state.currentProjectId) {
                            return {
                                ...p,
                                connections: [...p.connections, connection],
                                updatedAt: new Date()
                            };
                        }
                        return p;
                    })
                }));
            },
            
            deleteConnection: (connectionId) => {
                set(state => ({
                    projects: state.projects.map(p => {
                        if (p.id === state.currentProjectId) {
                            return {
                                ...p,
                                connections: p.connections.filter(c => c.id !== connectionId),
                                updatedAt: new Date()
                            };
                        }
                        return p;
                    })
                }));
            },
            
            // ================================================================
            // Settings Actions
            // ================================================================
            
            updateSettings: (settings) => {
                set(state => ({
                    projects: state.projects.map(p => {
                        if (p.id === state.currentProjectId) {
                            return { ...p, settings, updatedAt: new Date() };
                        }
                        return p;
                    })
                }));
            },
            
            // ================================================================
            // Derived Data Helpers
            // ================================================================
            
            getAssetThumbnails: () => {
                const project = get().activeProject();
                if (!project) return {};
                
                const thumbnails: Record<string, string> = {};
                
                for (const asset of project.assets) {
                    if (asset.thumbnailUrl) {
                        thumbnails[asset.id] = asset.thumbnailUrl;
                    } else {
                        // Find first approved image node for this asset
                        const approvedNode = project.nodes.find(n => 
                            n.assetId === asset.id && 
                            n.type === NodeType.AI_IMAGE_GEN && 
                            n.data.status === 'approved' && 
                            n.data.imageUrl
                        );
                        if (approvedNode?.data.imageUrl) {
                            thumbnails[asset.id] = approvedNode.data.imageUrl;
                        }
                    }
                }
                
                return thumbnails;
            },
            
            getRefinedImagesMap: () => {
                const project = get().activeProject();
                if (!project) return {};
                
                const map: Record<string, string[]> = {};
                
                project.nodes
                    .filter(n => 
                        n.type === NodeType.AI_IMAGE_GEN && 
                        n.data.tag === 'refinement' && 
                        n.data.imageUrl
                    )
                    .forEach(n => {
                        if (!n.assetId) return;
                        if (!map[n.assetId]) map[n.assetId] = [];
                        map[n.assetId].push(n.data.imageUrl!);
                    });
                
                return map;
            },
            
            getApprovedImagesMap: () => {
                const project = get().activeProject();
                if (!project) return {};
                
                const map: Record<string, string[]> = {};
                
                project.nodes
                    .filter(n => 
                        n.type === NodeType.AI_IMAGE_GEN && 
                        n.data.status === 'approved' && 
                        n.data.imageUrl &&
                        n.data.tag !== 'refinement'
                    )
                    .forEach(n => {
                        if (!n.assetId) return;
                        if (!map[n.assetId]) map[n.assetId] = [];
                        map[n.assetId].push(n.data.imageUrl!);
                    });
                
                return map;
            },
            
            // ================================================================
            // Bulk Operations
            // ================================================================
            
            importProjects: (projects) => {
                set(state => ({
                    projects: [...state.projects, ...projects]
                }));
            },
            
            clearAllProjects: () => {
                set({ projects: [], currentProjectId: null });
            },
        }),
        {
            name: 'showrunner-projects',
            storage: createJSONStorage(() => localStorage, {
                reviver: dateReviver,
            }),
            partialize: (state) => ({
                projects: state.projects,
                currentProjectId: state.currentProjectId,
            }),
        }
    )
);

// ============================================================================
// Selector Hooks (for performance optimization)
// ============================================================================

export const useProjects = () => useProjectStore(state => state.projects);
export const useCurrentProjectId = () => useProjectStore(state => state.currentProjectId);
export const useActiveProject = () => useProjectStore(state => state.activeProject());

// Subscribe to specific project updates
export const useProjectAssets = () => {
    const project = useProjectStore(state => state.activeProject());
    return project?.assets || [];
};

export const useProjectNodes = () => {
    const project = useProjectStore(state => state.activeProject());
    return project?.nodes || [];
};

export const useProjectConnections = () => {
    const project = useProjectStore(state => state.activeProject());
    return project?.connections || [];
};

export const useProjectSettings = () => {
    const project = useProjectStore(state => state.activeProject());
    return project?.settings || DEFAULT_PROJECT_SETTINGS;
};

export default useProjectStore;
