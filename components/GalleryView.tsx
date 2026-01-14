
import React, { useState, useMemo, useEffect } from 'react';
import { FlowNode, DepartmentType, NodeType } from '../types';
import { Play, FileText, Image as ImageIcon, Maximize2, X, Copy, Layers, CheckCircle, AlertCircle, Archive, Sliders, ChevronLeft, ChevronRight, Wand2, UserCheck, ScanFace, Rotate3d, Smile } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Input, Button, Select } from './UI';
import { MODELS, IMAGE_MODELS_OPTIONS, VIDEO_MODELS_OPTIONS, ASPECT_RATIOS } from '../constants';

interface GalleryViewProps {
  nodes: FlowNode[];
  currentDept: DepartmentType;
  currentAssetId: string | null;
  showArchived?: boolean;
  onGenerateBatch?: (prompt: string, count: number, model: string, aspectRatio: string) => void;
  onSetThumbnail?: (assetId: string, imageUrl: string) => void;
  onRefineConcept?: (assetId: string, sourceImageUrl: string) => void;
  onGenerateTurntable?: (node: FlowNode) => void;
  onGenerateExpressions?: (node: FlowNode) => void;
  onUpdateNode?: (nodeId: string, data: any) => void;
}

interface GalleryGroup {
    id: string;
    isBatch: boolean;
    mainNode: FlowNode; // The node to pull metadata from
    nodes: FlowNode[]; // All nodes in this group
    timestamp: number;
}

