/**
 * Queue Store
 * 
 * Zustand store for managing the render queue:
 * - Queue items (images, videos)
 * - Processing status
 * - Queue operations (add, remove, pause, resume)
 * 
 * Does NOT persist to localStorage as queue state is session-based.
 */

import { create } from 'zustand';
import { RenderTask } from '../types';

// ============================================================================
// Types
// ============================================================================

export type TaskStatus = RenderTask['status'];

interface QueueState {
    // State
    queue: RenderTask[];
    isProcessing: boolean;
    isPaused: boolean;
    concurrentLimit: number;
    
    // Computed
    pendingTasks: () => RenderTask[];
    processingTasks: () => RenderTask[];
    completedTasks: () => RenderTask[];
    failedTasks: () => RenderTask[];
    queueStats: () => {
        total: number;
        pending: number;
        processing: number;
        completed: number;
        failed: number;
    };
    
    // Queue operations
    addTask: (task: RenderTask) => void;
    addTasks: (tasks: RenderTask[]) => void;
    removeTask: (taskId: string) => void;
    clearQueue: () => void;
    clearCompleted: () => void;
    clearFailed: () => void;
    
    // Task status updates
    updateTaskStatus: (taskId: string, status: TaskStatus, updates?: Partial<RenderTask>) => void;
    updateTaskProgress: (taskId: string, progress: number) => void;
    completeTask: (taskId: string, result: string) => void;
    failTask: (taskId: string, error: string) => void;
    
    // Queue control
    startProcessing: () => void;
    pauseProcessing: () => void;
    resumeProcessing: () => void;
    stopProcessing: () => void;
    setConcurrentLimit: (limit: number) => void;
    
    // Task retrieval
    getTask: (taskId: string) => RenderTask | undefined;
    getNextPendingTask: () => RenderTask | undefined;
    getTasksByBatch: (batchId: string) => RenderTask[];
    getTasksByAsset: (assetId: string) => RenderTask[];
    
