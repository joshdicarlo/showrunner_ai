/**
 * ProjectProvider.tsx
 * 
 * Centralizes all project-related state management including:
 * - Projects list and current project selection
 * - Assets and nodes management
 * - CRUD operations for projects, assets, and nodes
 * 
 * This provider eliminates the need to pass project-related props through
 * multiple component layers.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { 
    Project, ProjectAsset, FlowNode, FlowConnection, DepartmentType, 
    NodeType, ProjectSettings 
} from '../types';
import { DEFAULT_PROJECT_SETTINGS } from '../constants';

// ============================================================================
// Types
// ============================================================================

interface ProjectContextType {
    // State
    projects: Project[];
    currentProjectId: string | null;
    activeProject: Project | null;
    
    // Project operations
    setCurrentProjectId: (id: string | null) => void;
    createProject: (project: Omit<Project, 'id' | 'updatedAt'>) => Project;
    updateProject: (id: string, updates: Partial<Project>) => void;
    deleteProject: (id: string) => void;
    
    // Asset operations
    createAsset: (asset: Omit<ProjectAsset, 'id'>) => ProjectAsset;
    updateAsset: (assetId: string, updates: Partial<ProjectAsset>) => void;
    deleteAsset: (assetId: string) => void;
    archiveAsset: (assetId: string) => void;
    restoreAsset: (assetId: string) => void;
    
    // Node operations
    setNodes: (value: React.SetStateAction<FlowNode[]>) => void;
    updateNode: (nodeId: string, data: Partial<FlowNode['data']>) => void;
    deleteNode: (nodeId: string) => void;
    addNodes: (nodes: FlowNode[]) => void;
    
    // Connection operations
    setConnections: (value: React.SetStateAction<FlowConnection[]>) => void;
    
    // Settings
    updateSettings: (settings: ProjectSettings) => void;
    
    // Refs for callbacks (stable references)
    projectsRef: React.MutableRefObject<Project[]>;
    currentProjectIdRef: React.MutableRefObject<string | null>;
    
    // Derived data
    assetThumbnails: Record<string, string>;
    refinedImagesMap: Record<string, string[]>;
    approvedImagesMap: Record<string, string[]>;
}

// ============================================================================
// Context
// ============================================================================

const ProjectContext = createContext<ProjectContextType | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface ProjectProviderProps {
    children: React.ReactNode;
    initialProjects?: Project[];
    onProjectsChange?: (projects: Project[]) => void;
}

export const ProjectProvider: React.FC<ProjectProviderProps> = ({ 
    children, 
    initialProjects = [],
    onProjectsChange 
}) => {
    // State
    const [projects, setProjects] = useState<Project[]>(initialProjects);
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
    
    // Stable refs for callbacks
    const projectsRef = useRef(projects);
    const currentProjectIdRef = useRef(currentProjectId);
    
    // Keep refs in sync
    useEffect(() => {
        projectsRef.current = projects;
        onProjectsChange?.(projects);
    }, [projects, onProjectsChange]);
    
    useEffect(() => {
        currentProjectIdRef.current = currentProjectId;
    }, [currentProjectId]);
    
    // Derived state
    const activeProject = useMemo(() => 
        projects.find(p => p.id === currentProjectId) || null,
        [projects, currentProjectId]
    );
    
    // Asset thumbnails derived from approved nodes
    const assetThumbnails = useMemo(() => {
        if (!activeProject) return {};
        const thumbnails: Record<string, string> = {};
        
        for (const asset of activeProject.assets) {
            if (asset.thumbnailUrl) {
                thumbnails[asset.id] = asset.thumbnailUrl;
            } else {
                // Find first approved image node for this asset
                const approvedNode = activeProject.nodes.find(n => 
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
    }, [activeProject]);
    
    // Refined images map (images marked for refinement)
    const refinedImagesMap = useMemo(() => {
        if (!activeProject) return {};
        const map: Record<string, string[]> = {};
        
        activeProject.nodes
            .filter(n => n.type === NodeType.AI_IMAGE_GEN && n.data.tag === 'refinement' && n.data.imageUrl)
            .forEach(n => {
                if (!n.assetId) return;
                if (!map[n.assetId]) map[n.assetId] = [];
                map[n.assetId].push(n.data.imageUrl!);
            });
        
        return map;
    }, [activeProject]);
    
    // Approved images map
    const approvedImagesMap = useMemo(() => {
        if (!activeProject) return {};
        const map: Record<string, string[]> = {};
        
        activeProject.nodes
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
    }, [activeProject]);
    
    // ========================================================================
    // Project Operations
    // ========================================================================
    
    const createProject = useCallback((projectData: Omit<Project, 'id' | 'updatedAt'>): Project => {
        const now = new Date();
        const newProject: Project = {
            ...projectData,
            id: `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            updatedAt: now,
        };
        
        setProjects(prev => [...prev, newProject]);
        return newProject;
    }, []);
    
    const updateProject = useCallback((id: string, updates: Partial<Project>) => {
        setProjects(prev => prev.map(p => 
            p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p
        ));
    }, []);
    
    const deleteProject = useCallback((id: string) => {
        setProjects(prev => prev.filter(p => p.id !== id));
        if (currentProjectId === id) {
            setCurrentProjectId(null);
        }
    }, [currentProjectId]);
    
    // ========================================================================
    // Asset Operations
    // ========================================================================
    
    const createAsset = useCallback((assetData: Omit<ProjectAsset, 'id'>): ProjectAsset => {
        const newAsset: ProjectAsset = {
            ...assetData,
            id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        };
        
        setProjects(prev => prev.map(p => {
            if (p.id === currentProjectIdRef.current) {
                return { ...p, assets: [...p.assets, newAsset], updatedAt: new Date() };
            }
            return p;
        }));
        
        return newAsset;
    }, []);
    
    const updateAsset = useCallback((assetId: string, updates: Partial<ProjectAsset>) => {
        setProjects(prev => prev.map(p => {
            if (p.id === currentProjectIdRef.current) {
                return {
                    ...p,
                    assets: p.assets.map(a => a.id === assetId ? { ...a, ...updates } : a),
                    updatedAt: new Date()
                };
            }
            return p;
        }));
    }, []);
    
    const deleteAsset = useCallback((assetId: string) => {
        setProjects(prev => prev.map(p => {
            if (p.id === currentProjectIdRef.current) {
                return {
                    ...p,
                    assets: p.assets.filter(a => a.id !== assetId),
                    nodes: p.nodes.filter(n => n.assetId !== assetId),
                    updatedAt: new Date()
                };
            }
            return p;
        }));
    }, []);
    
    const archiveAsset = useCallback((assetId: string) => {
        updateAsset(assetId, { status: 'archived' });
    }, [updateAsset]);
    
    const restoreAsset = useCallback((assetId: string) => {
        updateAsset(assetId, { status: 'active' });
    }, [updateAsset]);
    
    // ========================================================================
    // Node Operations
    // ========================================================================
    
    const setNodes = useCallback((value: React.SetStateAction<FlowNode[]>) => {
        setProjects(prev => prev.map(p => {
            if (p.id === currentProjectIdRef.current) {
                const newNodes = typeof value === 'function' ? value(p.nodes) : value;
                return { ...p, nodes: newNodes, updatedAt: new Date() };
            }
            return p;
        }));
    }, []);
    
    const updateNode = useCallback((nodeId: string, data: Partial<FlowNode['data']>) => {
        setProjects(prev => prev.map(p => {
            if (p.id === currentProjectIdRef.current) {
                return {
                    ...p,
                    nodes: p.nodes.map(n => 
                        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
                    ),
                    updatedAt: new Date()
                };
            }
            return p;
        }));
    }, []);
    
    const deleteNode = useCallback((nodeId: string) => {
        setProjects(prev => prev.map(p => {
            if (p.id === currentProjectIdRef.current) {
                return {
                    ...p,
                    nodes: p.nodes.filter(n => n.id !== nodeId),
                    connections: p.connections.filter(c => c.fromNode !== nodeId && c.toNode !== nodeId),
                    updatedAt: new Date()
                };
            }
            return p;
        }));
    }, []);
    
    const addNodes = useCallback((nodes: FlowNode[]) => {
        setProjects(prev => prev.map(p => {
            if (p.id === currentProjectIdRef.current) {
                return { ...p, nodes: [...p.nodes, ...nodes], updatedAt: new Date() };
            }
            return p;
        }));
    }, []);
    
    // ========================================================================
    // Connection Operations
    // ========================================================================
    
    const setConnections = useCallback((value: React.SetStateAction<FlowConnection[]>) => {
        setProjects(prev => prev.map(p => {
            if (p.id === currentProjectIdRef.current) {
                const newConnections = typeof value === 'function' ? value(p.connections) : value;
                return { ...p, connections: newConnections, updatedAt: new Date() };
            }
            return p;
        }));
    }, []);
    
    // ========================================================================
    // Settings Operations
    // ========================================================================
    
    const updateSettings = useCallback((settings: ProjectSettings) => {
        setProjects(prev => prev.map(p => {
            if (p.id === currentProjectIdRef.current) {
                return { ...p, settings, updatedAt: new Date() };
            }
            return p;
        }));
    }, []);
    
    // ========================================================================
    // Context Value
    // ========================================================================
    
    const value: ProjectContextType = useMemo(() => ({
        // State
        projects,
        currentProjectId,
        activeProject,
        
        // Project operations
        setCurrentProjectId,
        createProject,
        updateProject,
        deleteProject,
        
        // Asset operations
        createAsset,
        updateAsset,
        deleteAsset,
        archiveAsset,
        restoreAsset,
        
        // Node operations
        setNodes,
        updateNode,
        deleteNode,
        addNodes,
        
        // Connection operations
        setConnections,
        
        // Settings
        updateSettings,
        
        // Refs
        projectsRef,
        currentProjectIdRef,
        
        // Derived data
        assetThumbnails,
        refinedImagesMap,
        approvedImagesMap,
    }), [
        projects,
        currentProjectId,
        activeProject,
        createProject,
        updateProject,
        deleteProject,
        createAsset,
        updateAsset,
        deleteAsset,
        archiveAsset,
        restoreAsset,
        setNodes,
        updateNode,
        deleteNode,
        addNodes,
        setConnections,
        updateSettings,
        assetThumbnails,
        refinedImagesMap,
        approvedImagesMap,
    ]);
    
    return (
        <ProjectContext.Provider value={value}>
            {children}
        </ProjectContext.Provider>
    );
};

// ============================================================================
// Hook
// ============================================================================

export const useProject = (): ProjectContextType => {
    const context = useContext(ProjectContext);
    if (!context) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
};

// Selective hooks for performance optimization
export const useProjects = () => {
    const { projects, createProject, deleteProject } = useProject();
    return { projects, createProject, deleteProject };
};

export const useActiveProject = () => {
    const { activeProject, currentProjectId, setCurrentProjectId } = useProject();
    return { activeProject, currentProjectId, setCurrentProjectId };
};

export const useAssets = () => {
    const { activeProject, createAsset, updateAsset, deleteAsset, archiveAsset, restoreAsset, assetThumbnails } = useProject();
    return { 
        assets: activeProject?.assets || [], 
        createAsset, 
        updateAsset, 
        deleteAsset, 
        archiveAsset, 
        restoreAsset,
        assetThumbnails
    };
};

export const useNodes = () => {
    const { activeProject, setNodes, updateNode, deleteNode, addNodes } = useProject();
    return { 
        nodes: activeProject?.nodes || [], 
        setNodes, 
        updateNode, 
        deleteNode, 
        addNodes 
    };
};

export const useConnections = () => {
    const { activeProject, setConnections } = useProject();
    return { 
        connections: activeProject?.connections || [], 
        setConnections 
    };
};

export const useProjectSettings = () => {
    const { activeProject, updateSettings } = useProject();
    return { 
        settings: activeProject?.settings || DEFAULT_PROJECT_SETTINGS, 
        updateSettings 
    };
};

export default ProjectProvider;
