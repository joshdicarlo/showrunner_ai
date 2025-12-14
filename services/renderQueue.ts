
import { RenderTask } from "../types";

type Listener = (queue: RenderTask[]) => void;

export class RenderQueue {
    private queue: RenderTask[] = [];
    private listeners: Listener[] = [];
    private concurrency = 3; // Max simultaneous requests
    private activeCount = 0;

    constructor() {}

    public add(task: RenderTask) {
        this.queue.push(task);
        this.notify();
        this.process();
    }

    public subscribe(listener: Listener) {
        this.listeners.push(listener);
        listener(this.queue); // Initial
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify() {
        this.listeners.forEach(l => l([...this.queue]));
    }

    private async process() {
        if (this.activeCount >= this.concurrency) return;

        const nextTask = this.queue.find(t => t.status === 'pending');
        if (!nextTask) return;

        nextTask.status = 'processing';
        this.activeCount++;
        this.notify();

        try {
            // We expect the 'run' logic to be injected or handled via a callback strategy 
            // BUT for this React architecture, the actual API call logic often lives in the component/service layer.
            // However, to keep this generic, let's assume the 'runner' function is passed or we execute a callback.
            // *Correction*: In the App implementation, we will pass a `runner` function to the constructor or use a custom hook approach.
            // For simplicity here, we'll assume the task object *doesn't* have the runner, but the consumer of the queue handles processing based on status changes?
            // No, that's polling. Better: The task should carry its execution logic or we pass a handler.
            
            // Refactored approach: The queue just manages state. The execution happens in the App via effect, 
            // OR we allow passing an async function to `add`. Let's go with passing the executor to `add`.
            
            throw new Error("Executor not provided. See App.tsx for implementation.");
            
        } catch (e) {
            // Placeholder logic, actual execution moved to App.tsx hook for easier context access
        }
    }
    
    // Simple state-only version for React Context usage
    public getSnapshot() {
        return this.queue;
    }
}

// We will use a functional closure approach for the actual queue to use in React
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
        }
    };
};
