/**
 * QueueProvider.tsx
 * 
 * Manages the render queue state and operations:
 * - Task queue for image/video generation
 * - Queue pause/resume controls
 * - Progress tracking and notifications
 * 
 * This provider wraps the renderQueue service and exposes it via React context.
 * The actual task execution logic remains in App.tsx during the transition.
 */

import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { RenderTask, Project } from '../types';
import { createRenderQueue } from '../services/renderQueue';

// ============================================================================
// Types
// ============================================================================

interface QueueContextType {
    // State
    queue: RenderTask[];
    isPaused: boolean;
    
    // Operations
    addTask: (task: RenderTask) => void;
    pauseQueue: () => void;
    resumeQueue: () => void;
    stopTask: (taskId: string) => void;
    clearCompleted: () => void;
    
    // Batch operations
    addBatch: (tasks: RenderTask[]) => void;
    updateBatchStatus: (batchId: string, newStatus: 'pending') => void;
    
    // Derived
    activeCount: number;
    pendingCount: number;
    isProcessing: boolean;
}

// ============================================================================
// Context
// ============================================================================

const QueueContext = createContext<QueueContextType | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface QueueProviderProps {
    children: React.ReactNode;
    taskExecutor: (task: RenderTask) => Promise<string>;
    getConcurrencyLimit: () => number;
    onTaskComplete: (task: RenderTask, result: string) => void;
}

export const QueueProvider: React.FC<QueueProviderProps> = ({
    children,
    taskExecutor,
    getConcurrencyLimit,
    onTaskComplete,
}) => {
    const [queue, setQueue] = useState<RenderTask[]>([]);
    const [isPaused, setIsPaused] = useState(false);
    
    // Store deps in refs to keep stable references
    const depsRef = useRef({ taskExecutor, getConcurrencyLimit, onTaskComplete });
    useEffect(() => {
        depsRef.current = { taskExecutor, getConcurrencyLimit, onTaskComplete };
    }, [taskExecutor, getConcurrencyLimit, onTaskComplete]);
    
    // Initialize queue service
    const queueServiceRef = useRef<ReturnType<typeof createRenderQueue> | null>(null);
    
    useEffect(() => {
        // Create the queue service with callbacks
        queueServiceRef.current = createRenderQueue(
            (task, result) => depsRef.current.onTaskComplete(task, result),
            (task) => depsRef.current.taskExecutor(task),
            () => depsRef.current.getConcurrencyLimit()
        );
        
        // Subscribe to queue updates
        const unsubscribe = queueServiceRef.current.subscribe((newQueue) => {
            setQueue(newQueue);
        });
        
        return unsubscribe;
    }, []);
    
    // Queue operations
    const addTask = useCallback((task: RenderTask) => {
        queueServiceRef.current?.add(task);
    }, []);
    
    const addBatch = useCallback((tasks: RenderTask[]) => {
        tasks.forEach(task => queueServiceRef.current?.add(task));
    }, []);
    
    const updateBatchStatus = useCallback((batchId: string, newStatus: 'pending') => {
        queueServiceRef.current?.updateBatchStatus(batchId, newStatus);
    }, []);
    
    const pauseQueue = useCallback(() => {
        queueServiceRef.current?.pause();
        setIsPaused(true);
    }, []);
    
    const resumeQueue = useCallback(() => {
        queueServiceRef.current?.resume();
        setIsPaused(false);
    }, []);
    
    const stopTask = useCallback((taskId: string) => {
        queueServiceRef.current?.stopTask(taskId);
    }, []);
    
    const clearCompleted = useCallback(() => {
        queueServiceRef.current?.clearCompleted();
    }, []);
    
    // Derived state
    const activeCount = useMemo(() => 
        queue.filter(t => t.status === 'processing').length,
        [queue]
    );
    
    const pendingCount = useMemo(() => 
        queue.filter(t => t.status === 'pending' || t.status === 'processing').length,
        [queue]
    );
    
    const isProcessing = activeCount > 0;
    
    // Context value
    const value: QueueContextType = useMemo(() => ({
        queue,
        isPaused,
        addTask,
        pauseQueue,
        resumeQueue,
        stopTask,
        clearCompleted,
        addBatch,
        updateBatchStatus,
        activeCount,
        pendingCount,
        isProcessing,
    }), [
        queue,
        isPaused,
        addTask,
        pauseQueue,
        resumeQueue,
        stopTask,
        clearCompleted,
        addBatch,
        updateBatchStatus,
        activeCount,
        pendingCount,
        isProcessing,
    ]);
    
    return (
        <QueueContext.Provider value={value}>
            {children}
        </QueueContext.Provider>
    );
};

// ============================================================================
// Hook
// ============================================================================

export const useQueue = (): QueueContextType => {
    const context = useContext(QueueContext);
    if (!context) {
        throw new Error('useQueue must be used within a QueueProvider');
    }
    return context;
};

// Convenience hooks
export const useQueueStatus = () => {
    const { queue, isPaused, activeCount, pendingCount, isProcessing } = useQueue();
    return { queue, isPaused, activeCount, pendingCount, isProcessing };
};

export const useQueueOperations = () => {
    const { addTask, addBatch, updateBatchStatus, pauseQueue, resumeQueue, stopTask, clearCompleted } = useQueue();
    return { addTask, addBatch, updateBatchStatus, pauseQueue, resumeQueue, stopTask, clearCompleted };
};

export default QueueProvider;