    // Batch operations
    cancelBatch: (batchId: string) => void;
    retryFailed: () => void;
    retryTask: (taskId: string) => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

const generateTaskId = () => 
    `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// ============================================================================
// Store
// ============================================================================

export const useQueueStore = create<QueueState>()((set, get) => ({
    // Initial state
    queue: [],
    isProcessing: false,
    isPaused: false,
    concurrentLimit: 3,
    
    // ========================================================================
    // Computed Getters
    // ========================================================================
    
    pendingTasks: () => get().queue.filter(t => t.status === 'pending'),
    processingTasks: () => get().queue.filter(t => t.status === 'processing'),
    completedTasks: () => get().queue.filter(t => t.status === 'completed'),
    failedTasks: () => get().queue.filter(t => t.status === 'failed'),
    
    queueStats: () => {
        const { queue } = get();
        return {
            total: queue.length,
            pending: queue.filter(t => t.status === 'pending' || t.status === 'waiting').length,
            processing: queue.filter(t => t.status === 'processing').length,
            completed: queue.filter(t => t.status === 'completed').length,
            failed: queue.filter(t => t.status === 'failed').length,
        };
    },
    
    // ========================================================================
    // Queue Operations
    // ========================================================================
    
    addTask: (task) => {
        const newTask: RenderTask = {
            ...task,
            id: task.id || generateTaskId(),
            status: task.status || 'pending',
        };
        
        set(state => ({
            queue: [...state.queue, newTask]
        }));
    },
    
    addTasks: (tasks) => {
        const newTasks = tasks.map(task => ({
            ...task,
            id: task.id || generateTaskId(),
            status: task.status || 'pending' as const,
        }));
        
        set(state => ({
            queue: [...state.queue, ...newTasks]
        }));
    },
    
    removeTask: (taskId) => {
        set(state => ({
            queue: state.queue.filter(t => t.id !== taskId)
        }));
    },
    
    clearQueue: () => {
        set({ queue: [], isProcessing: false });
    },
    
    clearCompleted: () => {
        set(state => ({
            queue: state.queue.filter(t => t.status !== 'completed')
        }));
    },
    
    clearFailed: () => {
        set(state => ({
            queue: state.queue.filter(t => t.status !== 'failed')
        }));
    },
    
    // ========================================================================
    // Task Status Updates
    // ========================================================================
    
    updateTaskStatus: (taskId, status, updates = {}) => {
        set(state => ({
            queue: state.queue.map(t => 
                t.id === taskId 
                    ? { ...t, status, ...updates }
                    : t
            )
        }));
    },
    
    updateTaskProgress: (taskId, progress) => {
        set(state => ({
            queue: state.queue.map(t => 
                t.id === taskId 
                    ? { ...t, progress }
                    : t
            )
        }));
    },
    
    completeTask: (taskId, result) => {
        set(state => ({
            queue: state.queue.map(t => 
                t.id === taskId 
                    ? { ...t, status: 'completed', result, progress: 100 }
                    : t
            )
        }));
    },
    
    failTask: (taskId, error) => {
        set(state => ({
            queue: state.queue.map(t => 
                t.id === taskId 
                    ? { ...t, status: 'failed', error }
                    : t
            )
        }));
    },
    
    // ========================================================================
    // Queue Control
    // ========================================================================
    
    startProcessing: () => {
        set({ isProcessing: true, isPaused: false });
    },
    
    pauseProcessing: () => {
        set({ isPaused: true });
    },
    
    resumeProcessing: () => {
        set({ isPaused: false });
    },
    
    stopProcessing: () => {
        // Stop processing and mark all pending tasks as stopped
        set(state => ({
            isProcessing: false,
            isPaused: false,
            queue: state.queue.map(t => 
                t.status === 'pending' || t.status === 'waiting'
                    ? { ...t, status: 'stopped' }
                    : t
            )
        }));
    },
    
    setConcurrentLimit: (limit) => {
        set({ concurrentLimit: Math.max(1, Math.min(10, limit)) });
    },
    
    // ========================================================================
    // Task Retrieval
    // ========================================================================
    
    getTask: (taskId) => get().queue.find(t => t.id === taskId),
    
    getNextPendingTask: () => {
        const { queue, processingTasks, concurrentLimit } = get();
        
        // Don't return more if at concurrent limit
        if (processingTasks().length >= concurrentLimit) {
            return undefined;
        }
        
        // Find first pending task that isn't waiting on dependencies
        return queue.find(t => {
            if (t.status !== 'pending') return false;
            
            // Check if waiting on a batch dependency
            if (t.waitingOnBatchId) {
                const dependencyTasks = queue.filter(d => d.batchId === t.waitingOnBatchId);
                const allCompleted = dependencyTasks.every(d => d.status === 'completed');
                if (!allCompleted) return false;
            }
            
            return true;
        });
    },
    
    getTasksByBatch: (batchId) => 
        get().queue.filter(t => t.batchId === batchId),
    
    getTasksByAsset: (assetId) => 
        get().queue.filter(t => t.assetId === assetId),
    
    // ========================================================================
    // Batch Operations
    // ========================================================================
    
    cancelBatch: (batchId) => {
        set(state => ({
            queue: state.queue.map(t => 
                t.batchId === batchId && 
                (t.status === 'pending' || t.status === 'waiting')
                    ? { ...t, status: 'stopped' }
                    : t
            )
        }));
    },
    
    retryFailed: () => {
        set(state => ({
            queue: state.queue.map(t => 
                t.status === 'failed'
                    ? { ...t, status: 'pending', error: undefined, progress: undefined }
                    : t
            )
        }));
    },
    
    retryTask: (taskId) => {
        set(state => ({
            queue: state.queue.map(t => 
                t.id === taskId && t.status === 'failed'
                    ? { ...t, status: 'pending', error: undefined, progress: undefined }
                    : t
            )
        }));
    },
}));

// ============================================================================
// Selector Hooks
// ============================================================================

export const useQueue = () => useQueueStore(state => state.queue);
export const useIsProcessing = () => useQueueStore(state => state.isProcessing);
export const useIsPaused = () => useQueueStore(state => state.isPaused);
export const useQueueStats = () => useQueueStore(state => state.queueStats());

// Get processing status for a specific asset
export const useAssetQueueStatus = (assetId: string) => {
    return useQueueStore(state => {
        const assetTasks = state.queue.filter(t => t.assetId === assetId);
        return {
            isGenerating: assetTasks.some(t => t.status === 'processing'),
            pendingCount: assetTasks.filter(t => t.status === 'pending').length,
            processingCount: assetTasks.filter(t => t.status === 'processing').length,
        };
    });
};

export default useQueueStore;
