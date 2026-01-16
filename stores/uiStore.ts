/**
 * UI Store
 * 
 * Zustand store for managing UI state:
 * - View modes (node/gallery)
 * - Modal visibility
 * - Selected elements
 * - Sidebar state
 * - Transient UI state
 * 
 * Does NOT persist to localStorage as UI state resets each session.
 */

import { create } from 'zustand';
import { DepartmentType } from '../types';

// ============================================================================
// Types
// ============================================================================

export type ViewMode = 'node' | 'gallery';
export type ModalType = 
    | 'settings' 
    | 'oneshot' 
    | 'createProject' 
    | 'assetEditor'
    | 'styleSelector'
    | 'confirm'
    | null;

interface ConfirmModalConfig {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning' | 'default';
    onConfirm: () => void;
    onCancel?: () => void;
}

interface UIState {
    // View state
    viewMode: ViewMode;
    currentDepartment: DepartmentType | null;
    
    // Selection state
    selectedAssetId: string | null;
    selectedNodeIds: string[];
    hoveredNodeId: string | null;
    
    // Modal state
    activeModal: ModalType;
    modalData: Record<string, any>;
    confirmConfig: ConfirmModalConfig | null;
    
    // Sidebar state
    isSidebarCollapsed: boolean;
    sidebarWidth: number;
    
    // Panel state
    isRenderQueueOpen: boolean;
    isAssetEditorOpen: boolean;
    isChatBotOpen: boolean;
    
    // Canvas state
    canvasZoom: number;
    canvasPan: { x: number; y: number };
    isCanvasDragging: boolean;
    
    // Notification/toast state (simple)
    notification: { message: string; type: 'success' | 'error' | 'info' } | null;
    
    // View actions
    setViewMode: (mode: ViewMode) => void;
    setCurrentDepartment: (department: DepartmentType | null) => void;
    toggleViewMode: () => void;
    
    // Selection actions
    setSelectedAssetId: (id: string | null) => void;
    setSelectedNodeIds: (ids: string[]) => void;
    addSelectedNodeId: (id: string) => void;
    removeSelectedNodeId: (id: string) => void;
    clearSelection: () => void;
    setHoveredNodeId: (id: string | null) => void;
    
    // Modal actions
    openModal: (modal: ModalType, data?: Record<string, any>) => void;
    closeModal: () => void;
    showConfirm: (config: ConfirmModalConfig) => void;
    hideConfirm: () => void;
    
    // Sidebar actions
    toggleSidebar: () => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    setSidebarWidth: (width: number) => void;
    
    // Panel actions
    toggleRenderQueue: () => void;
    setRenderQueueOpen: (open: boolean) => void;
    toggleAssetEditor: () => void;
    setAssetEditorOpen: (open: boolean) => void;
    toggleChatBot: () => void;
    setChatBotOpen: (open: boolean) => void;
    
    // Canvas actions
    setCanvasZoom: (zoom: number) => void;
    setCanvasPan: (pan: { x: number; y: number }) => void;
    setCanvasDragging: (dragging: boolean) => void;
    resetCanvasView: () => void;
    