export const GalleryView: React.FC<GalleryViewProps> = ({ 
    nodes, currentDept, currentAssetId, showArchived = false, onGenerateBatch,
    onSetThumbnail, onRefineConcept, onGenerateTurntable, onGenerateExpressions, onUpdateNode
}) => {
  const [previewNode, setPreviewNode] = useState<FlowNode | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | 'IMAGE' | 'VIDEO' | 'TEXT'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'APPROVED' | 'REVIEW' | 'ARCHIVED'>('ALL');
  
  // Prompt Box State
  const [prompt, setPrompt] = useState('');
  const [genOptionsOpen, setGenOptionsOpen] = useState(false);
  const [genModel, setGenModel] = useState(IMAGE_MODELS_OPTIONS[0].value);
  const [genRatio, setGenRatio] = useState('16:9');
  const [genCount, setGenCount] = useState(4);
  
  // Context Menu
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node: FlowNode } | null>(null);

  // 1. Filter nodes by Context (Dept/Asset)
  const contextNodes = useMemo(() => nodes.filter(n => {
      const matchDept = n.department === currentDept;
      const matchAsset = n.assetId === (currentAssetId || undefined);
      // We don't filter archived here yet, we let the UI filter handle it
      return matchDept && matchAsset;
  }), [nodes, currentDept, currentAssetId]);

  // 2. Group nodes by Parent ID
  const galleryGroups = useMemo(() => {
      const groups: Record<string, FlowNode[]> = {};
      const standalone: FlowNode[] = [];
      
      // Separate into parent-based buckets
      contextNodes.forEach(n => {
          if (n.type === NodeType.GROUP) {
              // It's a container, initialize bucket if not exists
              if (!groups[n.id]) groups[n.id] = [];
          } else if (n.parentId) {
              if (!groups[n.parentId]) groups[n.parentId] = [];
              groups[n.parentId].push(n);
          } else {
              standalone.push(n);
          }
      });

      const result: GalleryGroup[] = [];

      // Process Groups
      Object.keys(groups).forEach(parentId => {
          const children = groups[parentId];
          if (children.length > 0) {
              // Find the Group Node itself for label/timestamp if needed
              const groupNode = contextNodes.find(n => n.id === parentId);
              // Use the first child as the "Representative" for metadata if group node doesn't have specific data
              const main = children[0];
              // Use group creation time or first child time
              const ts = parseInt(groupNode?.id.split('-').pop() || main.id.split('-').pop() || '0');

              result.push({
                  id: parentId,
                  isBatch: true,
                  mainNode: main,
                  nodes: children,
                  timestamp: ts
              });
          }
      });

      // Process Standalone
      standalone.forEach(n => {
           const ts = parseInt(n.id.split('-').pop() || '0');
           result.push({
               id: n.id,
               isBatch: false,
               mainNode: n,
               nodes: [n],
               timestamp: ts
           });
      });

      // Sort by newest
      return result.sort((a, b) => b.timestamp - a.timestamp);

  }, [contextNodes]);

  // 3. Apply Filters to Groups
  const filteredGroups = useMemo(() => {
      return galleryGroups.filter(group => {
          // Type Filter (Check if main node matches)
          let typeMatch = true;
          const t = group.mainNode.type;
          if (filterType === 'IMAGE') typeMatch = t === NodeType.AI_IMAGE_GEN || t === NodeType.AI_IMAGE_EDIT || t === NodeType.IMAGE_UPLOAD;
          else if (filterType === 'VIDEO') typeMatch = t === NodeType.AI_VIDEO_GEN;
          else if (filterType === 'TEXT') typeMatch = t === NodeType.TEXT_INPUT || t === NodeType.AI_TEXT_GEN;

          if (!typeMatch) return false;

          // Status Filter
          if (filterStatus === 'ALL') return true;

          const hasMatchingStatus = group.nodes.some(n => {
              const s = n.data.status || 'draft';
              if (filterStatus === 'APPROVED') return s === 'approved';
              if (filterStatus === 'REVIEW') return s === 'review' || s === 'draft' || s === 'generating';
              if (filterStatus === 'ARCHIVED') return s === 'archived';
              return false;
          });

          return hasMatchingStatus;
      });
  }, [galleryGroups, filterType, filterStatus]);
  
  // Flatten all visible nodes for lightbox navigation
  const visibleFlatNodes = useMemo(() => {
      return filteredGroups.flatMap(g => g.nodes);
  }, [filteredGroups]);


  // Navigation Handlers
  const handleNextPreview = () => {
      if (!previewNode) return;
      const currentIndex = visibleFlatNodes.findIndex(n => n.id === previewNode.id);
      if (currentIndex !== -1 && currentIndex < visibleFlatNodes.length - 1) {
          setPreviewNode(visibleFlatNodes[currentIndex + 1]);
      }
  };

  const handlePrevPreview = () => {
      if (!previewNode) return;
      const currentIndex = visibleFlatNodes.findIndex(n => n.id === previewNode.id);
      if (currentIndex > 0) {
          setPreviewNode(visibleFlatNodes[currentIndex - 1]);
      }
  };

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (!previewNode) return;
          if (e.key === 'ArrowRight') handleNextPreview();
          if (e.key === 'ArrowLeft') handlePrevPreview();
          if (e.key === 'Escape') setPreviewNode(null);
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewNode, visibleFlatNodes]);

  useEffect(() => {
      const handleGlobalClick = () => setContextMenu(null);
      window.addEventListener('click', handleGlobalClick);
      return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const copyPrompt = (text: string) => {
      navigator.clipboard.writeText(text);
  };

  const renderStatusBadge = (status?: string) => {
      if (status === 'approved') return <span className="flex items-center gap-1 text-[9px] font-bold text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded border border-green-800"><CheckCircle size={8}/> Approved</span>;
      if (status === 'review') return <span className="flex items-center gap-1 text-[9px] font-bold text-yellow-400 bg-yellow-900/30 px-1.5 py-0.5 rounded border border-yellow-800"><AlertCircle size={8}/> Review</span>;
      if (status === 'archived') return <span className="flex items-center gap-1 text-[9px] font-bold text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700"><Archive size={8}/> Archived</span>;
      return <span className="text-[9px] font-bold text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700">Draft</span>;
  };

  const handleGenerate = () => {
      if (!onGenerateBatch || !prompt.trim()) return;
      onGenerateBatch(prompt, genCount, genModel, genRatio);
      setPrompt('');
  };
  
  const handleRightClick = (e: React.MouseEvent, node: FlowNode) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, node });
  }

  const renderRow = (group: GalleryGroup) => {
      const { mainNode, nodes, isBatch } = group;
      const prompt = mainNode.data.prompt || mainNode.data.text || "Untitled Generation";
      
      // Determine ref image
      const refImage = mainNode.data.referenceImageUrl || (mainNode.type === NodeType.AI_VIDEO_GEN ? mainNode.data.imageUrl : undefined);

      return (
          <div key={group.id} className="flex flex-col xl:flex-row gap-6 p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl mb-6 hover:border-zinc-700 transition-colors">
               
               {/* LEFT: Visuals (Even bigger flex ratio to prioritize image space) */}
               <div className="flex-[4] min-w-0 flex flex-col gap-4">
                   {isBatch ? (
                       // Grid: Max 4 per row, allowing items to stretch
                       <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                           {nodes.map((n, idx) => (
                               <div key={n.id} className="flex flex-col gap-2">
                                   <div 
                                        onClick={() => setPreviewNode(n)}
                                        onContextMenu={(e) => handleRightClick(e, n)}
                                        className="relative w-full aspect-square bg-zinc-950 rounded-lg overflow-hidden cursor-pointer border border-zinc-800 hover:border-zinc-500 transition-colors group/item"
                                   >
                                       {n.data.imageUrl ? (
                                           <img src={n.data.imageUrl} className="w-full h-full object-cover" />
                                       ) : n.data.videoUrl ? (
                                           <video src={n.data.videoUrl} className="w-full h-full object-cover" />
                                       ) : (
                                           <div className="w-full h-full flex items-center justify-center text-zinc-700"><ImageIcon size={20}/></div>
                                       )}
                                       {/* Hover Zoom Icon */}
                                       <div className="absolute inset-0 bg-black/0 group-hover/item:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover/item:opacity-100">
                                            <Maximize2 className="text-white drop-shadow-md" size={24}/>
                                       </div>
                                   </div>
                                   {/* Status Below Image */}
                                   <div className="flex justify-between items-center px-1">
                                       <span className="text-[10px] text-zinc-500 font-mono">#{idx + 1}</span>
                                       {onUpdateNode ? (
                                           <div className="flex items-center gap-1">
                                               <button
                                                   onClick={(e) => { e.stopPropagation(); onUpdateNode(n.id, { ...n.data, status: 'approved' }); }}
                                                   className={`p-1 rounded transition-colors ${n.data.status === 'approved' ? 'bg-green-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-green-400 hover:bg-zinc-700'}`}
                                                   title="Approve"
                                               >
                                                   <CheckCircle size={12} />
                                               </button>
                                               <button
                                                   onClick={(e) => { e.stopPropagation(); onUpdateNode(n.id, { ...n.data, status: 'review' }); }}
                                                   className={`p-1 rounded transition-colors ${n.data.status === 'review' ? 'bg-yellow-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-yellow-400 hover:bg-zinc-700'}`}
                                                   title="Mark for Review"
                                               >
                                                   <AlertCircle size={12} />
                                               </button>
                                               <button
                                                   onClick={(e) => { e.stopPropagation(); onUpdateNode(n.id, { ...n.data, status: 'archived' }); }}
                                                   className={`p-1 rounded transition-colors ${n.data.status === 'archived' ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700'}`}
                                                   title="Archive"
                                               >
                                                   <Archive size={12} />
                                               </button>
                                           </div>
                                       ) : renderStatusBadge(n.data.status)}
                                   </div>
                               </div>
                           ))}
                       </div>
                   ) : (
                       <div className="flex flex-col gap-2 max-w-2xl">
                           <div 
                                onClick={() => setPreviewNode(mainNode)}
                                onContextMenu={(e) => handleRightClick(e, mainNode)}
                                className="relative aspect-video bg-zinc-950 rounded-lg overflow-hidden cursor-pointer border border-zinc-800 hover:border-zinc-500 transition-colors w-full object-contain bg-black/50"
                           >
                               {mainNode.data.imageUrl ? (
                                   <img src={mainNode.data.imageUrl} className="w-full h-full object-contain" />
                               ) : mainNode.data.videoUrl ? (
                                   <video src={mainNode.data.videoUrl} className="w-full h-full object-contain" />
                               ) : (
                                   <div className="w-full h-full p-4 text-xs font-mono text-zinc-500 overflow-hidden">
                                       {mainNode.data.text || "No Preview"}
                                   </div>
                               )}
                           </div>
                           <div className="flex justify-between items-center px-1">
                               <span className="text-[10px] text-zinc-500 font-mono">Single</span>
                               {onUpdateNode ? (
                                   <div className="flex items-center gap-1">
                                       <button
                                           onClick={(e) => { e.stopPropagation(); onUpdateNode(mainNode.id, { ...mainNode.data, status: 'approved' }); }}
                                           className={`p-1 rounded transition-colors ${mainNode.data.status === 'approved' ? 'bg-green-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-green-400 hover:bg-zinc-700'}`}
                                           title="Approve"
                                       >
                                           <CheckCircle size={12} />
                                       </button>
                                       <button
                                           onClick={(e) => { e.stopPropagation(); onUpdateNode(mainNode.id, { ...mainNode.data, status: 'review' }); }}
                                           className={`p-1 rounded transition-colors ${mainNode.data.status === 'review' ? 'bg-yellow-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-yellow-400 hover:bg-zinc-700'}`}
                                           title="Mark for Review"
                                       >
                                           <AlertCircle size={12} />
                                       </button>
                                       <button
                                           onClick={(e) => { e.stopPropagation(); onUpdateNode(mainNode.id, { ...mainNode.data, status: 'archived' }); }}
                                           className={`p-1 rounded transition-colors ${mainNode.data.status === 'archived' ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700'}`}
                                           title="Archive"
                                       >
                                           <Archive size={12} />
                                       </button>
                                   </div>
                               ) : renderStatusBadge(mainNode.data.status)}
                           </div>
                       </div>
                   )}
                   
                   {isBatch && (
                       <div className="flex items-center gap-2 text-xs text-zinc-500 px-1 mt-2">
                           <Layers size={12} />
                           <span>Batch of {nodes.length} variations</span>
                       </div>
                   )}
               </div>

               {/* RIGHT: Info (Fixed Width Sidebar) */}
               <div className="w-full xl:w-80 shrink-0 flex flex-col gap-4">
                   <div>
                       <div className="flex items-start justify-between gap-4">
                            <p className="text-sm text-zinc-200 font-medium leading-relaxed font-mono line-clamp-6 bg-black/20 p-3 rounded border border-white/5">
                                {prompt}
                            </p>
                            <button 
                                onClick={() => copyPrompt(prompt)}
                                className="p-2 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white transition-colors shrink-0"
                                title="Copy Prompt"
                            >
                                <Copy size={14} />
                            </button>
                       </div>
                   </div>

                   <div className="flex flex-col gap-4 mt-auto pt-4 border-t border-zinc-800/50">
                       
                       {/* Metadata */}
                       <div className="flex flex-col gap-2">
                           <label className="text-[10px] uppercase font-bold text-zinc-500">Settings</label>
                           <div className="flex flex-wrap gap-2">
                               <span className="text-xs bg-zinc-800 px-2 py-1 rounded text-zinc-300 border border-zinc-700">{mainNode.data.model || 'Default Model'}</span>
                               <span className="text-xs bg-zinc-800 px-2 py-1 rounded text-zinc-300 border border-zinc-700">{mainNode.data.aspectRatio || '16:9'}</span>
                           </div>
                       </div>

                       {/* Reference Image */}
                       {refImage && (
                           <div className="flex flex-col gap-2">
                               <label className="text-[10px] uppercase font-bold text-zinc-500">Reference</label>
                               <div className="w-20 h-20 rounded border border-zinc-700 overflow-hidden bg-black">
                                   <img src={refImage} className="w-full h-full object-cover" />
                               </div>
                           </div>
                       )}
                   </div>
               </div>
          </div>
      );
  };

  return (
    <div 
        className="w-full h-full bg-black overflow-y-auto custom-scrollbar flex flex-col"
        onClick={() => setContextMenu(null)}
    >
        
        {/* Sticky Header: Prompt Input & Filters */}
        <div className="sticky top-0 z-20 bg-black/95 backdrop-blur border-b border-zinc-800">
             
             {/* Prompt Bar (Clean) */}
             <div className="p-4 border-b border-zinc-800 flex gap-2 items-center max-w-[2000px] mx-auto w-full">
                 <div className="relative flex-1">
                     <input 
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg py-3 px-4 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-sm"
                        placeholder="Dream something awesome..."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                     />
                     <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
                         <button 
                            onClick={(e) => { e.stopPropagation(); setGenOptionsOpen(!genOptionsOpen); }}
                            className={`p-1.5 rounded-md transition-colors ${genOptionsOpen ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'}`}
                        >
                             <Sliders size={16} />
                         </button>
                     </div>
                 </div>
                 
                 {genOptionsOpen && (
                     <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-700 rounded-lg p-4 shadow-xl flex gap-4 animate-in fade-in zoom-in-95 z-50">
                         <div className="space-y-1">
                             <label className="text-[10px] uppercase font-bold text-zinc-500">Model</label>
                             <Select value={genModel} onChange={e => setGenModel(e.target.value)} className="w-48 text-xs">
                                 {[...IMAGE_MODELS_OPTIONS, ...VIDEO_MODELS_OPTIONS].map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                             </Select>
                         </div>
                         <div className="space-y-1">
                             <label className="text-[10px] uppercase font-bold text-zinc-500">Ratio</label>
                             <Select value={genRatio} onChange={e => setGenRatio(e.target.value)} className="w-24 text-xs">
                                 {ASPECT_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
                             </Select>
                         </div>
                         <div className="space-y-1">
                             <label className="text-[10px] uppercase font-bold text-zinc-500">Count</label>
                             <Select value={genCount} onChange={e => setGenCount(parseInt(e.target.value))} className="w-20 text-xs">
                                 {[1, 2, 3, 4, 8].map(n => <option key={n} value={n}>{n}</option>)}
                             </Select>
                         </div>
                     </div>
                 )}
             </div>

             {/* Filters Bar */}
             <div className="w-full px-6 py-2 flex flex-col sm:flex-row items-center justify-between gap-4 max-w-[2000px] mx-auto">
                {/* Type Filter */}
                <div className="flex gap-1">
                    {['ALL', 'IMAGE', 'VIDEO', 'TEXT'].map(t => (
                        <button
                            key={t}
                            onClick={() => setFilterType(t as any)}
                            className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-colors ${filterType === t ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-zinc-600">Status:</span>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 flex gap-0.5">
                        {[
                            { id: 'ALL', label: 'All' },
                            { id: 'APPROVED', label: 'Approved' },
                            { id: 'REVIEW', label: 'Review' },
                            { id: 'ARCHIVED', label: 'Archived' }
                        ].map(s => (
                            <button
                                key={s.id}
                                onClick={() => setFilterStatus(s.id as any)}
                                className={`px-2 py-1 rounded text-[10px] font-bold transition-colors flex items-center gap-1 ${filterStatus === s.id ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>
             </div>
        </div>

        {/* List Content */}
        <div className="flex-1 p-6">
            <div className="w-full mx-auto max-w-[2000px]">
                {filteredGroups.map(renderRow)}
                
                {filteredGroups.length === 0 && (
                    <div className="py-20 text-center border-2 border-dashed border-zinc-900 rounded-2xl">
                        <p className="text-zinc-500 font-medium">No results found.</p>
                        <p className="text-zinc-600 text-xs mt-1">Try adjusting your filters.</p>
                    </div>
                )}
            </div>
        </div>

        {/* Context Menu */}
        {contextMenu && (
             <div 
                className="fixed bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[180px] overflow-hidden"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-3 py-2 border-b border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase">
                    Asset Actions
                </div>
                {contextMenu.node.assetId && contextMenu.node.data.imageUrl ? (
                     <>
                        <button 
                            onClick={() => { if(onSetThumbnail) onSetThumbnail(contextMenu.node.assetId!, contextMenu.node.data.imageUrl!); setContextMenu(null); }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-blue-900/30 text-zinc-200 hover:text-blue-300 flex items-center gap-2"
                        >
                            <UserCheck size={12} /> Set Thumbnail
                        </button>

                        {/* Refine / Casting Options */}
                        {currentDept === DepartmentType.CASTING_WARDROBE && (
                            <>
                                {onRefineConcept && (
                                    <button 
                                        onClick={() => { onRefineConcept(contextMenu.node.assetId!, contextMenu.node.data.imageUrl!); setContextMenu(null); }}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-green-900/30 text-zinc-200 hover:text-green-300 flex items-center gap-2"
                                    >
                                        <ScanFace size={12} /> Refine Character
                                    </button>
                                )}
                                {onGenerateTurntable && (
                                    <button 
                                        onClick={() => { onGenerateTurntable(contextMenu.node); setContextMenu(null); }}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-red-900/30 text-zinc-200 hover:text-red-300 flex items-center gap-2"
                                    >
                                        <Rotate3d size={12} /> Generate 3D Turntable
                                    </button>
                                )}
                                {onGenerateExpressions && (
                                    <button 
                                        onClick={() => { onGenerateExpressions(contextMenu.node); setContextMenu(null); }}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-purple-900/30 text-zinc-200 hover:text-purple-300 flex items-center gap-2"
                                    >
                                        <Smile size={12} /> Generate Expressions
                                    </button>
                                )}
                            </>
                        )}
                    </>
                ) : (
                    <div className="px-3 py-2 text-xs text-zinc-500 italic">No actions available</div>
                )}
            </div>
        )}

        {/* Lightbox Modal */}
        {previewNode && createPortal(
            <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200" onClick={() => setPreviewNode(null)}>
                
                {/* Navigation Controls */}
                <button 
                    onClick={(e) => { e.stopPropagation(); handlePrevPreview(); }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-4 text-zinc-500 hover:text-white transition-colors hover:bg-white/10 rounded-full"
                >
                    <ChevronLeft size={48} />
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); handleNextPreview(); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-4 text-zinc-500 hover:text-white transition-colors hover:bg-white/10 rounded-full"
                >
                    <ChevronRight size={48} />
                </button>

                <button 
                    onClick={() => setPreviewNode(null)}
                    className="absolute top-6 right-6 p-2 rounded-full bg-zinc-800 text-white hover:bg-zinc-700 z-50"
                >
                    <X size={24} />
                </button>

                <div className="max-w-7xl w-full h-[85vh] flex flex-col md:flex-row gap-8 px-12" onClick={e => e.stopPropagation()}>
                    {/* Media Display */}
                    <div className="flex-1 flex items-center justify-center rounded-2xl overflow-hidden relative">
                         {previewNode.type.includes('image') && previewNode.data.imageUrl && (
                             <img src={previewNode.data.imageUrl} className="max-w-full max-h-full object-contain drop-shadow-2xl" />
                         )}
                         {previewNode.type.includes('video') && previewNode.data.videoUrl && (
                             <video src={previewNode.data.videoUrl} controls autoPlay loop className="max-w-full max-h-full drop-shadow-2xl" />
                         )}
                         {(previewNode.type.includes('text')) && (
                             <div className="max-w-2xl w-full h-full p-8 overflow-y-auto font-mono text-zinc-300 whitespace-pre-wrap text-lg bg-zinc-900 rounded-xl border border-zinc-800">
                                 {previewNode.data.text}
                             </div>
                         )}

                         <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur px-4 py-1.5 rounded-full border border-white/10 text-xs text-white flex items-center gap-2">
                             <span>{previewNode.data.model}</span>
                             <span className="w-1 h-1 bg-zinc-500 rounded-full"/>
                             <span>{previewNode.data.aspectRatio}</span>
                         </div>
                    </div>

                    {/* Metadata Sidebar */}
                    <div className="w-full md:w-80 shrink-0 bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col gap-6 h-full overflow-y-auto">
                        <div>
                            <label className="text-xs font-bold text-zinc-500 uppercase">Prompt / Content</label>
                            <p className="mt-2 text-sm text-zinc-200 leading-relaxed font-mono bg-black/20 p-3 rounded border border-white/5 whitespace-pre-wrap">
                                {previewNode.data.prompt || previewNode.data.text || "No content"}
                            </p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-zinc-500 uppercase">Type</label>
                                <p className="text-sm text-white capitalize">{previewNode.type.split('_').pop()?.toLowerCase()}</p>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-zinc-500 uppercase">Status</label>
                                <div className="mt-1">{renderStatusBadge(previewNode.data.status)}</div>
                            </div>
                        </div>

                        {previewNode.data.tag && (
                             <div>
                                <label className="text-xs font-bold text-zinc-500 uppercase">Tag</label>
                                <span className="inline-block mt-1 px-2 py-1 bg-blue-900/30 text-blue-300 text-xs rounded border border-blue-800">
                                    {previewNode.data.tag}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>,
            document.body
        )}
    </div>
  );
};
