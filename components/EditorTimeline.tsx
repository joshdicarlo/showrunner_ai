
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ProjectAsset, FlowNode, TimelineClip, NodeType, DepartmentType } from '../types';
import { Play, Pause, Scissors, Trash2, SkipBack, Plus, Layers, Image as ImageIcon, Video, Volume2 } from 'lucide-react';

interface EditorTimelineProps {
    sequenceAsset: ProjectAsset;
    projectAssets: ProjectAsset[];
    projectNodes: FlowNode[];
    onUpdateAsset: (asset: ProjectAsset) => void;
}

export const EditorTimeline: React.FC<EditorTimelineProps> = ({ 
    sequenceAsset, projectAssets, projectNodes, onUpdateAsset 
}) => {
    // Timeline State
    const [clips, setClips] = useState<TimelineClip[]>(sequenceAsset.timelineData?.clips || []);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
    const [scale, setScale] = useState(20); // Pixels per second
    
    // Playback Refs
    const requestRef = useRef<number | undefined>(undefined);
    const startTimeRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);
    const videoRefs = useRef<Record<string, HTMLVideoElement>>({});

    // --- Media Bin Logic ---
    // Fetch all approved media from children (Shots) of this Sequence
    const binItems = useMemo(() => {
        const childAssets = projectAssets.filter(a => a.parentId === sequenceAsset.id);
        const items: { node: FlowNode, asset: ProjectAsset, type: 'video' | 'image' }[] = [];

        childAssets.forEach(asset => {
            const approvedNodes = projectNodes.filter(n => 
                n.assetId === asset.id && 
                n.data.status === 'approved' &&
                (n.data.imageUrl || n.data.videoUrl)
            );
            
            approvedNodes.forEach(node => {
                items.push({
                    node,
                    asset,
                    type: node.type === NodeType.AI_VIDEO_GEN ? 'video' : 'image'
                });
            });
        });
        return items;
    }, [sequenceAsset, projectAssets, projectNodes]);


    // --- Playback Loop ---
    const animate = (time: number) => {
        if (!startTimeRef.current) startTimeRef.current = time;
        const deltaTime = (time - lastTimeRef.current) / 1000;
        lastTimeRef.current = time;

        if (isPlaying) {
            setCurrentTime(prev => {
                const next = prev + deltaTime;
                // Auto-stop at end
                const maxDuration = Math.max(...clips.map(c => c.start + c.duration), 0) + 1;
                if (next > maxDuration) {
                    setIsPlaying(false);
                    return 0; // Loop or stop? Let's stop.
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
        onUpdateAsset({
            ...sequenceAsset,
            timelineData: {
                clips,
                duration: Math.max(...clips.map(c => c.start + c.duration), 0)
            }
        });
    }, [clips]);

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
            // Find best media: Video > Image
            const candidates = projectNodes.filter(n => n.assetId === asset.id && n.data.status === 'approved');
            const video = candidates.find(n => n.type === NodeType.AI_VIDEO_GEN && n.data.videoUrl);
            const image = candidates.find(n => n.type === NodeType.AI_IMAGE_GEN && n.data.imageUrl);

            const selected = video || image;
            
            if (selected) {
                const isVideo = selected.type === NodeType.AI_VIDEO_GEN;
                const url = isVideo ? selected.data.videoUrl! : selected.data.imageUrl!;
                // Parse duration if video, default 5s if image
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
                    thumbnail: selected.data.imageUrl // Even videos usually have a thumb/poster
                });
                cursor += duration;
            }
        });

        setClips(newClips);
        setCurrentTime(0);
    };

    const handleAddClip = (item: typeof binItems[0]) => {
        const isVideo = item.type === 'video';
        const url = isVideo ? item.node.data.videoUrl! : item.node.data.imageUrl!;
        const duration = isVideo && item.node.data.duration ? parseFloat(item.node.data.duration) : 5;

        // Find end of timeline
        const end = Math.max(...clips.map(c => c.start + c.duration), 0);

        const newClip: TimelineClip = {
            id: `clip-${Date.now()}`,
            sourceNodeId: item.node.id,
            mediaUrl: url,
            mediaType: isVideo ? 'video' : 'image',
            start: end,
            duration: duration,
            offset: 0,
            track: 0,
            label: item.asset.title,
            thumbnail: item.node.data.imageUrl
        };

        setClips([...clips, newClip]);
    };

    const handleSplit = () => {
        const target = clips.find(c => currentTime > c.start && currentTime < c.start + c.duration);
        if (!target) return;

        const splitPoint = currentTime - target.start; // Relative time
        
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

        setClips(clips.map(c => c.id === target.id ? left : c).concat(right));
    };

    const handleDelete = () => {
        if (!selectedClipId) return;
        setClips(clips.filter(c => c.id !== selectedClipId));
        setSelectedClipId(null);
    };

    const handleClearTimeline = () => {
        if(window.confirm("Clear entire timeline?")) {
            setClips([]);
            setCurrentTime(0);
        }
    }

    // --- Rendering Helpers ---
    
    // Get clip at current time for rendering
    const activeClip = useMemo(() => {
        // Find highest track clip at current time
        // Sort by track index descending
        const visible = clips.filter(c => currentTime >= c.start && currentTime < c.start + c.duration);
        return visible.sort((a, b) => b.track - a.track)[0];
    }, [clips, currentTime]);

    // Handle Video Sync
    useEffect(() => {
        if (activeClip && activeClip.mediaType === 'video') {
            const vid = videoRefs.current[activeClip.id];
            if (vid) {
                const targetTime = activeClip.offset + (currentTime - activeClip.start);
                // Only seek if significantly off (to allow smooth playback)
                if (Math.abs(vid.currentTime - targetTime) > 0.3) {
                    vid.currentTime = targetTime;
                }
                if (isPlaying) vid.play().catch(() => {});
                else vid.pause();
            }
        }
        // Pause others
        Object.keys(videoRefs.current).forEach(key => {
            if (key !== activeClip?.id) {
                videoRefs.current[key]?.pause();
            }
        });
    }, [activeClip, currentTime, isPlaying]);


    return (
        <div className="w-full h-full flex flex-col bg-zinc-950 text-white font-sans overflow-hidden">
            {/* Top Section: Bin & Player */}
            <div className="flex-1 flex min-h-0 border-b border-zinc-800">
                
                {/* BIN */}
                <div className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-900/50">
                    <div className="p-3 border-b border-zinc-800 flex justify-between items-center">
                        <h3 className="font-bold text-xs uppercase text-zinc-400">Media Bin</h3>
                        <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">{binItems.length} items</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-3 content-start">
                        {binItems.map((item, idx) => (
                            <div 
                                key={idx} 
                                className="group relative aspect-square bg-black rounded border border-zinc-800 cursor-pointer hover:border-blue-500 overflow-hidden"
                                onClick={() => handleAddClip(item)}
                            >
                                {item.type === 'video' ? (
                                    <video src={item.node.data.videoUrl} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                                ) : (
                                    <img src={item.node.data.imageUrl} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                                )}
                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1 truncate text-[10px] text-zinc-300">
                                    {item.asset.title}
                                </div>
                                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Plus className="bg-blue-600 text-white p-0.5 rounded-full" size={16}/>
                                </div>
                            </div>
                        ))}
                        {binItems.length === 0 && (
                            <div className="col-span-2 text-center p-4 text-zinc-600 text-xs italic">
                                No approved media in sequence shots.
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
                        <div className="absolute bottom-4 right-4 font-mono text-xl font-bold text-white drop-shadow-md tabular-nums">
                            {new Date(currentTime * 1000).toISOString().substr(14, 8)}
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
                        <div className="w-[1px] h-6 bg-zinc-700 mx-2" />
                        <button onClick={handleSplit} className="text-zinc-400 hover:text-white" title="Cut/Split (C)"><Scissors size={18}/></button>
                        <button onClick={handleDelete} className="text-zinc-400 hover:text-red-400" title="Delete"><Trash2 size={18}/></button>
                    </div>
                </div>
            </div>

            {/* Bottom Section: Timeline */}
            <div className="h-72 shrink-0 border-t border-zinc-800 bg-zinc-900/80 flex flex-col relative select-none">
                
                {/* Toolbar / Time Ruler */}
                <div className="h-8 border-b border-zinc-800 flex relative bg-zinc-900">
                    <div className="w-24 border-r border-zinc-800 shrink-0 bg-zinc-800/50 flex items-center px-2 text-[10px] font-bold text-zinc-500">
                        TRACKS
                    </div>
                    {/* Simple Ruler */}
                    <div 
                        className="flex-1 relative overflow-hidden cursor-pointer"
                        onMouseDown={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            setCurrentTime(x / scale);
                        }}
                    >
                         {Array.from({ length: Math.ceil(100) }).map((_, i) => (
                             <div key={i} className="absolute top-0 bottom-0 border-l border-zinc-800 text-[9px] text-zinc-600 pl-1 pt-1" style={{ left: i * scale * 5 }}>
                                 {i * 5}s
                             </div>
                         ))}
                         {/* Playhead Marker */}
                         <div 
                            className="absolute top-0 bottom-0 w-[1px] bg-red-500 z-10 pointer-events-none"
                            style={{ left: currentTime * scale }}
                         >
                             <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-500 transform rotate-45" />
                         </div>
                    </div>
                </div>

                {/* Tracks Container */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
                    {[0, 1].map(trackIdx => (
                        <div key={trackIdx} className="h-24 border-b border-zinc-800 relative flex group">
                            <div className="w-24 shrink-0 border-r border-zinc-800 bg-zinc-900 flex flex-col items-center justify-center text-xs text-zinc-500 group-hover:bg-zinc-800 transition-colors">
                                <div className="font-bold">V{trackIdx + 1}</div>
                                {trackIdx === 0 && <span className="text-[9px] opacity-50">Main</span>}
                            </div>
                            
                            {/* Track Lane */}
                            <div className="flex-1 relative bg-zinc-900/30">
                                {clips.filter(c => c.track === trackIdx).map(clip => (
                                    <div
                                        key={clip.id}
                                        className={`absolute top-1 bottom-1 rounded overflow-hidden cursor-pointer border ring-offset-1 ring-offset-zinc-900 transition-all ${selectedClipId === clip.id ? 'border-yellow-400 ring-2 ring-yellow-500 z-10' : 'border-zinc-700 hover:border-zinc-500 opacity-90'}`}
                                        style={{
                                            left: clip.start * scale,
                                            width: clip.duration * scale,
                                            backgroundColor: clip.mediaType === 'video' ? '#1e3a8a' : '#581c87' // Blue vs Purple
                                        }}
                                        onClick={(e) => { e.stopPropagation(); setSelectedClipId(clip.id); setCurrentTime(clip.start); }}
                                    >
                                        {/* Clip Content */}
                                        <div className="w-full h-full flex items-center relative overflow-hidden">
                                            {/* Thumbnail Strip (Simplified) */}
                                            {clip.thumbnail && (
                                                <img src={clip.thumbnail} className="h-full w-auto object-cover opacity-50 grayscale mix-blend-overlay" />
                                            )}
                                            <div className="absolute inset-0 p-1.5 flex flex-col justify-between">
                                                <span className="text-[10px] font-bold text-white truncate drop-shadow-md">{clip.label}</span>
                                                <span className="text-[9px] text-white/70 font-mono drop-shadow-md">{clip.duration.toFixed(1)}s</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    
                    {/* Playhead Line extending down */}
                    <div 
                        className="absolute top-0 bottom-0 w-[1px] bg-red-500 pointer-events-none z-20"
                        style={{ left: currentTime * scale + 96 }} // +96 for sidebar width
                    />
                </div>
            </div>
        </div>
    );
};
