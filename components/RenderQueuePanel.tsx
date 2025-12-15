
import React, { useState, useMemo } from 'react';
import { RenderTask, ProjectAsset } from '../types';
import { X, CheckCircle, AlertCircle, Loader2, Clock, CheckSquare, Square, Terminal, Layers, ChevronDown, ChevronRight, Lock, Play } from 'lucide-react';

interface RenderQueuePanelProps {
    queue: RenderTask[];
    assets: ProjectAsset[];
    onClose: () => void;
}

interface BatchGroup {
    id: string;
    label: string;
    tasks: RenderTask[];
    status: 'processing' | 'pending' | 'waiting' | 'completed' | 'failed';
    completedCount: number;
    totalCount: number;
    dependencyId?: string;
    dependencyLabel?: string;
}

export const RenderQueuePanel: React.FC<RenderQueuePanelProps> = ({ queue, assets, onClose }) => {
    const [showCompleted, setShowCompleted] = useState(false);
    const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

    // Group tasks into Batches
    const batches = useMemo(() => {
        const groups: Record<string, RenderTask[]> = {};
        const standaloneTasks: RenderTask[] = [];

        queue.forEach(t => {
            if (t.batchId) {
                if (!groups[t.batchId]) groups[t.batchId] = [];
                groups[t.batchId].push(t);
            } else {
                standaloneTasks.push(t);
            }
        });

        const result: BatchGroup[] = [];

        Object.keys(groups).forEach(batchId => {
            const tasks = groups[batchId];
            const completedCount = tasks.filter(t => t.status === 'completed').length;
            const failedCount = tasks.filter(t => t.status === 'failed').length;
            const processing = tasks.some(t => t.status === 'processing');
            const pending = tasks.some(t => t.status === 'pending');
            const waiting = tasks.some(t => t.status === 'waiting');
            
            // Determine aggregate status
            let status: BatchGroup['status'] = 'completed';
            if (failedCount === tasks.length) status = 'failed';
            else if (processing) status = 'processing';
            else if (pending) status = 'pending';
            else if (waiting) status = 'waiting';
            
            // Find dependency label
            let dependencyLabel = undefined;
            if (tasks[0].waitingOnBatchId) {
                const depTasks = groups[tasks[0].waitingOnBatchId];
                if (depTasks && depTasks.length > 0) dependencyLabel = depTasks[0].batchLabel || "Dependent Batch";
            }

            result.push({
                id: batchId,
                label: tasks[0].batchLabel || "Untitled Batch",
                tasks: tasks,
                status: status,
                completedCount,
                totalCount: tasks.length,
                dependencyId: tasks[0].waitingOnBatchId,
                dependencyLabel
            });
        });

        // Add Standalone as generic batch if exists
        if (standaloneTasks.length > 0) {
             const completedCount = standaloneTasks.filter(t => t.status === 'completed').length;
             result.push({
                 id: 'standalone',
                 label: "Individual Tasks",
                 tasks: standaloneTasks,
                 status: standaloneTasks.some(t => t.status === 'processing') ? 'processing' : 'pending',
                 completedCount,
                 totalCount: standaloneTasks.length
             });
        }

        // Filter out fully completed if checkbox off
        return result.filter(b => showCompleted || b.status !== 'completed').sort((a, b) => {
            // Priority: Processing > Pending > Waiting > Completed
            const score = (s: string) => {
                if (s === 'processing') return 0;
                if (s === 'pending') return 1;
                if (s === 'waiting') return 2;
                return 3;
            };
            return score(a.status) - score(b.status);
        });
    }, [queue, showCompleted]);

    const toggleExpand = (id: string) => {
        setExpandedBatches(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const renderStatusIcon = (status: string) => {
        switch(status) {
            case 'processing': return <Loader2 size={16} className="animate-spin text-blue-400" />;
            case 'waiting': return <Lock size={16} className="text-orange-400" />;
            case 'completed': return <CheckCircle size={16} className="text-green-500" />;
            case 'failed': return <AlertCircle size={16} className="text-red-500" />;
            default: return <Clock size={16} className="text-zinc-500" />;
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div 
                className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[600px] h-[600px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900 shrink-0">
                    <div>
                        <h3 className="font-bold text-zinc-100 flex items-center gap-2 text-base">
                            <Layers className="text-blue-500" size={18} />
                            Render Queue
                        </h3>
                        <div className="text-xs text-zinc-500 mt-1">
                            {queue.filter(t => t.status === 'processing').length} active tasks • {queue.filter(t => t.status === 'waiting').length} waiting
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-[10px] text-zinc-500 hover:text-zinc-300 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={showCompleted} 
                                onChange={e => setShowCompleted(e.target.checked)} 
                                className="rounded bg-zinc-800 border-zinc-700"
                            />
                            Show Completed
                        </label>
                        <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-500 hover:text-white">
                            <X size={18} />
                        </button>
                    </div>
                </div>
                
                {/* Batch List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-zinc-950/50 custom-scrollbar">
                    {batches.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2">
                            <Terminal size={32} className="opacity-10"/>
                            <p className="text-xs italic">Queue empty</p>
                        </div>
                    )}

                    {batches.map(batch => {
                        const isExpanded = expandedBatches.has(batch.id);
                        const progressPercent = (batch.completedCount / batch.totalCount) * 100;
                        
                        return (
                            <div key={batch.id} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                                {/* Batch Header */}
                                <div 
                                    className="p-3 flex items-center gap-3 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                                    onClick={() => toggleExpand(batch.id)}
                                >
                                    <div className="shrink-0 text-zinc-500">
                                        {isExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                {renderStatusIcon(batch.status)}
                                                <span className="text-xs font-bold text-zinc-200 truncate">{batch.label}</span>
                                            </div>
                                            <span className="text-[10px] font-mono text-zinc-500">
                                                {batch.completedCount}/{batch.totalCount}
                                            </span>
                                        </div>
                                        
                                        {/* Progress Bar */}
                                        <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full transition-all duration-500 ${
                                                    batch.status === 'failed' ? 'bg-red-500' :
                                                    batch.status === 'waiting' ? 'bg-orange-500/50' : 
                                                    batch.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
                                                }`}
                                                style={{ width: `${progressPercent}%` }}
                                            />
                                        </div>

                                        {/* Dependency Line */}
                                        {batch.status === 'waiting' && batch.dependencyLabel && (
                                            <div className="text-[10px] text-orange-400 flex items-center gap-1 mt-1.5">
                                                <Lock size={10} />
                                                Waiting for: {batch.dependencyLabel}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Task Details */}
                                {isExpanded && (
                                    <div className="border-t border-zinc-800 bg-black/20">
                                        {batch.tasks.map(task => {
                                            const asset = assets.find(a => a.id === task.assetId);
                                            return (
                                                <div key={task.id} className="flex items-center gap-3 px-3 py-2 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30">
                                                    <div className="w-4 shrink-0 flex justify-center">
                                                        {task.status === 'processing' && <Loader2 size={12} className="animate-spin text-blue-400" />}
                                                        {task.status === 'completed' && <div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                                                        {task.status === 'failed' && <div className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                                                        {(task.status === 'pending' || task.status === 'waiting') && <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-[10px] text-zinc-300 truncate font-medium">{asset?.title || "Unknown Asset"}</span>
                                                            <span className={`text-[9px] uppercase ${
                                                                task.status === 'failed' ? 'text-red-400' : 
                                                                task.status === 'processing' ? 'text-blue-400' : 'text-zinc-600'
                                                            }`}>
                                                                {task.status}
                                                            </span>
                                                        </div>
                                                        <div className="text-[9px] text-zinc-500 truncate font-mono opacity-70">
                                                            {task.prompt}
                                                        </div>
                                                        {task.error && <div className="text-[9px] text-red-400">{task.error}</div>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
