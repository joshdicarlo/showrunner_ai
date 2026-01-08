
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ProjectAsset, FlowNode, TimelineClip, NodeType } from '../types';
import { Play, Pause, Scissors, Trash2, SkipBack, Plus, Layers, Image as ImageIcon, Video, Volume2, MousePointer2, Filter, Music, Mic, CheckCircle, AlertCircle, Archive, MoreHorizontal, Undo, GripHorizontal, Edit2, StepBack, StepForward, SkipForward, ChevronLeft, ChevronRight, RefreshCw, Sparkles, Film } from 'lucide-react';
import { MODELS } from '../constants';

interface EditorTimelineProps {
    sequenceAsset: ProjectAsset;
    filterAssetId: string | null;
    projectAssets: ProjectAsset[];
    projectNodes: FlowNode[];
    onUpdateAsset: (asset: ProjectAsset) => void;
    onUpdateNode: (nodeId: string, data: any) => void;
    onGenerateVideoForClip?: (clipId: string, sourceNodeId: string, replace: boolean, model: string) => void;
}

interface TrackConfig {
    id: number;
    label: string;
    type: 'video' | 'audio';
    height: number;
}

const DEFAULT_TRACKS: TrackConfig[] = [
    { id: 0, label: 'V1', type: 'video', height: 80 },
    { id: 1, label: 'V2', type: 'video', height: 80 },
    { id: 2, label: 'A1', type: 'audio', height: 64 },
    { id: 3, label: 'A2', type: 'audio', height: 64 },
];

