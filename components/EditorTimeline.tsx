
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ProjectAsset, FlowNode, TimelineClip, NodeType } from '../types';
import { Play, Pause, Scissors, Trash2, SkipBack, Plus, Layers, Image as ImageIcon, Video, Volume2, MousePointer2, Filter, Music, Mic, CheckCircle, AlertCircle, Archive, MoreHorizontal, Undo } from 'lucide-react';

interface EditorTimelineProps {
    sequenceAsset: ProjectAsset;
    filterAssetId: string | null;
    projectAssets: ProjectAsset[];
    projectNodes: FlowNode[];
    onUpdateAsset: (asset: ProjectAsset) => void;
    onUpdateNode: (nodeId: string, data: any) => void;
}

const TRACK_CONFIG = [
    { id: 0, label: 'V1', type: 'video' },
    { id: 1, label: 'V2', type: 'video' },
    { id: 2, label: 'A1', type: 'audio' },
    { id: 3, label: 'A2', type: 'audio' },
];

export const EditorTimeline: React.FC<EditorTimelineProps> = ({ 
    sequenceAsset, filterAssetId, projectAssets, projectNodes, onUpdateAsset, onUpdateNode
}) => {
    // Timeline State
    const [clips, setClips] = useState<TimelineClip[]>(sequenceAsset.timelineData?.clips || []);
    const [history, setHistory] = useState<TimelineClip[][]>([]);
    
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
    const [scale, setScale] = useState(20); // Pixels per second
    const [binFilter, setBinFilter] = useState<'approved' | 'review' | 'all'>('approved');
    const [tool, setTool] = useState<'select' | 'split'>('select');
    
    // Interaction State
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [draggingClip, setDraggingClip] = useState<{ id: string, startX: number, originalStart: number, originalTrack: number } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, nodeId: string } | null>(null);

    // Playback Refs
    const requestRef = useRef<number | undefined>(undefined);
    const startTimeRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);
    const videoRefs = useRef<Record<string, HTMLVideoElement>>({});
    const timelineContainerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // --- Media Bin Logic ---
    const binItems = useMemo(() => {
        // Find relevant assets:
        // If filterAssetId is present, we only show media for THAT asset.
        // Otherwise, we show media for all children of the Sequence.
        
        let targetAssets = [];
        if (filterAssetId) {
            targetAssets = projectAssets.filter(a => a.id === filterAssetId);
        } else {
            targetAssets = projectAssets.filter(a => a.parentId === sequenceAsset.id);
        }

        const items: { node: FlowNode, asset: ProjectAsset, type: 'video' | 'image' }[] = [];

        targetAssets.forEach(asset => {
            const validNodes = projectNodes.filter(n => {
                if (n.assetId !== asset.id) return false;
                if (!n.data.imageUrl && !n.data.videoUrl) return false;
                
                const s = n.data.status || 'draft';
                if (binFilter === 'approved') return s === 'approved';
                if (binFilter === 'review') return s === 'review'; // Exclusive
                return true; // 'all'
            });
            
            validNodes.forEach(node => {
                items.push({
                    node,
                    asset,
                    type: node.type === NodeType.AI_VIDEO_GEN ? 'video' : 'image'
                });
            });
        });
        return items;
    }, [sequenceAsset, filterAssetId, projectAssets, projectNodes, binFilter]);

    // --- Undo Logic ---
    const saveToHistory = useCallback((newClips: TimelineClip[]) => {
        setHistory(prev => {
            const newHistory = [...prev, clips];
            if (newHistory.length > 20) newHistory.shift();
            return newHistory;
        });
        setClips(newClips);
    }, [clips]);

    const handleUndo = useCallback(() => {
        if (history.length === 0) return;
        const previous = history[history.length - 1];
        setClips(previous);
        setHistory(prev => prev.slice(0, -1));
    }, [history]);

    // --- Playback Loop ---
    const animate = (time: number) => {
        if (!startTimeRef.current) startTimeRef.current = time;
        const deltaTime = (time - lastTimeRef.current) / 1000;
        lastTimeRef.current = time;

        if (isPlaying) {
            setCurrentTime(prev => {
                const next = prev + deltaTime;
                const maxDuration = Math.max(...clips.map(c => c.start + c.duration), 0) + 1;
                if (next > maxDuration) {
                    setIsPlaying(false);
                    return 0;
                }
                return next;
            });
            requestRef.current = requestAnimationFrame(animate);
        }
    };

    useEffect(() => {
        if (isPlaying) {
            lastTimeRef.current = performance.now();
            requestRef.current = requestAnimationFrame(animate);
        } else {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isPlaying]);

    // Save on change
    useEffect(() => {
        // Debounce save slightly? Or just save.
        onUpdateAsset({
            ...sequenceAsset,
            timelineData: {
                clips,
                duration: Math.max(...clips.map(c => c.start + c.duration), 0)
            }
        });
    }, [clips]);

    // Global Interaction Handlers (Scrub & Drag)
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            // Scrubbing
            if (isScrubbing && timelineContainerRef.current) {
                const rect = timelineContainerRef.current.getBoundingClientRect();
                // We need to account for scrollLeft of the container
                const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
                const x = e.clientX - rect.left + scrollLeft;
                setCurrentTime(Math.max(0, x / scale));
            }

            // Dragging Clip
            if (draggingClip && timelineContainerRef.current) {
                const deltaX = e.clientX - draggingClip.startX;
                const deltaTime = deltaX / scale;
                
                setClips(prev => prev.map(c => {
                    if (c.id === draggingClip.id) {
                        return {
                            ...c,
                            start: Math.max(0, draggingClip.originalStart + deltaTime)
                        };
                    }
                    return c;
                }));
            }
        };

        const handleMouseUp = () => {
            if (isScrubbing) setIsScrubbing(false);
            if (draggingClip) {
                saveToHistory(clips); // Commit drag
                setDraggingClip(null);
            }
        };
        
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                handleUndo();
            }
        }

        if (isScrubbing || draggingClip) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isScrubbing, draggingClip, scale, clips, handleUndo, saveToHistory]);

    // --- Actions ---

    const handleAssemble = () => {
        if (clips.length > 0 && !window.confirm("Overwrite current timeline?")) return;

        let cursor = 0;
        const newClips: TimelineClip[] = [];

        // Sort children by title (Shot 1, Shot 2...) or simple creation order
        const childAssets = projectAssets
            .filter(a => a.parentId === sequenceAsset.id)
            .sort((a, b) => a.title.localeCompare(b.title, undefined, {numeric: true}));

        childAssets.forEach(asset => {
            // Find LATEST approved media
            const candidates = projectNodes.filter(n => n.assetId === asset.id && n.data.status === 'approved');
            // Sort by creation time (using ID timestamp) descending
            candidates.sort((a, b) => b.id.localeCompare(a.id));
            
            const selected = candidates[0]; // Take most recent approved
            
            if (selected) {
                const isVideo = selected.type === NodeType.AI_VIDEO_GEN;
                const url = isVideo ? selected.data.videoUrl! : selected.data.imageUrl!;
                const duration = isVideo && selected.data.duration ? parseFloat(selected.data.duration) : 5;

                newClips.push({
                    id: `clip-${Date.now()}-${Math.random()}`,
                    sourceNodeId: selected.id,
                    mediaUrl: url,
                    mediaType: isVideo ? 'video' : 'image',
                    start: cursor,
                    duration: duration,
                    offset: 0,
                    track: 0, // Assemble to V1
                    label: asset.title,
                    thumbnail: selected.data.imageUrl
                });
                cursor += duration;
            }
        });
        
        saveToHistory(newClips);
        setCurrentTime(0);
    };

    const handleSplit = () => {
        const target = clips.find(c => currentTime > c.start && currentTime < c.start + c.duration && (selectedClipId ? c.id === selectedClipId : true));
        if (!target) return;

        const splitPoint = currentTime - target.start;
        if (splitPoint <= 0.1 || splitPoint >= target.duration - 0.1) return;
        
        const left: TimelineClip = {
            ...target,
            duration: splitPoint
        };
        
        const right: TimelineClip = {
            ...target,
            id: `clip-${Date.now()}-split`,
            start: currentTime,
            duration: target.duration - splitPoint,
            offset: target.offset + splitPoint
        };
        
        const newClips = clips.map(c => c.id === target.id ? left : c).concat(right);
        saveToHistory(newClips);
    };

    const handleDelete = () => {
        if (!selectedClipId) return;
        const newClips = clips.filter(c => c.id !== selectedClipId);
        saveToHistory(newClips);
        setSelectedClipId(null);
    };

    // --- Drag & Drop from Bin ---
    
    const handleDragStart = (e: React.DragEvent, item: typeof binItems[0]) => {
        e.dataTransfer.setData('application/json', JSON.stringify(item));
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = (e: React.DragEvent, trackId: number) => {
        e.preventDefault();
        const data = e.dataTransfer.getData('application/json');
        if (!data) return;

        const item = JSON.parse(data) as typeof binItems[0];
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        // Adjust for scrollLeft
        const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
        const x = e.clientX - rect.left + scrollLeft; 
        const dropTime = Math.max(0, x / scale);

        const isVideo = item.type === 'video';
        const url = isVideo ? item.node.data.videoUrl! : item.node.data.imageUrl!;
        const duration = isVideo && item.node.data.duration ? parseFloat(item.node.data.duration) : 5;

        const newClip: TimelineClip = {
            id: `clip-${Date.now()}-${Math.random()}`,
            sourceNodeId: item.node.id,
            mediaUrl: url,
            mediaType: isVideo ? 'video' : 'image',
            start: dropTime,
            duration: duration,
            offset: 0,
            track: trackId,
            label: item.asset.title,
            thumbnail: item.node.data.imageUrl
        };

        saveToHistory([...clips, newClip]);
    };

    const handleClipMouseDown = (e: React.MouseEvent, clip: TimelineClip) => {
        e.stopPropagation();
        setSelectedClipId(clip.id);
        if (tool === 'select') {
             setDraggingClip({
                 id: clip.id,
                 startX: e.clientX,
                 originalStart: clip.start,
                 originalTrack: clip.track
             });
        }
    };
    
    const handleBinContextMenu = (e: React.MouseEvent, nodeId: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
    };

    const handleSetNodeStatus = (status: 'approved' | 'review' | 'archived') => {
        if (contextMenu) {
            onUpdateNode(contextMenu.nodeId, { status });
            setContextMenu(null);
        }
    };

    // --- Rendering Helpers ---
    const activeClip = useMemo(() => {
        const visible = clips.filter(c => currentTime >= c.start && currentTime < c.start + c.duration && (c.track === 0 || c.track === 1));
        return visible.sort((a, b) => b.track - a.track)[0];
    }, [clips, currentTime]);

    useEffect(() => {
        if (activeClip && activeClip.mediaType === 'video') {
            const vid = videoRefs.current[activeClip.id];
            if (vid) {
                const targetTime = activeClip.offset + (currentTime - activeClip.start);
                if (Math.abs(vid.currentTime - targetTime) > 0.3) {
                    vid.currentTime = targetTime;
                }
                if (isPlaying) vid.play().catch(() => {});
                else vid.pause();
            }
        }
        Object.keys(videoRefs.current).forEach(key => {
            if (key !== activeClip?.id) {
                videoRefs.current[key]?.pause();
            }
        });
    }, [activeClip, currentTime, isPlaying]);

    // Calculate total timeline width
    const totalDuration = Math.max(300, ...clips.map(c => c.start + c.duration + 10));

    return (
        <div className="w-full h-full flex flex-col bg-zinc-950 text-white font-sans overflow-hidden" onClick={() => setContextMenu(null)}>
            {/* Top Section: Bin & Player */}
            <div className="flex-1 flex min-h-0 border-b border-zinc-800">
                
                {/* BIN */}
                <div className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-900/50">
                    <div className="p-3 border-b border-zinc-800 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-xs uppercase text-zinc-400">
                                {filterAssetId ? "Shot Media" : "Sequence Bin"}
                            </h3>
                            <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">{binItems.length} items</span>
                        </div>
                        {/* Bin Filter */}
                        <div className="flex bg-zinc-900 rounded p-0.5">
                            {[
                                { id: 'approved', label: 'Approved' },
                                { id: 'review', label: 'Review' },
                                { id: 'all', label: 'All' }
                            ].map(f => (
                                <button 
                                    key={f.id}
                                    onClick={() => setBinFilter(f.id as any)}
                                    className={`flex-1 text-[9px] py-1 rounded font-medium transition-colors ${binFilter === f.id ? 'bg-zinc-700 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-3 content-start">
                        {binItems.map((item, idx) => (
                            <div 
                                key={idx} 
                                draggable
                                onDragStart={(e) => handleDragStart(e, item)}
                                onContextMenu={(e) => handleBinContextMenu(e, item.node.id)}
                                className="group relative aspect-square bg-black rounded border border-zinc-800 cursor-grab active:cursor-grabbing hover:border-blue-500 overflow-hidden"
                            >
                                {item.type === 'video' ? (
                                    <video src={item.node.data.videoUrl} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                                ) : (
                                    <img src={item.node.data.imageUrl} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                                )}
                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1 truncate text-[10px] text-zinc-300">
                                    {item.asset.title}
                                </div>
                                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-black/50 p-1 rounded">
                                    <Layers size={12} className="text-white"/>
                                </div>
                                {/* Status Icon */}
                                {item.node.data.status === 'approved' && <div className="absolute top-1 left-1 text-green-500 bg-black/50 rounded-full"><CheckCircle size={12}/></div>}
                                {item.node.data.status === 'review' && <div className="absolute top-1 left-1 text-yellow-500 bg-black/50 rounded-full"><AlertCircle size={12}/></div>}
                            </div>
                        ))}
                        {binItems.length === 0 && (
                            <div className="col-span-2 text-center p-4 text-zinc-600 text-xs italic">
                                No media matches filter.
                            </div>
                        )}
                    </div>
                    <div className="p-3 border-t border-zinc-800">
                        <button 
                            onClick={handleAssemble}
                            disabled={binItems.length === 0}
                            className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded flex items-center justify-center gap-2"
                        >
                            <Layers size={14} /> Auto-Assemble
                        </button>
                    </div>
                </div>

                {/* PLAYER */}
                <div className="flex-1 bg-black flex flex-col relative">
                    <div className="flex-1 flex items-center justify-center relative overflow-hidden">
                        {activeClip ? (
                            activeClip.mediaType === 'video' ? (
                                <video 
                                    ref={el => { if(el) videoRefs.current[activeClip.id] = el; }}
                                    src={activeClip.mediaUrl}
                                    className="max-w-full max-h-full shadow-2xl"
                                    playsInline
                                    muted={false} // Enable audio monitoring
                                />
                            ) : (
                                <img src={activeClip.mediaUrl} className="max-w-full max-h-full shadow-2xl" />
                            )
                        ) : (
                            <div className="text-zinc-700 text-sm font-mono flex flex-col items-center gap-2">
                                <div className="w-16 h-10 border-2 border-zinc-800 rounded flex items-center justify-center">
                                    <Play size={16} fill="currentColor"/>
                                </div>
                                <span>NO SIGNAL</span>
                            </div>
                        )}
                        
                        {/* Timecode Overlay */}
                        <div className="absolute bottom-4 right-4 font-mono text-xl font-bold text-white drop-shadow-md tabular-nums bg-black/50 px-2 py-1 rounded">
                            {new Date(currentTime * 1000).toISOString().substr(14, 8)}
                            <span className="text-sm text-zinc-400 ml-1">.{(currentTime % 1).toFixed(2).substr(2)}</span>
                        </div>
                    </div>

                    {/* Transport Controls */}
                    <div className="h-12 border-t border-zinc-800 bg-zinc-900 flex items-center justify-center gap-4">
                        <button onClick={() => setCurrentTime(0)} className="text-zinc-400 hover:text-white"><SkipBack size={18}/></button>
                        <button 
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
                        >
                            {isPlaying ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor" className="ml-0.5"/>}
                        </button>
                    </div>
                </div>
            </div>

            {/* Bottom Section: Timeline */}
            <div className="h-72 shrink-0 border-t border-zinc-800 bg-zinc-900/80 flex flex-row relative select-none">
                
                {/* Editing Toolbar */}
                <div className="w-10 flex flex-col items-center py-2 gap-2 border-r border-zinc-800 bg-zinc-900 z-30 relative shadow-xl">
                    <button 
                        onClick={() => setTool('select')}
                        className={`p-2 rounded hover:bg-zinc-700 transition-colors ${tool === 'select' ? 'text-blue-400 bg-zinc-800' : 'text-zinc-400'}`}
                        title="Select Tool (V)"
                    >
                        <MousePointer2 size={16} />
                    </button>
                    <button 
                        onClick={() => { setTool('split'); handleSplit(); }}
                        className={`p-2 rounded hover:bg-zinc-700 transition-colors ${tool === 'split' ? 'text-blue-400 bg-zinc-800' : 'text-zinc-400'}`}
                        title="Split Clip (C)"
                    >
                        <Scissors size={16} />
                    </button>
                    <button 
                        onClick={handleDelete}
                        className="p-2 rounded hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-red-400 mt-2"
                        title="Delete Selected (Del)"
                    >
                        <Trash2 size={16} />
                    </button>
                    
                     <button 
                        onClick={handleUndo}
                        disabled={history.length === 0}
                        className="p-2 rounded hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-white mt-auto mb-2 disabled:opacity-30"
                        title="Undo (Ctrl+Z)"
                    >
                        <Undo size={16} />
                    </button>
                </div>

                <div className="flex-1 flex flex-col min-w-0">
                    
                    {/* Fixed Headers Column + Scrollable Content */}
                    <div className="flex-1 flex overflow-hidden">
                         
                         {/* Track Headers Column */}
                         <div className="w-24 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col z-20 shadow-lg">
                             <div className="h-8 border-b border-zinc-800 bg-zinc-800/50 flex items-center justify-center text-[10px] font-bold text-zinc-500">
                                 TIMECODE
                             </div>
                             {TRACK_CONFIG.map(track => (
                                 <div key={track.id} className="h-24 border-b border-zinc-800 flex flex-col items-center justify-center text-xs text-zinc-500">
                                     <div className="font-bold flex items-center gap-1">
                                        {track.type === 'audio' ? <Music size={10} /> : <Video size={10} />}
                                        {track.label}
                                    </div>
                                 </div>
                             ))}
                         </div>

                         {/* Scrollable Tracks & Ruler */}
                         <div className="flex-1 overflow-auto bg-zinc-900/10 relative" ref={scrollContainerRef}>
                              <div className="relative min-w-full" style={{ width: totalDuration * scale, minWidth: '100%' }}>
                                   {/* Ruler */}
                                   <div 
                                        className="h-8 border-b border-zinc-800 bg-zinc-900/80 sticky top-0 z-10 flex cursor-ew-resize"
                                        onMouseDown={() => setIsScrubbing(true)}
                                   >
                                        {Array.from({ length: Math.ceil(totalDuration) }).map((_, i) => (
                                            <div key={i} className="absolute top-0 bottom-0 border-l border-zinc-800 text-[9px] text-zinc-600 pl-1 pt-1 pointer-events-none" style={{ left: i * scale * 5 }}>
                                                {i * 5}s
                                            </div>
                                        ))}
                                   </div>

                                   {/* Track Rows */}
                                   <div className="relative" ref={timelineContainerRef}>
                                       {/* Playhead Line (Under clips? No, Overlay) */}
                                       <div 
                                            className="absolute top-0 bottom-0 w-[1px] bg-red-500 z-30 pointer-events-none"
                                            style={{ left: currentTime * scale, height: '100%' }}
                                       >
                                            <div className="absolute -top-3 -left-1.5 w-3 h-3 bg-red-500 transform rotate-45" />
                                       </div>

                                       {TRACK_CONFIG.map(track => (
                                           <div 
                                                key={track.id} 
                                                className={`h-24 border-b border-zinc-800 relative ${track.type === 'audio' ? 'bg-zinc-900/40' : 'bg-zinc-900/20'}`}
                                                onDragOver={handleDragOver}
                                                onDrop={(e) => handleDrop(e, track.id)}
                                            >
                                                {clips.filter(c => c.track === track.id).map(clip => (
                                                    <div
                                                        key={clip.id}
                                                        className={`absolute top-1 bottom-1 rounded overflow-hidden cursor-pointer border ring-offset-1 ring-offset-zinc-900 transition-shadow select-none
                                                            ${selectedClipId === clip.id ? 'border-white ring-2 ring-blue-500 z-20' : 'border-zinc-700 hover:border-zinc-500 opacity-90'}
                                                            ${draggingClip?.id === clip.id ? 'opacity-50 cursor-grabbing' : ''}
                                                        `}
                                                        style={{
                                                            left: clip.start * scale,
                                                            width: clip.duration * scale,
                                                            backgroundColor: clip.mediaType === 'video' ? '#1e3a8a' : (track.type === 'audio' ? '#0f766e' : '#581c87')
                                                        }}
                                                        onMouseDown={(e) => handleClipMouseDown(e, clip)}
                                                    >
                                                        <div className="w-full h-full flex items-center relative overflow-hidden">
                                                            {clip.thumbnail && track.type !== 'audio' && (
                                                                <img src={clip.thumbnail} className="h-full w-auto object-cover opacity-50 grayscale mix-blend-overlay pointer-events-none" />
                                                            )}
                                                            <div className="absolute inset-0 p-1.5 flex flex-col justify-between pointer-events-none">
                                                                <span className="text-[10px] font-bold text-white truncate drop-shadow-md">{clip.label}</span>
                                                                {track.type !== 'audio' && <span className="text-[9px] text-white/70 font-mono drop-shadow-md">{clip.duration.toFixed(1)}s</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                           </div>
                                       ))}
                                   </div>
                              </div>
                         </div>
                    </div>
                </div>
            </div>

            {/* Context Menu for Bin Items */}
            {contextMenu && (
                <div 
                    className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[140px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-3 py-2 border-b border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase">Set Status</div>
                    <button onClick={() => handleSetNodeStatus('approved')} className="w-full text-left px-3 py-2 text-xs hover:bg-green-900/30 text-green-400 flex items-center gap-2">
                        <CheckCircle size={12} /> Approved
                    </button>
                    <button onClick={() => handleSetNodeStatus('review')} className="w-full text-left px-3 py-2 text-xs hover:bg-yellow-900/30 text-yellow-400 flex items-center gap-2">
                        <AlertCircle size={12} /> Review
                    </button>
                    <button onClick={() => handleSetNodeStatus('archived')} className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 text-zinc-400 flex items-center gap-2">
                        <Archive size={12} /> Archive
                    </button>
                </div>
            )}
        </div>
    );
};
