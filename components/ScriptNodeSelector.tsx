
import React, { useState, useMemo, useEffect } from 'react';
import { Modal, Button, ToggleGroup } from './UI';
import { FlowNode, NodeType, DepartmentType } from '../types';
import { FileText, CheckCircle, Circle, Search, Check } from 'lucide-react';

interface ScriptNodeSelectorProps {
    nodes: FlowNode[];
    onClose: () => void;
    onConfirm: (selectedNodeIds: string[]) => void;
    title?: string;
    description?: string;
}

type FilterMode = 'approved' | 'all';

export const ScriptNodeSelector: React.FC<ScriptNodeSelectorProps> = ({ 
    nodes, 
    onClose, 
    onConfirm,
    title = "Select Script Nodes",
    description = "Choose which scripts to analyze for discovery."
}) => {
    // Filter to only Writers Room text nodes
    const scriptNodes = useMemo(() => 
        nodes.filter(n => 
            n.department === DepartmentType.WRITERS_ROOM && 
            (n.type === NodeType.AI_TEXT_GEN || n.type === NodeType.TEXT_INPUT) && 
            n.data.text
        ), 
    [nodes]);

    const approvedNodes = useMemo(() => 
        scriptNodes.filter(n => n.data.status === 'approved'),
    [scriptNodes]);

    // Determine initial filter mode
    const initialFilter: FilterMode = approvedNodes.length > 0 ? 'approved' : 'all';
    const [filterMode, setFilterMode] = useState<FilterMode>(initialFilter);
    
    // Selected node IDs
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
        // If we have approved nodes, select all of them by default
        if (approvedNodes.length > 0) {
            return new Set(approvedNodes.map(n => n.id));
        }
        // Otherwise start with none selected
        return new Set();
    });

    // Visible nodes based on filter
    const visibleNodes = useMemo(() => 
        filterMode === 'approved' ? approvedNodes : scriptNodes,
    [filterMode, approvedNodes, scriptNodes]);

    // When filter changes, update selection appropriately
    useEffect(() => {
        if (filterMode === 'approved') {
            // When switching to approved, keep only approved nodes selected
            setSelectedIds(prev => {
                const approvedIdSet = new Set(approvedNodes.map(n => n.id));
                const newSet = new Set<string>();
                prev.forEach(id => {
                    if (approvedIdSet.has(id)) newSet.add(id);
                });
                // If nothing selected after filter, select all approved
                if (newSet.size === 0 && approvedNodes.length > 0) {
                    return new Set(approvedNodes.map(n => n.id));
                }
                return newSet;
            });
        }
    }, [filterMode, approvedNodes]);

    const toggleNode = (nodeId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    };

    const selectAll = () => {
        setSelectedIds(new Set(visibleNodes.map(n => n.id)));
    };

    const selectNone = () => {
        setSelectedIds(new Set());
    };

    const handleConfirm = () => {
        onConfirm(Array.from(selectedIds));
    };

    const getNodeLabel = (node: FlowNode): string => {
        if (node.data.label) return node.data.label;
        // Fallback: first 50 chars of text
        const text = node.data.text || '';
        return text.substring(0, 50) + (text.length > 50 ? '...' : '') || 'Untitled Script';
    };

    const getStatusBadge = (status?: string) => {
        switch (status) {
            case 'approved':
                return <span className="px-1.5 py-0.5 text-[10px] bg-green-500/20 text-green-400 rounded">Approved</span>;
            case 'draft':
                return <span className="px-1.5 py-0.5 text-[10px] bg-yellow-500/20 text-yellow-400 rounded">Draft</span>;
            case 'review':
                return <span className="px-1.5 py-0.5 text-[10px] bg-blue-500/20 text-blue-400 rounded">Review</span>;
            default:
                return <span className="px-1.5 py-0.5 text-[10px] bg-zinc-500/20 text-zinc-400 rounded">Pending</span>;
        }
    };

    return (
        <Modal title={title} onClose={onClose} maxWidth="max-w-lg">
            <div className="flex flex-col gap-4">
                <p className="text-sm text-zinc-400">{description}</p>

                {/* Filter Toggle */}
                <div className="flex items-center justify-between">
                    <ToggleGroup
                        value={filterMode}
                        onChange={(val) => setFilterMode(val as FilterMode)}
                        options={[
                            { value: 'approved', label: `Approved (${approvedNodes.length})` },
                            { value: 'all', label: `All (${scriptNodes.length})` }
                        ]}
                    />
                    <div className="flex gap-2">
                        <button 
                            onClick={selectAll} 
                            className="text-xs text-zinc-500 hover:text-white px-2 py-1 rounded hover:bg-zinc-800"
                        >
                            Select All
                        </button>
                        <button 
                            onClick={selectNone} 
                            className="text-xs text-zinc-500 hover:text-white px-2 py-1 rounded hover:bg-zinc-800"
                        >
                            Select None
                        </button>
                    </div>
                </div>

                {/* Node List */}
                <div className="max-h-80 overflow-y-auto border border-zinc-800 rounded-lg divide-y divide-zinc-800">
                    {visibleNodes.length === 0 ? (
                        <div className="p-8 text-center text-zinc-500">
                            <FileText size={24} className="mx-auto mb-2 opacity-40" />
                            <p className="text-sm">
                                {filterMode === 'approved' 
                                    ? "No approved scripts found. Switch to 'All' or approve some scripts first."
                                    : "No script nodes found in Writers Room."
                                }
                            </p>
                        </div>
                    ) : (
                        visibleNodes.map(node => (
                            <div 
                                key={node.id}
                                onClick={() => toggleNode(node.id)}
                                className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                                    selectedIds.has(node.id) 
                                        ? 'bg-blue-500/10 hover:bg-blue-500/20' 
                                        : 'hover:bg-zinc-800/50'
                                }`}
                            >
                                {/* Checkbox */}
                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                    selectedIds.has(node.id)
                                        ? 'bg-blue-500 border-blue-500'
                                        : 'border-zinc-600 hover:border-zinc-500'
                                }`}>
                                    {selectedIds.has(node.id) && <Check size={12} className="text-white" />}
                                </div>

                                {/* Icon */}
                                <FileText size={16} className="text-blue-400 shrink-0" />

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white truncate">{getNodeLabel(node)}</p>
                                    <p className="text-xs text-zinc-500">
                                        {node.data.text?.length.toLocaleString() || 0} characters
                                    </p>
                                </div>

                                {/* Status */}
                                {getStatusBadge(node.data.status)}
                            </div>
                        ))
                    )}
                </div>

                {/* Summary */}
                <div className="text-xs text-zinc-500">
                    {selectedIds.size} of {visibleNodes.length} scripts selected
                    {selectedIds.size > 0 && (
                        <span className="text-zinc-400">
                            {' '}• ~{visibleNodes
                                .filter(n => selectedIds.has(n.id))
                                .reduce((acc, n) => acc + (n.data.text?.length || 0), 0)
                                .toLocaleString()} characters total
                        </span>
                    )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button 
                        onClick={handleConfirm} 
                        disabled={selectedIds.size === 0}
                        icon={Search}
                    >
                        Analyze Selected
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
