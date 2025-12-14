
import React, { useState, useEffect, useMemo } from 'react';
import { ProjectAsset, DepartmentType, ProjectSettings } from '../types';
import { Input, TextArea, Button, Select } from './UI';
import { RefreshCw, Info, Sparkles, Tag, Image as ImageIcon, FileText, User, Layers, ScanFace, Settings, Eye, EyeOff, ChevronDown, Frame, XCircle } from 'lucide-react';
import { generateSummary } from '../services/geminiService';

interface AssetEditorPanelProps {
    asset: ProjectAsset;
    projectAssets?: ProjectAsset[];
    onUpdate: (updatedAsset: ProjectAsset) => void;
    onGenerateConcepts: (count: number) => void;
    onGenerateOutline: () => void;
    approvedImages: string[];
    onNavigateToAsset?: (assetId: string) => void;
    onGenerateRefSheet?: (assetId: string, sourceImageUrl?: string) => void;
    assetThumbnails?: Record<string, string>;
    refinedImages?: string[];
    projectSettings?: ProjectSettings; 
    onRemoveRef?: (imageUrl: string) => void; // New prop
}

export const AssetEditorPanel: React.FC<AssetEditorPanelProps> = ({ 
    asset, 
    projectAssets, 
    onUpdate, 
    onGenerateConcepts, 
    onGenerateOutline, 
    approvedImages, 
    onNavigateToAsset,
    onGenerateRefSheet,
    assetThumbnails = {},
    refinedImages = [],
    projectSettings,
    onRemoveRef
}) => {
    const [title, setTitle] = useState(asset.title);
    const [description, setDescription] = useState(asset.description);
    const [styleId, setStyleId] = useState(asset.styleId || "");
    const [isGenerating, setIsGenerating] = useState(false);
    const [conceptCount, setConceptCount] = useState(4);
    
    // Hidden Prompt State
    const [overrideHidden, setOverrideHidden] = useState(asset.overrideHiddenPrompt || false);
    const [hiddenPrompt, setHiddenPrompt] = useState(asset.hiddenPrompt || "");
    const [showHiddenSection, setShowHiddenSection] = useState(false);

    // Button Context Menu
    const [btnContextMenu, setBtnContextMenu] = useState<{x: number, y: number, visible: boolean} | null>(null);
    
    // Image Context Menu (For removing refs)
    const [imgContextMenu, setImgContextMenu] = useState<{x: number, y: number, url: string} | null>(null);

    // Sync local state when asset changes
    useEffect(() => {
        setTitle(asset.title);
        setDescription(asset.description);
        setStyleId(asset.styleId || "");
        setOverrideHidden(asset.overrideHiddenPrompt || false);
        setHiddenPrompt(asset.hiddenPrompt || "");
    }, [asset.id]);

    useEffect(() => {
        const handleClickOutside = () => {
            setBtnContextMenu(null);
            setImgContextMenu(null);
        }
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    // Detect referenced characters in the description
    const referencedCharacters = useMemo(() => {
        if (!projectAssets || !description) return [];
        // Match @Name using regex
        const matches = description.match(/@([a-zA-Z0-9_]+)/g);
        if (!matches) return [];
        
        const uniqueNames: string[] = Array.from(new Set(matches.map(m => m.substring(1))));
        
        return uniqueNames.map(name => 
            projectAssets.find(a => 
                a.department === DepartmentType.CASTING_WARDROBE && 
                a.title.toLowerCase() === name.toLowerCase()
            )
        ).filter((a): a is ProjectAsset => !!a);

    }, [description, projectAssets]);

    const handleChangeTitle = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTitle = e.target.value;
        setTitle(newTitle);
        onUpdate({ ...asset, title: newTitle });
    };

    const handleChangeDesc = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newDesc = e.target.value;
        setDescription(newDesc);
        onUpdate({ ...asset, description: newDesc });
    };

    const handleStyleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newStyleId = e.target.value;
        setStyleId(newStyleId);
        onUpdate({ ...asset, styleId: newStyleId });
    };

    const toggleOverrideHidden = () => {
        const newValue = !overrideHidden;
        setOverrideHidden(newValue);
        onUpdate({ ...asset, overrideHiddenPrompt: newValue });
    };

    const handleHiddenPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setHiddenPrompt(val);
        onUpdate({ ...asset, hiddenPrompt: val });
    };

    const handleRegenerateSummary = async () => {
        setIsGenerating(true);
        try {
            const summary = await generateSummary(description);
            onUpdate({ ...asset, summary });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleBtnContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setBtnContextMenu({ x: e.clientX, y: e.clientY, visible: true });
    };

    const handleImageContextMenu = (e: React.MouseEvent, url: string) => {
        e.preventDefault();
        e.stopPropagation();
        setImgContextMenu({ x: e.clientX, y: e.clientY, url });
    };
    
    // Effective Thumbnail
    const effectiveThumbnail = assetThumbnails[asset.id] || asset.thumbnailUrl;

    return (
        <div className="w-80 h-full bg-surface border-l border-border flex flex-col z-10 shadow-xl">
            <div className="p-4 border-b border-border bg-zinc-900/50">
                <h2 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                    <Info size={14} className="text-blue-500"/>
                    Inspector
                </h2>
            </div>
            
            <div className="p-4 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                {/* Preview Header */}
                <div className="flex flex-col items-center">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-zinc-700 shadow-xl mb-3 bg-black">
                        {effectiveThumbnail ? (
                            <img src={effectiveThumbnail} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                <User size={32}/>
                            </div>
                        )}
                    </div>
                </div>

                {/* Title Section */}
                <div className="space-y-2">
                    <label className="text-xs uppercase font-bold text-zinc-500">Name</label>
                    <Input value={title} onChange={handleChangeTitle} className="font-bold text-white bg-zinc-950" />
                </div>

                {/* Visual Style Section (One Line) */}
                <div className="flex items-center justify-between">
                    <label className="text-xs uppercase font-bold text-zinc-500">Visual Style</label>
                    <div className="relative group">
                        <select 
                            value={styleId} 
                            onChange={handleStyleChange} 
                            className="appearance-none bg-zinc-950 border border-zinc-700 rounded px-2 py-1 pr-6 text-[10px] font-mono text-zinc-300 focus:outline-none focus:border-blue-500 cursor-pointer hover:bg-zinc-900 w-32 text-right"
                        >
                            <option value="">PROJECT DEFAULT</option>
                            {projectSettings?.styles.map(s => (
                                <option key={s.id} value={s.id}>@{s.value.toUpperCase()}</option>
                            ))}
                        </select>
                        <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"/>
                    </div>
                </div>

                {/* Description Section */}
                <div className="space-y-2">
                    <label className="text-xs uppercase font-bold text-zinc-500">Full Description</label>
                    <TextArea 
                        value={description} 
                        onChange={handleChangeDesc} 
                        className="h-48 text-sm leading-relaxed bg-zinc-950 border-zinc-800" 
                    />
                    <p className="text-[10px] text-zinc-600">
                        Use <strong>@{asset.title}</strong> to inject this description elsewhere.
                    </p>
                </div>
                
                {/* Cast Section (Dynamic) */}
                {referencedCharacters.length > 0 && (
                     <div className="space-y-2 pt-4 border-t border-zinc-800">
                        <label className="text-xs uppercase font-bold text-zinc-500">Cast</label>
                        <div className="grid grid-cols-3 gap-2">
                            {referencedCharacters.map(char => (
                                <button
                                    key={char.id}
                                    onClick={() => onNavigateToAsset && onNavigateToAsset(char.id)}
                                    className="flex flex-col items-center group"
                                    title={`Go to ${char.title}`}
                                >
                                    <div className="w-16 h-16 rounded-full overflow-hidden border border-zinc-800 group-hover:border-blue-500 transition-colors bg-zinc-900 mb-1">
                                        {assetThumbnails && assetThumbnails[char.id] ? (
                                            <img src={assetThumbnails[char.id]} alt={char.title} className="w-full h-full object-cover"/>
                                        ) : char.thumbnailUrl ? (
                                            <img src={char.thumbnailUrl} alt={char.title} className="w-full h-full object-cover"/>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                                <User size={20} />
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-zinc-400 group-hover:text-blue-400 truncate w-full text-center">
                                        @{char.title}
                                    </span>
                                </button>
                            ))}
                        </div>
                     </div>
                )}

                {/* Summary Section */}
                <div className="space-y-2 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                    <div className="flex items-center justify-between">
                        <label className="text-xs uppercase font-bold text-zinc-500">Header Summary</label>
                        <button 
                            onClick={handleRegenerateSummary}
                            disabled={isGenerating}
                            className="text-blue-400 hover:text-blue-300 transition-colors p-1 hover:bg-blue-900/20 rounded"
                            title="Regenerate Summary from Description"
                        >
                            <RefreshCw size={12} className={isGenerating ? "animate-spin" : ""} />
                        </button>
                    </div>
                    <p className="text-xs text-zinc-300 italic leading-relaxed min-h-[40px]">
                        {asset.summary || (isGenerating ? "Generating..." : "No summary available.")}
                    </p>
                </div>

                {/* Approved Concepts Section (Moved Up) */}
                <div className="space-y-2 pt-4 border-t border-zinc-800">
                     <label className="text-xs uppercase font-bold text-zinc-500 flex items-center gap-2">
                        <ImageIcon size={12} />
                        Approved Concepts
                     </label>
                     
                     {approvedImages && approvedImages.length > 0 ? (
                         <div className="grid grid-cols-2 gap-2">
                             {approvedImages.map((img, idx) => (
                                 <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 group">
                                     <img src={img} alt={`Approved ${idx}`} className="w-full h-full object-cover" />
                                     <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                 </div>
                             ))}
                         </div>
                     ) : (
                         <div className="h-24 border-2 border-dashed border-zinc-800 rounded-lg flex flex-col items-center justify-center text-zinc-600 gap-2 bg-zinc-900/20">
                            <div className="p-2 rounded-full bg-zinc-800/50">
                                <Frame size={14} />
                            </div>
                            <span className="text-[10px]">No approved concepts</span>
                         </div>
                     )}
                </div>

                {/* Character Sheets / Turnarounds (Moved Down & Renamed) */}
                {refinedImages && refinedImages.length > 0 && (
                    <div className="space-y-2 pt-4 border-t border-zinc-800">
                        <label className="text-xs uppercase font-bold text-zinc-500 flex items-center gap-2">
                            <ScanFace size={12} className="text-green-500" />
                            Approved Ref
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {refinedImages.map((img, idx) => (
                                <div 
                                    key={idx} 
                                    className="relative aspect-video rounded-lg overflow-hidden border border-green-900/50 bg-zinc-950 group cursor-context-menu"
                                    onContextMenu={(e) => handleImageContextMenu(e, img)}
                                >
                                    <img src={img} alt={`Refined ${idx}`} className="w-full h-full object-cover" />
                                    <div className="absolute top-1 left-1 bg-black/60 text-white text-[8px] px-1 rounded backdrop-blur-sm">REF</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Advanced: Hidden Prompt (Moved to bottom) */}
                <div className="border-t border-zinc-800 pt-4 pb-4">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs uppercase font-bold text-zinc-500 flex items-center gap-2">
                            <EyeOff size={12}/> Advanced Generation
                        </label>
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] text-zinc-600">Override Default</span>
                            <input 
                                type="checkbox" 
                                checked={overrideHidden} 
                                onChange={toggleOverrideHidden} 
                                className="cursor-pointer bg-zinc-900 border-zinc-700 rounded w-3 h-3"
                            />
                        </div>
                    </div>
                    
                    {overrideHidden ? (
                        <TextArea 
                            value={hiddenPrompt} 
                            onChange={handleHiddenPromptChange} 
                            className="h-24 text-xs bg-zinc-950 border-zinc-700 text-zinc-300 font-mono" 
                            placeholder="Enter hidden prompt tokens to inject during generation..."
                        />
                    ) : (
                        <div className="p-3 bg-zinc-900/30 rounded border border-zinc-800/50 text-[10px] text-zinc-600 italic text-center">
                            Using project defaults for {asset.department}
                        </div>
                    )}
                </div>
            </div>

            {/* Concept Generator */}
            <div className="p-4 border-t border-border bg-zinc-900/30">
                <label className="text-xs uppercase font-bold text-zinc-500 mb-2 block">Generation Tools</label>
                <div className="flex gap-2">
                    <Select 
                        value={conceptCount} 
                        onChange={(e) => setConceptCount(Number(e.target.value))}
                        className="w-20"
                    >
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                    </Select>
                    <Button 
                        onClick={() => onGenerateConcepts(conceptCount)} 
                        onContextMenu={handleBtnContextMenu}
                        className="flex-1"
                        size="sm"
                        icon={Sparkles}
                    >
                        Generate
                    </Button>
                </div>
            </div>

            {/* Context Menu for Generate Button */}
            {btnContextMenu && (
                <div 
                    className="fixed bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[180px] overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                    style={{ left: btnContextMenu.x, top: btnContextMenu.y - 120 }} // Position above cursor
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-3 py-2 border-b border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase">
                        Generation Options
                    </div>
                    
                    <button 
                        onClick={() => { onGenerateConcepts(conceptCount); setBtnContextMenu(null); }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-purple-900/30 text-purple-200 flex items-center gap-2"
                    >
                        <ImageIcon size={12} /> Generate Concepts
                    </button>

                    {asset.department === DepartmentType.WRITERS_ROOM && (
                        <button 
                            onClick={() => { onGenerateOutline(); setBtnContextMenu(null); }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-blue-900/30 text-blue-200 flex items-center gap-2"
                        >
                            <FileText size={12} /> Generate Script Outline
                        </button>
                    )}

                    {asset.department === DepartmentType.CASTING_WARDROBE && onGenerateRefSheet && (
                        <button 
                            onClick={() => { 
                                // Default to first approved image if no specific one provided
                                const defaultRef = approvedImages.length > 0 ? approvedImages[0] : undefined;
                                onGenerateRefSheet(asset.id, defaultRef); 
                                setBtnContextMenu(null); 
                            }}
                            disabled={approvedImages.length === 0}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-green-900/30 text-green-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <ScanFace size={12} /> Refine Character (Dataset)
                        </button>
                    )}
                </div>
            )}

            {/* Image Context Menu (Ref Removal) */}
            {imgContextMenu && (
                <div 
                    className="fixed bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[140px] overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                    style={{ left: imgContextMenu.x, top: imgContextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-3 py-2 border-b border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase">
                        Ref Actions
                    </div>
                    <button 
                        onClick={() => { if(onRemoveRef) onRemoveRef(imgContextMenu.url); setImgContextMenu(null); }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-red-900/30 text-red-200 flex items-center gap-2"
                    >
                        <XCircle size={12} /> Remove Ref
                    </button>
                </div>
            )}
        </div>
    );
}
