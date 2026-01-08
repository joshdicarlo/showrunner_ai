
import { RenderTask } from "../types";

type Listener = (queue: RenderTask[]) => void;

export class RenderQueue {
    constructor() {}
}

export const createRenderQueue = (
    onTaskComplete: (task: RenderTask, result: string) => void,
    taskExecutor: (task: RenderTask) => Promise<string>
) => {
    let queue: RenderTask[] = [];
    let listeners: Listener[] = [];
    let active = 0;
    let isPaused = false;
    const concurrency = 10; // Increased to 10 for better throughput of server-side video jobs

    const notify = () => listeners.forEach(l => l([...queue]));

    const process = async () => {
        if (isPaused) return;
        if (active >= concurrency) return;
        
        // Find next pending task that isn't waiting or stopped
        const nextIdx = queue.findIndex(t => t.status === 'pending');
        if (nextIdx === -1) return;

        const task = queue[nextIdx];
        task.status = 'processing';
        task.progress = 0;
        active++;
        notify();

        try {
            // Executor wrapper to handle progress updates
            // We assume taskExecutor can attach a listener or we just update basic status
            // For video, we pass a progress callback in the main App executor wrapper
            const result = await taskExecutor(task);
            
            // Check if it was stopped during execution
            // We cast status to string to prevent TS narrowing from assuming it is 'processing'
            if ((task.status as string) === 'stopped') {
                active--;
                notify();
                process();
                return;
            }

            task.status = 'completed';
            task.progress = 100;
            task.result = result;
            onTaskComplete(task, result);
        } catch (e: any) {
            if ((task.status as string) === 'stopped') {
                // Ignore errors if stopped manually
            } else {
                console.error("Task Failed", e);
                task.status = 'failed';
                task.error = e.message || "Unknown error";
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
