/**
 * WorkspaceLayout.tsx
 * 
 * The main workspace layout when editing a project:
 * - Sidebar for department navigation
 * - Department panel for assets
 * - Main canvas/gallery area
 * - Asset editor panel
 * - Queue panel overlay
 * 
 * This component orchestrates the layout but delegates specific
 * functionality to child components.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { 
    Layers, LayoutGrid, List, Cloud, CloudOff, Scissors 
} from 'lucide-react';
import { 
    Project, ProjectAsset, FlowNode, FlowConnection, 
    DepartmentType, NodeType, ProjectSettings, RenderTask
} from '../../types';
import { GenerationRequest } from '../../components/NodeItem';
import { DEPARTMENTS, DEFAULT_PROJECT_SETTINGS } from '../../constants';
import { Sidebar } from '../../components/Sidebar';
import { DepartmentPanel } from '../../components/DepartmentPanel';
import { Canvas } from '../../components/Canvas';
import { GalleryView } from '../../components/GalleryView';
import { EditorTimeline } from '../../components/EditorTimeline';
import { ChatBot } from '../../components/ChatBot';
import { RenderQueuePanel } from '../../components/RenderQueuePanel';
import { AssetEditorPanel } from '../../components/AssetEditorPanel';
import { ToggleGroup } from '../../components/UI';

// ============================================================================
// Types
// ============================================================================

interface WorkspaceLayoutProps {
    // Project data
    project: Project;
    
    // Current selections
    currentDept: DepartmentType;
    currentAssetId: string | null;
    
    // View state
    workspaceView: 'canvas' | 'gallery';
    
    // Queue state
    renderQueue: RenderTask[];
    queuePaused: boolean;
    
    // Drive state
    isDriveConnected: boolean;
    isMockDrive: boolean;
    
    // Derived data
    assetThumbnails: Record<string, string>;
    refinedImagesMap: Record<string, string[]>;
    approvedImagesMap: Record<string, string[]>;
    
    // Focus nodes
    focusNodeIds: string[];
    
    // Selection handlers
    onChangeDept: (dept: DepartmentType) => void;
    onSelectAsset: (assetId: string | null) => void;
    onChangeView: (view: 'canvas' | 'gallery') => void;
    
    // Navigation
    onBack: () => void;
    onOpenSettings: () => void;
    
    // Node handlers
    onSetNodes: (value: React.SetStateAction<FlowNode[]>) => void;
    onSetConnections: (value: React.SetStateAction<FlowConnection[]>) => void;
    onUpdateNode: (nodeId: string, data: any) => void;
    onSetFocusNodes: (ids: string[]) => void;
    
    // Asset handlers - matching EditorTimeline and AssetEditorPanel signatures
    onCreateAsset: () => void;
    onUpdateAssetFull: (asset: ProjectAsset) => void; // EditorTimeline expects full asset
    onDeleteAsset: (assetId: string) => void;
    onArchiveAsset: (assetId: string) => void;
    onRestoreAsset: (assetId: string) => void;
    
    // Generation handlers - matching component signatures
    onGenerateConcepts: (count: number, styleId?: string) => void; // AssetEditorPanel signature
    onGenerateVideo: (node: FlowNode, model: string) => void; // Canvas signature
    onGalleryGenerate: (prompt: string, count: number, model: string, aspectRatio: string) => void; // GalleryView signature
    onRefineConcept: (assetId: string, sourceImageUrl?: string) => void;
    onRequestGeneration: (request: GenerationRequest) => void;
    onGenerateTurntable: (node: FlowNode) => void;
    onGenerateExpressions: (node: FlowNode) => void;
    onGenerateVideoForClip: (clipId: string, sourceNodeId: string, replace: boolean, model: string) => void;
    
    // Discovery handlers
    onAnalyzeScripts: () => void;
    onOneShotDiscovery: () => void;
    onDiscoverShots: (assetId: string) => void;
    
    // Thumbnail handler
    onSetThumbnail: (assetId: string, imageUrl: string) => void;
    
    // Queue handlers
    onToggleQueue: () => void;
    onPauseQueue: () => void;
    onResumeQueue: () => void;
    onStopTask: (taskId: string) => void;
    
    // Editor handlers
    onGenerateOutline: () => void;
    onNavigateToAsset: (assetId: string) => void;
    onRemoveRef: (imageUrl: string) => void;
    
    // Queue panel visibility
    isRenderQueueOpen: boolean;
}

// ============================================================================
// Sub-components
// ============================================================================

interface WorkspaceHeaderProps {
    asset: ProjectAsset | null;
    renderQueue: RenderTask[];
    queuePaused: boolean;
    workspaceView: 'canvas' | 'gallery';
    currentDept: DepartmentType;
    isDriveConnected: boolean;
    isMockDrive: boolean;
    onToggleQueue: () => void;
    onChangeView: (view: 'canvas' | 'gallery') => void;
}

const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
    asset,
    renderQueue,
    queuePaused,
    workspaceView,
    currentDept,
    isDriveConnected,
    isMockDrive,
    onToggleQueue,
    onChangeView,
}) => {
    const pendingCount = renderQueue.filter(t => t.status === 'pending' || t.status === 'processing').length;
    const isProcessing = renderQueue.some(t => t.status === 'processing');
    
    return (
        <div className="h-14 border-b border-border bg-surface flex items-center justify-between px-6 shrink-0 z-20">
            <div className="flex items-center gap-4 min-w-0 flex-1">
                <h2 className="font-bold text-zinc-100 truncate shrink-0">{asset ? asset.title : "General"}</h2>
                {asset && (
                    <span className="text-xs text-zinc-500 bg-zinc-900 px-2 py-1 rounded border border-zinc-800 truncate min-w-0 flex-1" title={asset.summary}>
                        {asset.summary || "No summary"}
                    </span>
                )}
            </div>
            
            <div className="flex items-center gap-3 shrink-0 ml-4">
                {renderQueue.length > 0 && (
                    <button 
                        onClick={onToggleQueue}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-bold text-zinc-300 transition-colors"
                    >
                        <Layers size={14} className={isProcessing ? "animate-pulse text-blue-400" : ""}/>
                        Queue ({pendingCount})
                        {queuePaused && <span className="text-[9px] bg-yellow-900/50 text-yellow-500 px-1 rounded">PAUSED</span>}
                    </button>
                )}

                {currentDept !== DepartmentType.EDITORIAL && (
                    <ToggleGroup 
                        options={[
                            { value: 'canvas', icon: LayoutGrid, label: 'Canvas' },
                            { value: 'gallery', icon: List, label: 'Gallery' }
                        ]}
                        value={workspaceView}
                        onChange={(v) => onChangeView(v as 'canvas' | 'gallery')}
                    />
                )}

                <div className="h-6 w-[1px] bg-zinc-800 mx-2"/>

                {isDriveConnected && (
                    <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                        {isMockDrive ? <CloudOff size={12} className="text-yellow-600"/> : <Cloud size={12} className="text-green-600"/>}
                        {isMockDrive ? "Offline Save" : "Auto-Save On"}
                    </div>
                )}
            </div>
        </div>
    );
};

// ============================================================================
// Queue Indicator
// ============================================================================

interface QueueIndicatorProps {
    queue: RenderTask[];
}

const QueueIndicator: React.FC<QueueIndicatorProps> = ({ queue }) => {
    const processing = queue.filter(t => t.status === 'processing');
    if (processing.length === 0) return null;
    
    return (
        <div className="absolute bottom-4 right-4 bg-zinc-900/90 backdrop-blur-sm border border-zinc-700 rounded-lg p-3 shadow-lg z-30">
            <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Layers size={14} className="text-blue-400 animate-pulse" />
                </div>
                <div>
                    <div className="text-xs font-bold text-white">{processing.length} rendering...</div>
                    <div className="text-[10px] text-zinc-500">{queue.filter(t => t.status === 'pending').length} pending</div>
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// Main Component
// ============================================================================

const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({
    project,
    currentDept,
    currentAssetId,
    workspaceView,
    renderQueue,
    queuePaused,
    isDriveConnected,
    isMockDrive,
    assetThumbnails,
    refinedImagesMap,
    approvedImagesMap,
    focusNodeIds,
    onChangeDept,
    onSelectAsset,
    onChangeView,
    onBack,
    onOpenSettings,
    onSetNodes,
    onSetConnections,
    onUpdateNode,
    onSetFocusNodes,
    onCreateAsset,
    onUpdateAssetFull,
    onDeleteAsset,
    onArchiveAsset,
    onRestoreAsset,
    onGenerateConcepts,
    onGenerateVideo,
    onGalleryGenerate,
    onRefineConcept,
    onRequestGeneration,
    onGenerateTurntable,
    onGenerateExpressions,
    onGenerateVideoForClip,
    onAnalyzeScripts,
    onOneShotDiscovery,
    onDiscoverShots,
    onSetThumbnail,
    onToggleQueue,
    onPauseQueue,
    onResumeQueue,
    onStopTask,
    onGenerateOutline,
    onNavigateToAsset,
    onRemoveRef,
    isRenderQueueOpen,
}) => {
    // Derived state
    const activeAsset = useMemo(() => 
        project.assets.find(a => a.id === currentAssetId) || null,
        [project.assets, currentAssetId]
    );
    
    const activeDeptConfig = DEPARTMENTS.find(d => d.id === currentDept);
    
    // Editorial state for timeline
    const editorialState = useMemo(() => {
        if (currentDept !== DepartmentType.EDITORIAL) {
            return { sequence: null, filterId: null };
        }
        
        const sequence = currentAssetId 
            ? project.assets.find(a => a.id === currentAssetId && a.timelineData)
            : project.assets.find(a => a.timelineData);
            
        return { 
            sequence: sequence || null, 
            filterId: currentAssetId 
        };
    }, [currentDept, currentAssetId, project.assets]);
    
    // Script context for ChatBot
    const scriptContext = useMemo(() => {
        const scriptNodes = project.nodes.filter(n => 
            n.department === DepartmentType.WRITERS_ROOM && 
            (n.type === NodeType.AI_TEXT_GEN || n.type === NodeType.TEXT_INPUT) && 
            n.data.text
        );
        return scriptNodes.map(n => n.data.text).join('\n\n');
    }, [project.nodes]);
    
    return (
        <div className="w-full h-full flex bg-background font-sans overflow-hidden">
            <Sidebar 
                currentDept={currentDept} 
                onChangeDept={(d) => { 
                    onChangeDept(d); 
                    onSelectAsset(null); 
                    onSetFocusNodes([]); 
                }}
                onBack={onBack}
                onOpenSettings={onOpenSettings}
            />
            
            <DepartmentPanel 
                department={currentDept}
                assets={project.assets}
                nodes={project.nodes}
                currentAssetId={currentAssetId}
                onSelectAsset={(id) => { 
                    onSelectAsset(id); 
                    onSetFocusNodes([]); 
                }}
                onCreateAsset={onCreateAsset}
                onAnalyzeScripts={onAnalyzeScripts}
                onDiscoverShots={onDiscoverShots}
                assetThumbnails={assetThumbnails}
                onDeleteAsset={onDeleteAsset}
                onArchiveAsset={onArchiveAsset}
                onRestoreAsset={onRestoreAsset}
                onOneShotDiscovery={onOneShotDiscovery}
            />

            <div className="flex-1 flex flex-col relative min-w-0">
                <WorkspaceHeader 
                    asset={activeAsset}
                    renderQueue={renderQueue}
                    queuePaused={queuePaused}
                    workspaceView={workspaceView}
                    currentDept={currentDept}
                    isDriveConnected={isDriveConnected}
                    isMockDrive={isMockDrive}
                    onToggleQueue={onToggleQueue}
                    onChangeView={onChangeView}
                />

                <div className="flex-1 relative bg-black overflow-hidden">
                    {currentDept === DepartmentType.EDITORIAL ? (
                        editorialState.sequence ? (
                            <EditorTimeline 
                                sequenceAsset={editorialState.sequence}
                                filterAssetId={editorialState.filterId}
                                projectAssets={project.assets}
                                projectNodes={project.nodes}
                                onUpdateAsset={onUpdateAssetFull}
                                onUpdateNode={onUpdateNode}
                                onGenerateVideoForClip={onGenerateVideoForClip}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
                                <Scissors size={48} className="opacity-20" />
                                <p>Select a Sequence (created in Story) to start editing.</p>
                            </div>
                        )
                    ) : (
                        workspaceView === 'canvas' ? (
                            <Canvas 
                                nodes={project.nodes}
                                connections={project.connections}
                                setNodes={onSetNodes}
                                setConnections={onSetConnections}
                                currentDept={currentDept}
                                currentAssetId={currentAssetId}
                                activeAsset={activeAsset}
                                focusNodes={focusNodeIds}
                                onSetThumbnail={onSetThumbnail}
                                projectAssets={project.assets}
                                onRefineConcept={onRefineConcept}
                                refinedImagesMap={refinedImagesMap}
                                approvedImagesMap={approvedImagesMap}
                                projectSettings={project.settings}
                                onGenerateVideo={onGenerateVideo}
                                assetThumbnails={assetThumbnails}
                                onRequestGeneration={onRequestGeneration}
                            />
                        ) : (
                            <GalleryView 
                                nodes={project.nodes}
                                currentDept={currentDept}
                                currentAssetId={currentAssetId}
                                onGenerateBatch={onGalleryGenerate}
                                onSetThumbnail={onSetThumbnail}
                                onRefineConcept={onRefineConcept}
                                onGenerateTurntable={onGenerateTurntable}
                                onGenerateExpressions={onGenerateExpressions}
                                onUpdateNode={onUpdateNode}
                            />
                        )
                    )}
                    
                    {currentDept !== DepartmentType.EDITORIAL && <ChatBot scriptContext={scriptContext} />}
                </div>
            </div>

            {/* Queue Panel */}
            {isRenderQueueOpen && (
                <RenderQueuePanel 
                    queue={renderQueue} 
                    assets={project.assets}
                    onClose={onToggleQueue}
                    onPauseQueue={onPauseQueue}
                    onResumeQueue={onResumeQueue}
                    onStopTask={onStopTask}
                    isPaused={queuePaused}
                />
            )}

            {/* Queue Indicator */}
            {!isRenderQueueOpen && renderQueue.some(t => t.status === 'processing') && (
                <QueueIndicator queue={renderQueue} />
            )}

            {/* Asset Editor Panel */}
            {activeAsset && currentDept !== DepartmentType.EDITORIAL && (
                <AssetEditorPanel 
                    asset={activeAsset} 
                    projectAssets={project.assets}
                    onUpdate={onUpdateAssetFull} 
                    onGenerateConcepts={onGenerateConcepts}
                    onGenerateOutline={onGenerateOutline}
                    approvedImages={project.nodes
                        .filter(n => n.assetId === activeAsset.id && n.type === NodeType.AI_IMAGE_GEN && n.data.status === 'approved' && n.data.imageUrl && n.data.tag !== 'refinement')
                        .map(n => n.data.imageUrl!) || []
                    }
                    onNavigateToAsset={onNavigateToAsset}
                    onGenerateRefSheet={onRefineConcept}
                    assetThumbnails={assetThumbnails}
                    refinedImages={refinedImagesMap[activeAsset.id] || []}
                    projectSettings={project.settings}
                    onRemoveRef={onRemoveRef}
                />
            )}
        </div>
    );
};

export default WorkspaceLayout;