export const EditorTimeline: React.FC<EditorTimelineProps> = ({ 
    sequenceAsset, filterAssetId, projectAssets, projectNodes, onUpdateAsset, onUpdateNode, onGenerateVideoForClip
}) => {
    // --- State ---
    const [clips, setClips] = useState<TimelineClip[]>(sequenceAsset.timelineData?.clips || []);
    const [history, setHistory] = useState<TimelineClip[][]>([]);
    const [tracks, setTracks] = useState<TrackConfig[]>(DEFAULT_TRACKS);
    
    // Viewport & Layout
    const [currentTime, setCurrentTime] = useState(0);
    const [scale, setScale] = useState(20); // Pixels per second
    const [timelineHeight, setTimelineHeight] = useState(320);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [scrollTop, setScrollTop] = useState(0);

    // Playback
    const [isPlaying, setIsPlaying] = useState(false);
    
    // Selection & Editing
    const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(new Set());
    const [binFilter, setBinFilter] = useState<'approved' | 'review' | 'all'>('approved');
    const [tool, setTool] = useState<'select' | 'split'>('select');
    
    // Interaction State
    const [interactionMode, setInteractionMode] = useState<'none' | 'scrubbing' | 'dragging' | 'trimming' | 'marquee'>('none');
    const [draggingClips, setDraggingClips] = useState<{ id: string, originalStart: number, originalTrack: number }[] | null>(null);
    const [trimmingClip, setTrimmingClip] = useState<{ id: string, side: 'start' | 'end', originalStart: number, originalDuration: number, originalOffset: number, sourceDuration?: number } | null>(null);
    
    const [dragStartX, setDragStartX] = useState(0);
    const [dragStartY, setDragStartY] = useState(0);
    
    // Marquee
    const [marqueeBox, setMarqueeBox] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
    
    // Resizing
    const [isResizingTimeline, setIsResizingTimeline] = useState(false);
    const [resizingTrackId, setResizingTrackId] = useState<number | null>(null);
    const [editingTrackId, setEditingTrackId] = useState<number | null>(null);

    // Context Menu
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, nodeId?: string, clipId?: string } | null>(null);
    
    // Version Flyout
    const [versionFlyout, setVersionFlyout] = useState<{ clipId: string, versions: FlowNode[] } | null>(null);

    // Refs
    const requestRef = useRef<number | undefined>(undefined);
    const startTimeRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);
    const videoPlayerRef = useRef<HTMLVideoElement>(null);
    
    // Layout Refs for Sync Scroll
    const headerRef = useRef<HTMLDivElement>(null);
    const rulerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);

    // --- Effect: Independent Timeline State ---
    useEffect(() => {
        setClips(sequenceAsset.timelineData?.clips || []);
        setHistory([]);
        setCurrentTime(0);
        setSelectedClipIds(new Set());
    }, [sequenceAsset.id]);

    // --- Sync Scrolling ---
    const handleContentScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        setScrollLeft(target.scrollLeft);
        setScrollTop(target.scrollTop);
        
        if (headerRef.current) headerRef.current.scrollTop = target.scrollTop;
        if (rulerRef.current) rulerRef.current.scrollLeft = target.scrollLeft;
    };

    // --- Media Bin Logic ---
    const binItems = useMemo(() => {
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
                if (binFilter === 'review') return s === 'review'; 
                return true; 
            });
            
            validNodes.forEach(node => {
                items.push({
                    node,
                    asset,
                    type: (node.type === NodeType.AI_VIDEO_GEN || node.data.videoUrl) ? 'video' : 'image'
                });
            });
        });
        return items;
    }, [sequenceAsset, filterAssetId, projectAssets, projectNodes, binFilter]);

    // --- History Logic ---
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

    // Auto-Save to Asset
    useEffect(() => {
        onUpdateAsset({
            ...sequenceAsset,
            timelineData: {
                clips,
                duration: Math.max(...clips.map(c => c.start + c.duration), 0)
            }
        });
    }, [clips]);

    // --- Mouse Interaction Handlers ---
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (interactionMode === 'scrubbing' && timelineRef.current) {
                const rect = timelineRef.current.getBoundingClientRect();
                const headerWidth = 96; 
                const relativeX = e.clientX - rect.left - headerWidth + scrollLeft;
                setCurrentTime(Math.max(0, relativeX / scale));
            }
            if (isResizingTimeline) {
                const newHeight = window.innerHeight - e.clientY;
                setTimelineHeight(Math.max(150, Math.min(newHeight, window.innerHeight - 100)));
            }
            if (resizingTrackId !== null) {
                setTracks(prev => prev.map(t => t.id === resizingTrackId ? { ...t, height: Math.max(32, t.height + e.movementY) } : t));
            }
            if (interactionMode === 'dragging' && draggingClips && contentRef.current) {
                const deltaX = (e.clientX - dragStartX) / scale;
                const rect = contentRef.current.getBoundingClientRect();
                const relativeY = e.clientY - rect.top + scrollTop;
                
                let targetTrackId = draggingClips[0].originalTrack;
                let currentY = 0;
                for (const track of tracks) {
                    if (relativeY >= currentY && relativeY < currentY + track.height) {
                        targetTrackId = track.id;
                        break;
                    }
                    currentY += track.height;
                }

                setClips(prev => prev.map(c => {
                    const dragging = draggingClips.find(dc => dc.id === c.id);
                    if (dragging) {
                        const targetTrack = tracks.find(t => t.id === targetTrackId);
                        const isCompatible = targetTrack && 
                            ((c.mediaType === 'video' && targetTrack.type === 'video') || 
                             (c.mediaType === 'audio' && targetTrack.type === 'audio') ||
                             (c.mediaType === 'image' && targetTrack.type === 'video'));

                        return {
                            ...c,
                            start: Math.max(0, dragging.originalStart + deltaX),
                            track: isCompatible ? targetTrackId : dragging.originalTrack
                        };
                    }
                    return c;
                }));
            }
            if (interactionMode === 'trimming' && trimmingClip) {
                const deltaX = (e.clientX - dragStartX) / scale;
                setClips(prev => prev.map(c => {
                    if (c.id === trimmingClip.id) {
                        if (trimmingClip.side === 'end') {
                            let newDuration = Math.max(0.1, trimmingClip.originalDuration + deltaX);
                            if (trimmingClip.sourceDuration) newDuration = Math.min(newDuration, trimmingClip.sourceDuration - trimmingClip.originalOffset);
                            return { ...c, duration: newDuration };
                        } else {
                            let newStart = Math.max(0, trimmingClip.originalStart + deltaX);
                            let change = newStart - trimmingClip.originalStart;
                            if (c.mediaType === 'video' && trimmingClip.originalOffset + change < 0) {
                                change = -trimmingClip.originalOffset;
                                newStart = trimmingClip.originalStart + change;
                            }
                            return {
                                ...c,
                                start: newStart,
                                duration: Math.max(0.1, trimmingClip.originalDuration - change),
                                offset: c.mediaType === 'video' ? trimmingClip.originalOffset + change : 0
                            };
                        }
                    }
                    return c;
                }));
            }
            if (interactionMode === 'marquee' && marqueeBox && contentRef.current) {
                const rect = contentRef.current.getBoundingClientRect();
                const currentX = e.clientX - rect.left + scrollLeft;
                const currentY = e.clientY - rect.top + scrollTop;
                setMarqueeBox(prev => prev ? { ...prev, w: currentX - marqueeBox.x, h: currentY - marqueeBox.y } : null);
            }
        };

        const handleMouseUp = (e: MouseEvent) => {
            if (interactionMode === 'dragging' || interactionMode === 'trimming') {
                saveToHistory(clips);
            }
            
            setInteractionMode('none');
            setIsResizingTimeline(false);
            setResizingTrackId(null);
            setDraggingClips(null);
            setTrimmingClip(null);

            if (marqueeBox) {
                const boxX = marqueeBox.w < 0 ? marqueeBox.x + marqueeBox.w : marqueeBox.x;
                const boxY = marqueeBox.h < 0 ? marqueeBox.y + marqueeBox.h : marqueeBox.y;
                const boxW = Math.abs(marqueeBox.w);
                const boxH = Math.abs(marqueeBox.h);

                const newSelection = new Set<string>();
                if (e.shiftKey || e.ctrlKey) selectedClipIds.forEach(id => newSelection.add(id));

                let currentTrackY = 0;
                tracks.forEach(track => {
                    if (boxY < currentTrackY + track.height && boxY + boxH > currentTrackY) {
                        clips.filter(c => c.track === track.id).forEach(clip => {
                            const clipStartPx = clip.start * scale;
                            const clipEndPx = (clip.start + clip.duration) * scale;
                            if (boxX < clipEndPx && boxX + boxW > clipStartPx) newSelection.add(clip.id);
                        });
                    }
                    currentTrackY += track.height;
                });
                
                setSelectedClipIds(newSelection);
                setMarqueeBox(null);
            }
        };
        
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo(); }
            if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedClipIds.size > 0) handleDelete(); }
        }

        if (interactionMode !== 'none' || isResizingTimeline || resizingTrackId !== null) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [interactionMode, draggingClips, trimmingClip, dragStartX, dragStartY, clips, handleUndo, saveToHistory, scale, tracks, isResizingTimeline, resizingTrackId, marqueeBox, selectedClipIds, scrollLeft, scrollTop]);


    // --- Actions ---
    const handleAssemble = () => {
        if (clips.length > 0 && !window.confirm("Overwrite current timeline?")) return;
        let cursor = 0;
        const newClips: TimelineClip[] = [];
        const childAssets = projectAssets.filter(a => a.parentId === sequenceAsset.id).sort((a, b) => a.title.localeCompare(b.title, undefined, {numeric: true}));

        childAssets.forEach(asset => {
            const candidates = projectNodes.filter(n => n.assetId === asset.id && n.data.status === 'approved');
            candidates.sort((a, b) => b.id.localeCompare(a.id)); 
            const selected = candidates[0]; 
            if (selected) {
                const isVideo = selected.type === NodeType.AI_VIDEO_GEN || !!selected.data.videoUrl;
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
                    track: 0, 
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
        const toSplit = clips.filter(c => selectedClipIds.has(c.id));
        const target = toSplit.length > 0 ? toSplit : clips.filter(c => c.track === 0);
        let newClips = [...clips];
        let hasSplit = false;
        target.forEach(clip => {
            if (currentTime > clip.start && currentTime < clip.start + clip.duration) {
                const splitPoint = currentTime - clip.start;
                if (splitPoint <= 0.1 || splitPoint >= clip.duration - 0.1) return;
                const left: TimelineClip = { ...clip, duration: splitPoint };
                const right: TimelineClip = { ...clip, id: `clip-${Date.now()}-${Math.random()}`, start: currentTime, duration: clip.duration - splitPoint, offset: clip.offset + splitPoint };
                newClips = newClips.filter(c => c.id !== clip.id).concat([left, right]);
                hasSplit = true;
            }
        });
        if (hasSplit) saveToHistory(newClips);
    };

    const handleDelete = () => {
        if (selectedClipIds.size === 0) return;
        const newClips = clips.filter(c => !selectedClipIds.has(c.id));
        saveToHistory(newClips);
        setSelectedClipIds(new Set());
    };

    // --- Transport Logic ---
    const stepFrame = (frames: number) => { const frameTime = 1/24; setCurrentTime(t => Math.max(0, t + (frames * frameTime))); };
    const stepToCut = (direction: 'next' | 'prev') => {
        const cuts = new Set<number>([0]);
        clips.forEach(c => { cuts.add(c.start); cuts.add(c.start + c.duration); });
        const sortedCuts = Array.from(cuts).sort((a, b) => a - b);
        if (direction === 'next') { const next = sortedCuts.find(c => c > currentTime + 0.01); if (next !== undefined) setCurrentTime(next); } 
        else { const prev = sortedCuts.reverse().find(c => c < currentTime - 0.01); if (prev !== undefined) setCurrentTime(prev); }
    };

    // --- Event Handlers ---
    const handleClipMouseDown = (e: React.MouseEvent, clipId: string) => {
        e.stopPropagation();
        const newSelection = new Set(selectedClipIds);
        if (e.shiftKey || e.ctrlKey) { if (newSelection.has(clipId)) newSelection.delete(clipId); else newSelection.add(clipId); } else { if (!newSelection.has(clipId)) { newSelection.clear(); newSelection.add(clipId); } }
        setSelectedClipIds(newSelection);
        if (tool === 'select') {
            setDragStartX(e.clientX); setDragStartY(e.clientY); setInteractionMode('dragging');
            const dragging = clips.filter(c => newSelection.has(c.id)).map(c => ({ id: c.id, originalStart: c.start, originalTrack: c.track }));
            setDraggingClips(dragging);
        }
    };

    const handleTrimMouseDown = (e: React.MouseEvent, clip: TimelineClip, side: 'start' | 'end') => {
        e.stopPropagation(); setDragStartX(e.clientX); setInteractionMode('trimming');
        let sourceDuration: number | undefined = undefined;
        if (clip.mediaType === 'video') { const node = projectNodes.find(n => n.id === clip.sourceNodeId); if (node && node.data.duration) sourceDuration = parseFloat(node.data.duration); else sourceDuration = 8; }
        setTrimmingClip({ id: clip.id, side, originalStart: clip.start, originalDuration: clip.duration, originalOffset: clip.offset, sourceDuration });
    };

    const handleTimelineMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        if (contentRef.current) {
            const rect = contentRef.current.getBoundingClientRect(); const x = e.clientX - rect.left + scrollLeft; const y = e.clientY - rect.top + scrollTop;
            setInteractionMode('marquee'); setMarqueeBox({ x, y, w: 0, h: 0 });
            if (!e.shiftKey && !e.ctrlKey) setSelectedClipIds(new Set());
        }
    };

    const handleDragStart = (e: React.DragEvent, item: typeof binItems[0]) => { e.dataTransfer.setData('application/json', JSON.stringify(item)); e.dataTransfer.effectAllowed = 'copy'; };
    const handleDrop = (e: React.DragEvent, trackId: number) => {
        e.preventDefault(); const data = e.dataTransfer.getData('application/json'); if (!data) return;
        const item = JSON.parse(data) as typeof binItems[0];
        if (contentRef.current) {
            const rect = contentRef.current.getBoundingClientRect(); const x = e.clientX - rect.left + scrollLeft; const dropTime = Math.max(0, x / scale);
            const isVideo = item.type === 'video' || !!item.node.data.videoUrl; 
            const url = isVideo ? item.node.data.videoUrl! : item.node.data.imageUrl!; 
            const duration = isVideo && item.node.data.duration ? parseFloat(item.node.data.duration) : 5;
            const newClip: TimelineClip = { id: `clip-${Date.now()}-${Math.random()}`, sourceNodeId: item.node.id, mediaUrl: url, mediaType: isVideo ? 'video' : 'image', start: dropTime, duration, offset: 0, track: trackId, label: item.asset.title, thumbnail: item.node.data.imageUrl };
            saveToHistory([...clips, newClip]);
        }
    };
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };

    const handleSetNodeStatus = (status: 'approved' | 'review' | 'archived') => { if (contextMenu && contextMenu.nodeId) { onUpdateNode(contextMenu.nodeId, { status }); setContextMenu(null); } };

    // --- Versioning Logic ---
    const handleReplaceVersion = (node: FlowNode) => {
        if (versionFlyout) {
            const clip = clips.find(c => c.id === versionFlyout.clipId);
            if (clip) {
                const isVideo = node.type === NodeType.AI_VIDEO_GEN || !!node.data.videoUrl;
                const newClip: TimelineClip = {
                    ...clip,
                    sourceNodeId: node.id,
                    mediaUrl: isVideo ? node.data.videoUrl! : node.data.imageUrl!,
                    mediaType: isVideo ? 'video' : 'image',
                    thumbnail: node.data.imageUrl
                };
                saveToHistory(clips.map(c => c.id === clip.id ? newClip : c));
            }
            setVersionFlyout(null);
        }
    };

    const showVersions = (clipId: string, assetId: string, anchorX: number, anchorY: number) => {
        const versions = projectNodes.filter(n => n.assetId === assetId && (n.data.imageUrl || n.data.videoUrl));
        versions.sort((a, b) => b.id.localeCompare(a.id));
        setVersionFlyout({ clipId, versions });
        setContextMenu({ x: anchorX, y: anchorY });
    };

    const handleGenerateVideoForClipAction = (replace: boolean, instant: boolean) => {
        if (contextMenu && (contextMenu.clipId || selectedClipIds.size > 0) && onGenerateVideoForClip) {
            // Determine targets: if the right-clicked clip is selected, process the whole selection.
            // Otherwise, process only the right-clicked clip.
            const targetIds = (contextMenu.clipId && selectedClipIds.has(contextMenu.clipId))
                ? Array.from(selectedClipIds)
                : (contextMenu.clipId ? [contextMenu.clipId] : []);

            targetIds.forEach(id => {
                const clip = clips.find(c => c.id === id);
                if (clip) {
                    const model = instant ? MODELS.VIDEO_FAST : MODELS.VIDEO_HQ;
                    onGenerateVideoForClip(clip.id, clip.sourceNodeId, replace, model);
                }
            });
        }
        setContextMenu(null);
    }

    const totalDuration = Math.max(60, ...clips.map(c => c.start + c.duration + 10));
    
    const activeClip = useMemo(() => { 
        const visible = clips.filter(c => currentTime >= c.start && currentTime < c.start + c.duration && (c.track === 0 || c.track === 1)); 
        return visible.sort((a, b) => b.track - a.track)[0]; 
    }, [clips, currentTime]);

    // --- Video Scrubbing & Sync Effect ---
    useEffect(() => {
        const video = videoPlayerRef.current;
        if (!video || !activeClip || activeClip.mediaType !== 'video') return;

        const clipLocalTime = (currentTime - activeClip.start) + (activeClip.offset || 0);

        if (!isPlaying) {
            video.pause();
            // Sync currentTime for scrubbing. Using a threshold to avoid jitter.
            if (Math.abs(video.currentTime - clipLocalTime) > 0.03) {
                video.currentTime = clipLocalTime;
            }
        } else {
            // When playing, ensure the video is actually playing
            if (video.paused) {
                video.play().catch(e => console.warn("Video playback blocked", e));
            }
            // Sync time if drift is significant (e.g. over 0.25s)
            if (Math.abs(video.currentTime - clipLocalTime) > 0.25) {
                video.currentTime = clipLocalTime;
            }
        }
    }, [currentTime, isPlaying, activeClip]);

    return (
        <div className="w-full h-full flex flex-col bg-zinc-950 text-white font-sans overflow-hidden" onClick={() => { setContextMenu(null); setEditingTrackId(null); setVersionFlyout(null); }}>
            
            <div className="flex-1 flex min-h-0 border-b border-zinc-800">
                {/* BIN */}
                <div className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-900/50">
                    <div className="p-3 border-b border-zinc-800 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-xs uppercase text-zinc-400">{filterAssetId ? "Shot Media" : "Sequence Bin"}</h3>
                            <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">{binItems.length} items</span>
                        </div>
                        <div className="flex bg-zinc-900 rounded p-0.5">
                            {['approved', 'review', 'all'].map(f => ( <button key={f} onClick={() => setBinFilter(f as any)} className={`flex-1 text-[9px] py-1 rounded capitalize ${binFilter === f ? 'bg-zinc-700 text-white' : 'text-zinc-500'}`}>{f}</button> ))}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-3 content-start">
                        {binItems.map((item, idx) => (
                            <div key={idx} draggable onDragStart={(e) => handleDragStart(e, item)} onContextMenu={(e) => { e.preventDefault(); setContextMenu({x: e.clientX, y: e.clientY, nodeId: item.node.id}); }} className="group relative aspect-square bg-black rounded border border-zinc-800 cursor-grab active:cursor-grabbing hover:border-blue-500 overflow-hidden">
                                <img src={item.node.data.imageUrl} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1 truncate text-[10px] text-zinc-300">{item.asset.title}</div>
                                <div className="absolute top-1 left-1 flex gap-1">
                                    {item.node.data.status === 'approved' && <CheckCircle size={14} className="text-green-500 fill-black" />}
                                    {item.node.data.status === 'review' && <AlertCircle size={14} className="text-yellow-500 fill-black" />}
                                </div>
                                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-black/50 p-1 rounded">
                                    {item.type === 'video' ? <Video size={12}/> : <Layers size={12}/>}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="p-3 border-t border-zinc-800">
                        <button onClick={handleAssemble} className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded flex items-center justify-center gap-2"><Layers size={14} /> Auto-Assemble</button>
                    </div>
                </div>

                {/* PLAYER */}
                <div className="flex-1 bg-black flex flex-col relative">
                    <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-zinc-950">
                        {activeClip ? (
                            activeClip.mediaType === 'video' ? (
                                <video 
                                    ref={videoPlayerRef}
                                    key={activeClip.mediaUrl} 
                                    src={activeClip.mediaUrl} 
                                    muted 
                                    playsInline 
                                    className="max-w-full max-h-full shadow-2xl" 
                                />
                            ) : (
                                <img src={activeClip.mediaUrl} className="max-w-full max-h-full shadow-2xl" />
                            )
                        ) : (
                            <div className="text-zinc-800 text-6xl font-black opacity-20 select-none">OFFLINE</div>
                        )}
                        <div className="absolute bottom-4 right-4 font-mono text-xl font-bold text-white drop-shadow-md tabular-nums bg-black/50 px-2 py-1 rounded">
                            {new Date(currentTime * 1000).toISOString().substr(14, 8)}
                            <span className="text-sm text-zinc-400 ml-1">.{(currentTime % 1).toFixed(2).substr(2)}</span>
                        </div>
                    </div>
                    {/* Transport */}
                    <div className="h-12 border-t border-zinc-800 bg-zinc-900 flex items-center justify-center gap-4">
                        <button onClick={() => setCurrentTime(0)} className="text-zinc-400 hover:text-white" title="Start"><SkipBack size={16}/></button>
                        <div className="flex items-center gap-2 border-r border-zinc-700 pr-4 mr-2">
                            <button onClick={() => stepToCut('prev')} className="text-zinc-400 hover:text-white p-1" title="Previous Cut"><StepBack size={16}/></button>
                            <button onClick={() => stepFrame(-1)} className="text-zinc-400 hover:text-white p-1" title="Previous Frame"><ChevronLeft size={16} strokeWidth={3}/></button>
                        </div>
                        <button onClick={() => setIsPlaying(!isPlaying)} className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform">
                            {isPlaying ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor" className="ml-0.5"/>}
                        </button>
                        <div className="flex items-center gap-2 border-l border-zinc-700 pl-4 ml-2">
                            <button onClick={() => stepFrame(1)} className="text-zinc-400 hover:text-white p-1" title="Next Frame"><ChevronRight size={16} strokeWidth={3}/></button>
                            <button onClick={() => stepToCut('next')} className="text-zinc-400 hover:text-white p-1" title="Next Cut"><SkipForward size={16}/></button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Section: Timeline */}
            <div ref={timelineRef} className="shrink-0 border-t border-zinc-800 bg-zinc-900/80 flex flex-col relative select-none" style={{ height: timelineHeight }}>
                <div className="h-1 bg-zinc-800 hover:bg-blue-500 cursor-row-resize w-full z-50 transition-colors" onMouseDown={() => setIsResizingTimeline(true)} />
                <div className="h-8 border-b border-zinc-800 flex items-center px-2 gap-2 bg-zinc-900">
                    <div className="flex bg-zinc-800 rounded p-0.5">
                        <button onClick={() => setTool('select')} className={`p-1 rounded ${tool === 'select' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}><MousePointer2 size={14}/></button>
                        <button onClick={() => setTool('split')} className={`p-1 rounded ${tool === 'split' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}><Scissors size={14}/></button>
                    </div>
                    <div className="w-[1px] h-4 bg-zinc-700 mx-1"/>
                    <button onClick={handleDelete} className="text-zinc-400 hover:text-red-400 p-1"><Trash2 size={14}/></button>
                    <button onClick={handleUndo} className="text-zinc-400 hover:text-white p-1 ml-auto"><Undo size={14}/></button>
                </div>

                {/* Timeline Body */}
                <div className="flex-1 flex min-h-0">
                    <div className="w-24 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col z-20 shadow-lg">
                        <div className="h-8 border-b border-zinc-800 bg-zinc-800/50 flex items-center justify-center text-[10px] font-bold text-zinc-500 shrink-0">TRACKS</div>
                        <div ref={headerRef} className="flex-1 overflow-hidden">
                            {tracks.map(track => (
                                <div key={track.id} className="border-b border-zinc-800 flex flex-col relative group" style={{ height: track.height }}>
                                    <div className="flex-1 flex items-center justify-between px-2">
                                        <div className="font-bold flex items-center gap-1 text-xs text-zinc-500 cursor-pointer hover:text-white" onDoubleClick={() => setEditingTrackId(track.id)}>
                                            {track.type === 'audio' ? <Music size={10} /> : <Video size={10} />}
                                            {track.label}
                                        </div>
                                    </div>
                                    <div className="h-1 cursor-row-resize hover:bg-blue-500 absolute bottom-0 left-0 right-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => { e.stopPropagation(); setResizingTrackId(track.id); }} />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col min-w-0 bg-zinc-900/10">
                        <div ref={rulerRef} className="h-8 border-b border-zinc-800 bg-zinc-900/80 overflow-hidden relative shrink-0">
                            <div className="relative h-full" style={{ width: totalDuration * scale }}>
                                {Array.from({ length: Math.ceil(totalDuration / 5) }).map((_, i) => (
                                    <div key={i} className="absolute top-0 bottom-0 border-l border-zinc-800 text-[9px] text-zinc-600 pl-1 pt-1 select-none pointer-events-none" style={{ left: i * scale * 5 }}>{i * 5}s</div>
                                ))}
                                <div className="absolute top-4 bottom-0 w-[1px] bg-red-500 z-30 pointer-events-none transform -translate-x-1/2" style={{ left: currentTime * scale }}>
                                    <div className="absolute -top-3 -left-1.5 w-3 h-3 bg-red-500 transform rotate-45" />
                                </div>
                                <div className="absolute inset-0 cursor-ew-resize z-20" onMouseDown={() => setInteractionMode('scrubbing')} />
                            </div>
                        </div>

                        <div ref={contentRef} className="flex-1 overflow-auto relative" onScroll={handleContentScroll} onMouseDown={handleTimelineMouseDown}>
                            <div className="relative min-w-full" style={{ width: totalDuration * scale }}>
                                <div className="absolute top-0 bottom-0 w-[1px] bg-red-500 z-30 pointer-events-none transform -translate-x-1/2" style={{ left: currentTime * scale }} />
                                {tracks.map(track => (
                                    <div key={track.id} className={`border-b border-zinc-800 relative group ${track.type === 'audio' ? 'bg-zinc-900/30' : 'bg-zinc-900/10'}`} style={{ height: track.height }} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, track.id)}>
                                        {clips.filter(c => c.track === track.id).map(clip => {
                                            const isSelected = selectedClipIds.has(clip.id);
                                            const assetId = projectNodes.find(n => n.id === clip.sourceNodeId)?.assetId;
                                            const versions = assetId ? projectNodes.filter(n => n.assetId === assetId && (n.data.imageUrl || n.data.videoUrl)).sort((a,b) => a.id.localeCompare(b.id)) : [];
                                            const versionIdx = versions.findIndex(v => v.id === clip.sourceNodeId);
                                            
                                            return (
                                                <div key={clip.id} 
                                                    className={`absolute top-1 bottom-1 rounded overflow-hidden cursor-pointer select-none transition-shadow group/clip ${isSelected ? 'ring-2 ring-purple-500 z-10 shadow-lg' : 'border border-zinc-700 opacity-90 hover:opacity-100'}`}
                                                    style={{ left: clip.start * scale, width: clip.duration * scale, backgroundColor: '#000' }}
                                                    onMouseDown={(e) => handleClipMouseDown(e, clip.id)}
                                                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, clipId: clip.id }); }}
                                                >
                                                    <div className="w-full h-full relative">
                                                        {clip.thumbnail && <img src={clip.thumbnail} className="w-full h-full object-cover opacity-80 pointer-events-none" />}
                                                        {track.type === 'audio' && <div className="absolute inset-0 bg-teal-500/20 mix-blend-overlay" />}
                                                        <div className="absolute inset-0 p-1 flex flex-col justify-between bg-gradient-to-r from-black/80 to-transparent pointer-events-none">
                                                            <div className="flex justify-between items-start">
                                                                <span className="text-[10px] font-bold text-white truncate drop-shadow-md w-full">{clip.label}</span>
                                                                {versionIdx !== -1 && (
                                                                    <span className="text-[8px] font-mono bg-black/50 text-zinc-300 px-1 rounded border border-zinc-700">v{versionIdx + 1}</span>
                                                                )}
                                                            </div>
                                                            <span className="text-[9px] text-zinc-300 font-mono drop-shadow-md">{clip.duration.toFixed(1)}s</span>
                                                        </div>
                                                        <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/50 z-20 opacity-0 group-hover/clip:opacity-100 transition-opacity" onMouseDown={(e) => handleTrimMouseDown(e, clip, 'start')} />
                                                        <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/50 z-20 opacity-0 group-hover/clip:opacity-100 transition-opacity" onMouseDown={(e) => handleTrimMouseDown(e, clip, 'end')} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                                {marqueeBox && <div className="absolute bg-blue-500/20 border border-blue-500 pointer-events-none z-50" style={{ left: marqueeBox.w > 0 ? marqueeBox.x : marqueeBox.x + marqueeBox.w, top: marqueeBox.h > 0 ? marqueeBox.y : marqueeBox.y + marqueeBox.h, width: Math.abs(marqueeBox.w), height: Math.abs(marqueeBox.h) }} />}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div 
                    className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[200px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {contextMenu.clipId && !versionFlyout ? (
                        <>
                            <div className="px-3 py-2 border-b border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase">Clip Actions</div>
                            
                            <button 
                                onClick={(e) => { 
                                    const clip = clips.find(c => c.id === contextMenu.clipId);
                                    const node = projectNodes.find(n => n.id === clip?.sourceNodeId);
                                    if(node && node.assetId) showVersions(clip!.id, node.assetId, contextMenu.x, contextMenu.y);
                                }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 text-zinc-300 flex items-center gap-2"
                            >
                                <RefreshCw size={12} /> Replace with Version...
                            </button>

                            <div className="h-[1px] bg-zinc-800 my-1 mx-2" />
                            <button onClick={() => handleGenerateVideoForClipAction(false, false)} className="w-full text-left px-3 py-2 text-xs hover:bg-purple-900/30 text-purple-300 flex items-center gap-2">
                                <Video size={12} /> Generate Video
                            </button>
                            <button onClick={() => handleGenerateVideoForClipAction(true, false)} className="w-full text-left px-3 py-2 text-xs hover:bg-purple-900/30 text-purple-300 flex items-center gap-2">
                                <Film size={12} /> Generate & Replace
                            </button>
                            <button onClick={() => handleGenerateVideoForClipAction(false, true)} className="w-full text-left px-3 py-2 text-xs hover:bg-purple-900/30 text-purple-300 flex items-center gap-2">
                                <Sparkles size={12} /> Generate Instant Video
                            </button>
                            
                            <div className="h-[1px] bg-zinc-800 my-1 mx-2" />
                            <button onClick={handleDelete} className="w-full text-left px-3 py-2 text-xs hover:bg-red-900/30 text-red-400 flex items-center gap-2"><Trash2 size={12} /> Delete</button>
                        </>
                    ) : versionFlyout ? (
                        <>
                            <div className="px-3 py-2 border-b border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-2">
                                <button onClick={() => setVersionFlyout(null)}><ChevronLeft size={12}/></button> Select Version
                            </div>
                            <div className="max-h-60 overflow-y-auto">
                                {versionFlyout.versions.map((v, i) => (
                                    <button 
                                        key={v.id} 
                                        onClick={() => handleReplaceVersion(v)}
                                        className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center gap-3 border-b border-zinc-800/50"
                                    >
                                        <div className="w-8 h-8 bg-black rounded overflow-hidden shrink-0">
                                            {v.data.videoUrl ? <video src={v.data.videoUrl} className="w-full h-full object-cover"/> : <img src={v.data.imageUrl} className="w-full h-full object-cover"/>}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs text-zinc-300 truncate">Version {i + 1}</div>
                                            <div className="text-[10px] text-zinc-500">{v.data.videoUrl ? 'Video' : 'Image'} • {new Date(parseInt(v.id.split('-').pop()!)).toLocaleTimeString()}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : contextMenu.nodeId ? (
                        <>
                            <div className="px-3 py-2 border-b border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase">Asset Status</div>
                            <button onClick={() => handleSetNodeStatus('approved')} className="w-full text-left px-3 py-2 text-xs hover:bg-green-900/30 text-green-400 flex items-center gap-2"><CheckCircle size={12}/> Approved</button>
                            <button onClick={() => handleSetNodeStatus('review')} className="w-full text-left px-3 py-2 text-xs hover:bg-yellow-900/30 text-yellow-400 flex items-center gap-2"><AlertCircle size={12}/> Review</button>
                            <button onClick={() => handleSetNodeStatus('archived')} className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 text-zinc-400 flex items-center gap-2"><Archive size={12}/> Archive</button>
                        </>
                    ) : null}
                </div>
            )}
        </div>
    );
};
