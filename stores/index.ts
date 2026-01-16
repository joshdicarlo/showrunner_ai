/**
 * Stores Index
 * 
 * Central export point for all Zustand stores.
 * Import stores and hooks from this file for consistent access.
 */

// ============================================================================
// Store Exports
// ============================================================================

export { 
    useProjectStore, 
    default as projectStore,
    // Selector hooks
    useProjects,
    useCurrentProjectId,
    useActiveProject,
    useProjectAssets,
    useProjectNodes,
    useProjectConnections,
    useProjectSettings,
} from './projectStore';

export { 
    useQueueStore, 
    default as queueStore,
    // Types
    type TaskStatus,
    // Selector hooks
    useQueue,
    useIsProcessing,
    useIsPaused,
    useQueueStats,
    useAssetQueueStatus,
} from './queueStore';

export { 
    useUIStore, 
    default as uiStore,
    // Types
    type ViewMode,
    type ModalType,
    // Selector hooks
    useViewMode,
    useCurrentDepartment,
    useSelectedAssetId,
    useSelectedNodeIds,
    useActiveModal,
    useModalData,
    useNotification,
    useIsModalOpen,
    useCanvasState,
    usePanelStates,
} from './uiStore';

export { 
    useSettingsStore, 
    default as settingsStore,
    // Selector hooks
    useApiKeys,
    useGenerationDefaults,
    usePreferences,
    useDriveSettings,
    useGeminiApiKey,
    useLumaApiKey,
    useTheme,
    useConcurrentGenerations,
    useIsDriveConnected,
    useDriveUserEmail,
} from './settingsStore';

// ============================================================================
// Combined Store Actions (for complex operations spanning multiple stores)
// ============================================================================

import { useProjectStore } from './projectStore';
import { useUIStore } from './uiStore';
import { useQueueStore } from './queueStore';

/**
 * Select an asset and optionally open the asset editor
 */
export const selectAssetWithEditor = (assetId: string, openEditor = false) => {
    useUIStore.getState().setSelectedAssetId(assetId);
    if (openEditor) {
        useUIStore.getState().setAssetEditorOpen(true);
    }
};

/**
 * Delete an asset with confirmation and cleanup
 */
export const deleteAssetWithCleanup = (assetId: string) => {
    const { selectedAssetId, setSelectedAssetId, setAssetEditorOpen } = useUIStore.getState();
    const { deleteAsset } = useProjectStore.getState();
    
    // Clear selection if deleting the selected asset
    if (selectedAssetId === assetId) {
        setSelectedAssetId(null);
        setAssetEditorOpen(false);
    }
    
    // Remove from project
    deleteAsset(assetId);
};

/**
 * Clear all state (for logout or reset)
 */
export const resetAllStores = () => {
    useProjectStore.getState().clearAllProjects();
    useQueueStore.getState().clearQueue();
    useUIStore.getState().clearSelection();
    useUIStore.getState().closeModal();
};

/**
 * Switch projects and update UI accordingly
 */
export const switchProject = (projectId: string | null) => {
    const { setCurrentProjectId } = useProjectStore.getState();
    const { clearSelection, setCurrentDepartment, closeModal } = useUIStore.getState();
    
    // Clear UI state
    clearSelection();
    closeModal();
    setCurrentDepartment(null);
    
    // Switch project
    setCurrentProjectId(projectId);
};
