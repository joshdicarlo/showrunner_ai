
import { RenderTask } from "../types";

type Listener = (queue: RenderTask[]) => void;

export class RenderQueue {
    // Legacy class structure kept for reference if needed, 
    // but we use the functional closure below for React integration.
    constructor() {}
}

export const createRenderQueue = (
    onTaskComplete: (task: RenderTask, result: string) => void,
    taskExecutor: (task: RenderTask) => Promise<string>
) => {
    let queue: RenderTask[] = [];
    let listeners: Listener[] = [];
    let active = 0;
    const concurrency = 2; // Conservative limit

    const notify = () => listeners.forEach(l => l([...queue]));

    const process = async () => {
        if (active >= concurrency) return;
        
        // Find next pending task that isn't waiting
        const nextIdx = queue.findIndex(t => t.status === 'pending');
        if (nextIdx === -1) return;

        const task = queue[nextIdx];
        task.status = 'processing';
        active++;
        notify();

        try {
            const result = await taskExecutor(task);
            task.status = 'completed';
            task.result = result;
            onTaskComplete(task, result);
        } catch (e: any) {
            console.error("Task Failed", e);
            task.status = 'failed';
            task.error = e.message || "Unknown error";
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
            queue = queue.filter(t => t.status !== 'completed');
            notify();
        },
        // New method to wake up waiting tasks
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
        }
    };
};