    // Notification actions
    showNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
    clearNotification: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SIDEBAR_WIDTH = 280;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

// ============================================================================
// Store
// ============================================================================

export const useUIStore = create<UIState>()((set, get) => ({
    // Initial state
    viewMode: 'node',
    currentDepartment: null,
    
    selectedAssetId: null,
    selectedNodeIds: [],
    hoveredNodeId: null,
    
    activeModal: null,
    modalData: {},
    confirmConfig: null,
    
    isSidebarCollapsed: false,
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    
    isRenderQueueOpen: false,
    isAssetEditorOpen: false,
    isChatBotOpen: false,
    
    canvasZoom: 1,
    canvasPan: { x: 0, y: 0 },
    isCanvasDragging: false,
    
    notification: null,
    
    // ========================================================================
    // View Actions
    // ========================================================================
    
    setViewMode: (mode) => set({ viewMode: mode }),
    
    setCurrentDepartment: (department) => set({ 
        currentDepartment: department,
        // Clear asset selection when changing departments
        selectedAssetId: null,
    }),
    
    toggleViewMode: () => set(state => ({ 
        viewMode: state.viewMode === 'node' ? 'gallery' : 'node' 
    })),
    
    // ========================================================================
    // Selection Actions
    // ========================================================================
    
    setSelectedAssetId: (id) => set({ selectedAssetId: id }),
    
    setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),
    
    addSelectedNodeId: (id) => set(state => ({
        selectedNodeIds: state.selectedNodeIds.includes(id) 
            ? state.selectedNodeIds 
            : [...state.selectedNodeIds, id]
    })),
    
    removeSelectedNodeId: (id) => set(state => ({
        selectedNodeIds: state.selectedNodeIds.filter(nodeId => nodeId !== id)
    })),
    
    clearSelection: () => set({ 
        selectedNodeIds: [], 
        selectedAssetId: null 
    }),
    
    setHoveredNodeId: (id) => set({ hoveredNodeId: id }),
    
    // ========================================================================
    // Modal Actions
    // ========================================================================
    
    openModal: (modal, data = {}) => set({ 
        activeModal: modal, 
        modalData: data 
    }),
    
    closeModal: () => set({ 
        activeModal: null, 
        modalData: {} 
    }),
    
    showConfirm: (config) => set({ 
        activeModal: 'confirm',
        confirmConfig: config 
    }),
    
    hideConfirm: () => set({ 
        activeModal: null,
        confirmConfig: null 
    }),
    
    // ========================================================================
    // Sidebar Actions
    // ========================================================================
    
    toggleSidebar: () => set(state => ({ 
        isSidebarCollapsed: !state.isSidebarCollapsed 
    })),
    
    setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
    
    setSidebarWidth: (width) => set({ 
        sidebarWidth: Math.max(200, Math.min(500, width)) 
    }),
    
    // ========================================================================
    // Panel Actions
    // ========================================================================
    
    toggleRenderQueue: () => set(state => ({ 
        isRenderQueueOpen: !state.isRenderQueueOpen 
    })),
    
    setRenderQueueOpen: (open) => set({ isRenderQueueOpen: open }),
    
    toggleAssetEditor: () => set(state => ({ 
        isAssetEditorOpen: !state.isAssetEditorOpen 
    })),
    
    setAssetEditorOpen: (open) => set({ isAssetEditorOpen: open }),
    
    toggleChatBot: () => set(state => ({ 
        isChatBotOpen: !state.isChatBotOpen 
    })),
    
    setChatBotOpen: (open) => set({ isChatBotOpen: open }),
    
    // ========================================================================
    // Canvas Actions
    // ========================================================================
    
    setCanvasZoom: (zoom) => set({ 
        canvasZoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) 
    }),
    
    setCanvasPan: (pan) => set({ canvasPan: pan }),
    
    setCanvasDragging: (dragging) => set({ isCanvasDragging: dragging }),
    
    resetCanvasView: () => set({ 
        canvasZoom: 1, 
        canvasPan: { x: 0, y: 0 } 
    }),
    
    // ========================================================================
    // Notification Actions
    // ========================================================================
    
    showNotification: (message, type = 'info') => {
        set({ notification: { message, type } });
        
        // Auto-clear after 5 seconds
        setTimeout(() => {
            const { notification } = get();
            if (notification?.message === message) {
                set({ notification: null });
            }
        }, 5000);
    },
    
    clearNotification: () => set({ notification: null }),
}));

// ============================================================================
// Selector Hooks
// ============================================================================

export const useViewMode = () => useUIStore(state => state.viewMode);
export const useCurrentDepartment = () => useUIStore(state => state.currentDepartment);
export const useSelectedAssetId = () => useUIStore(state => state.selectedAssetId);
export const useSelectedNodeIds = () => useUIStore(state => state.selectedNodeIds);
export const useActiveModal = () => useUIStore(state => state.activeModal);
export const useModalData = () => useUIStore(state => state.modalData);
export const useNotification = () => useUIStore(state => state.notification);

// Compound selectors
export const useIsModalOpen = (modal: ModalType) => 
    useUIStore(state => state.activeModal === modal);

export const useCanvasState = () => 
    useUIStore(state => ({
        zoom: state.canvasZoom,
        pan: state.canvasPan,
        isDragging: state.isCanvasDragging,
    }));

export const usePanelStates = () =>
    useUIStore(state => ({
        isRenderQueueOpen: state.isRenderQueueOpen,
        isAssetEditorOpen: state.isAssetEditorOpen,
        isChatBotOpen: state.isChatBotOpen,
    }));

export default useUIStore;
