
import { RenderTask } from "../types";

type Listener = (queue: RenderTask[]) => void;

export class RenderQueue {
    constructor() {}
}

export const createRenderQueue = (
    onTaskComplete: (task: RenderTask, result: string) => void,
    taskExecutor: (task: RenderTask) => Promise<string>,
    getConcurrencyLimit: () => number
) => {
    let queue: RenderTask[] = [];
    let listeners: Listener[] = [];
    let active = 0;
    let isPaused = false;
    // Map to track retries per task ID
    const retryCounts = new Map<string, number>();
    const MAX_RETRIES = 3;

    const notify = () => listeners.forEach(l => l([...queue]));

    const process = async () => {
        if (isPaused) return;
        const currentLimit = getConcurrencyLimit();
        if (active >= currentLimit) return;
        
        // Find next pending task that isn't waiting or stopped
        const nextIdx = queue.findIndex(t => t.status === 'pending');
        if (nextIdx === -1) return;

        const task = queue[nextIdx];
        task.status = 'processing';
        task.progress = 0;
        active++;
        
        console.log(`[Queue] Starting Task ${task.id}:`, { type: task.type, prompt: task.prompt.substring(0, 50) + "..." });
        
        notify();
        process(); // Try to launch more if capacity allows

        try {
            // Executor wrapper to handle progress updates
            // We assume taskExecutor can attach a listener or we just update basic status
            // For video, we pass a progress callback in the main App executor wrapper
            const result = await taskExecutor(task);
            
            // Check if it was stopped during execution
            // We cast status to string to prevent TS narrowing from assuming it is 'processing'
            if ((task.status as string) === 'stopped') {
                console.log(`[Queue] Task ${task.id} stopped manually.`);
                active--;
                notify();
                process();
                return;
            }

            console.log(`[Queue] Task ${task.id} completed successfully.`);
            task.status = 'completed';
            task.progress = 100;
            task.result = result;
            onTaskComplete(task, result);
        } catch (e: any) {
            console.error(`[Queue] Task ${task.id} failed:`, e);
            if ((task.status as string) === 'stopped') {
                // Ignore errors if stopped manually
            } else {
                console.error("Task Failed", e);
                // Check for 429 or other retryable errors
                const isRetryable = e.message?.includes('429') || e.message?.includes('Too Many Requests') || e.message?.includes('Recitation');
                const retries = retryCounts.get(task.id) || 0;
                
                if (isRetryable && retries < MAX_RETRIES) {
                    console.warn(`Retrying task ${task.id} (Attempt ${retries + 1}/${MAX_RETRIES})`);
                    retryCounts.set(task.id, retries + 1);
                    
                    // Simple exponential backoff
                    const delay = Math.pow(2, retries) * 1000;
                    setTimeout(() => {
                        task.status = 'pending'; // Re-queue
                        notify();
                        process();
                    }, delay);
                    
                    // Decrement active count immediately so slot is freed while we wait
                } else {
                    task.status = 'failed';
                    task.error = e.message || "Unknown error";
                }
            }
        } finally {
            active--;
            notify();
            process(); // Try next
        }
    };

    return {
        add: (task: RenderTask) => {
            queue = [...queue, task];
            notify();
            process();
        },
        subscribe: (l: Listener) => {
            listeners.push(l);
            l([...queue]);
            return () => { listeners = listeners.filter(x => x !== l); };
        },
        getQueue: () => queue,
        clearCompleted: () => {
            queue = queue.filter(t => t.status !== 'completed' && t.status !== 'stopped');
            notify();
        },
        updateBatchStatus: (batchId: string, newStatus: 'pending') => {
            let changed = false;
            queue.forEach(t => {
                if (t.batchId === batchId && t.status === 'waiting') {
                    t.status = newStatus;
                    changed = true;
                }
            });
            if (changed) {
                notify();
                process();
            }
        },
        // New Controls
        pause: () => {
            isPaused = true;
            notify();
        },
        resume: () => {
            isPaused = false;
            notify();
            process();
        },
        stopTask: (taskId: string) => {
            const task = queue.find(t => t.id === taskId);
            if (task) {
                if (task.status === 'processing') {
                    // We can't easily kill the promise, but we mark it so result is ignored
                    task.status = 'stopped';
                } else if (task.status === 'pending' || task.status === 'waiting') {
                    task.status = 'stopped';
                }
                notify();
            }
        },
        updateTaskProgress: (taskId: string, percent: number) => {
            const task = queue.find(t => t.id === taskId);
            if (task) {
                task.progress = percent;
                notify();
            }
        },
        isPaused: () => isPaused
    };
};
