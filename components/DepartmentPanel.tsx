
import React, { useState, useEffect, useMemo } from 'react';
import { DepartmentType, ProjectAsset, FlowNode } from '../types';
import { DEPARTMENTS } from '../constants';
import { Plus, ChevronRight, ChevronDown, User, MapPin, FileText, Box, Layout, Wand2, Video, Clapperboard, Shirt, Trash2, Archive, RotateCcw, Scissors } from 'lucide-react';

interface DepartmentPanelProps {
  department: DepartmentType;
  assets: ProjectAsset[];
  nodes: FlowNode[];
  currentAssetId: string | null;
  onSelectAsset: (id: string | null) => void;
  onCreateAsset: (parentId?: string) => void;
  onAnalyzeScripts?: () => void;
  onDiscoverShots?: (assetId: string) => void;
  assetThumbnails?: Record<string, string>; // Effective thumbnails (approved or manual)
  onDeleteAsset?: (assetId: string) => void;
  onArchiveAsset?: (assetId: string) => void;
  onRestoreAsset?: (assetId: string) => void;
}

export const DepartmentPanel: React.FC<DepartmentPanelProps> = ({ 
    department, 
    assets, 
    nodes, 
    currentAssetId, 
    onSelectAsset,
    onCreateAsset,
    onAnalyzeScripts,
    onDiscoverShots,
    assetThumbnails = {},
    onDeleteAsset,
    onArchiveAsset,
    onRestoreAsset
}) => {
  const [expandedAssets, setExpandedAssets] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  
  // Resizable Width State
  const [width, setWidth] = useState(256); // Start at 256px
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          if (!isResizing) return;
          // Constrain width between 200 and 600
          setWidth(Math.max(200, Math.min(600, e.clientX)));
      };
      
      const handleMouseUp = () => {
          setIsResizing(false);
      };

      if (isResizing) {
          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none'; // Prevent selection during resize
      } else {
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
      }

      return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
      };
  }, [isResizing]);

  const deptConfig = DEPARTMENTS.find(d => d.id === department);
  const assetLabel = deptConfig?.assetLabel || "Item";

  // Filter assets for this department and archive status
  // Shared Context: Story, Production, and Editorial share assets
  const deptAssets = useMemo(() => {
      const sharedContexts = [DepartmentType.STORY, DepartmentType.PRODUCTION, DepartmentType.EDITORIAL];
      const isSharedContext = sharedContexts.includes(department);

      return assets.filter(a => {
          // Archive Filter
          const isArchived = a.status === 'archived';
          if (!showArchived && isArchived) return false;
          
          if (isSharedContext) {
              // If we are in a shared context, show assets from any shared context
              return sharedContexts.includes(a.department);
          }

          // Exact Match for other departments
          return a.department === department;
      });
  }, [assets, department, showArchived]);

  // Helper to count items in an asset (for UI info)
  const getAssetNodeCount = (assetId: string) => nodes.filter(n => n.assetId === assetId).length;

  const getIconForAsset = (asset: ProjectAsset) => {
      // Logic for child icons specific to Casting
      if (asset.department === DepartmentType.CASTING_WARDROBE && asset.parentId) {
          return <Shirt size={16} />;
      }
      
      // Use asset's own department for icon, not the current view
      switch(asset.department) {
          case DepartmentType.CASTING_WARDROBE: return <User size={16} />;
          case DepartmentType.SET_DESIGN: return <MapPin size={16} />;
          case DepartmentType.WRITERS_ROOM: return <FileText size={16} />;
          case DepartmentType.STORY: return <Layout size={16} />;
          case DepartmentType.PRODUCTION: return <Clapperboard size={16} />;
          case DepartmentType.EDITORIAL: return <Scissors size={16} />;
          default: return <Box size={16} />;
      }
  }

  // Define analyze button availability and label
  let analyzeLabel = "";
  if (department === DepartmentType.CASTING_WARDROBE) analyzeLabel = "Find Characters";
  if (department === DepartmentType.SET_DESIGN) analyzeLabel = "Find Locations";
  if (department === DepartmentType.STORY) analyzeLabel = "Find Scenes";

  const toggleExpand = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setExpandedAssets(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
      });
  };

  const handleDeleteClick = (e: React.MouseEvent, assetId: string, title: string) => {
      e.stopPropagation();
      if (window.confirm(`Are you sure you want to permanently DELETE "${title}" and all its contents?\n\nThis action cannot be undone.`)) {
          if (onDeleteAsset) onDeleteAsset(assetId);
      }
  };

  const handleArchiveClick = (e: React.MouseEvent, assetId: string) => {
      e.stopPropagation();
      if (onArchiveAsset) onArchiveAsset(assetId);
  };

  const handleRestoreClick = (e: React.MouseEvent, assetId: string) => {
      e.stopPropagation();
      if (onRestoreAsset) onRestoreAsset(assetId);
  };

  // --- Recursive/Hierarchical Rendering ---
  // Allow hierarchy for Shared Contexts + Casting
  const isHierarchical = 
    department === DepartmentType.STORY || 
    department === DepartmentType.PRODUCTION || 
    department === DepartmentType.EDITORIAL ||
    department === DepartmentType.CASTING_WARDROBE;

  const renderAssetRow = (asset: ProjectAsset, depth = 0) => {
      const isActive = currentAssetId === asset.id;
      const nodeCount = getAssetNodeCount(asset.id);
      const children = deptAssets.filter(a => a.parentId === asset.id);
      const hasChildren = children.length > 0;
      const isExpanded = expandedAssets.has(asset.id);
      const isArchived = asset.status === 'archived';
      
      // Effective Thumbnail
      const effectiveThumbnail = assetThumbnails[asset.id] || asset.thumbnailUrl;

      return (
        <React.Fragment key={asset.id}>
            <div 
                className={`group relative flex items-center gap-2 px-2 py-2 rounded-lg transition-all border mb-1 cursor-pointer overflow-hidden
                    ${isActive ? 'bg-zinc-800 border-blue-500/30 ring-1 ring-blue-500/20' : 'bg-zinc-900/30 border-transparent hover:bg-zinc-800 hover:border-zinc-700'}
                    ${isArchived ? 'opacity-50 grayscale' : 'opacity-100'}
                `}
                style={{ marginLeft: `${depth * 16}px` }}
                onClick={() => onSelectAsset(asset.id)}
            >
                {/* Expand Toggle */}
                {isHierarchical && (
                    <button 
                        onClick={(e) => toggleExpand(e, asset.id)}
                        className={`p-1 rounded hover:bg-zinc-700 ${hasChildren ? 'text-zinc-400' : 'text-zinc-700 pointer-events-none'}`}
                    >
                        {isExpanded ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                    </button>
                )}

                {/* Icon/Thumbnail */}
                <div className={`relative w-8 h-8 rounded overflow-hidden flex items-center justify-center shrink-0 transition-colors ${isActive ? 'bg-blue-900/30 text-blue-400' : 'bg-zinc-950 text-zinc-500 group-hover:text-zinc-300'}`}>
                    {effectiveThumbnail ? (
                        <img src={effectiveThumbnail} alt={asset.title} className="w-full h-full object-cover" />
                    ) : (
                        getIconForAsset(asset)
                    )}
                </div>
                
                {/* Info (Text) - uses flex-1 to take available space but truncates if needed */}
                <div className="flex-1 min-w-0 pr-2">
                    <div className={`text-xs font-bold truncate ${isActive ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200'}`} title={asset.title}>
                        {asset.title}
                    </div>
                    {isArchived && <span className="text-[9px] text-orange-500 uppercase font-bold">Archived</span>}
                </div>

                {/* Node Count - visible by default if space permits, can be covered by actions */}
                {nodeCount > 0 && !isArchived && (
                    <span className="text-[9px] bg-zinc-950 text-zinc-500 px-1.5 rounded-full shrink-0 group-hover:opacity-0 transition-opacity">
                        {nodeCount}
                    </span>
                )}

                {/* Actions Hover - Absolute positioned to overlay text end smoothly */}
                <div className="absolute right-0 top-0 bottom-0 flex items-center pr-2 pl-6 bg-gradient-to-l from-zinc-800 via-zinc-800 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-1">
                        {/* Restore Action (only if archived) */}
                        {isArchived ? (
                            <button 
                                onClick={(e) => handleRestoreClick(e, asset.id)}
                                className="p-1 hover:bg-green-900/50 hover:text-green-400 rounded text-zinc-500"
                                title="Restore Asset"
                            >
                                <RotateCcw size={12} />
                            </button>
                        ) : (
                            <>
                                {/* Discover Shots Action for Scenes */}
                                {!asset.parentId && department === DepartmentType.STORY && onDiscoverShots && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDiscoverShots(asset.id); }}
                                        className="p-1 hover:bg-purple-600 hover:text-white rounded text-zinc-500"
                                        title="Discover Shots"
                                    >
                                        <Video size={12} />
                                    </button>
                                )}
                                
                                {/* Add Child Action */}
                                {isHierarchical && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onCreateAsset(asset.id); setExpandedAssets(prev => new Set(prev).add(asset.id)); }}
                                        className="p-1 hover:bg-blue-600 hover:text-white rounded text-zinc-500"
                                        title={`Add Child (Look/Shot)`}
                                    >
                                        <Plus size={12} />
                                    </button>
                                )}

                                {/* Archive Action */}
                                <button 
                                    onClick={(e) => handleArchiveClick(e, asset.id)}
                                    className="p-1 hover:bg-zinc-700 hover:text-orange-400 rounded text-zinc-500"
                                    title="Archive Asset"
                                >
                                    <Archive size={12} />
                                </button>
                            </>
                        )}

                        {/* Delete Action (Always available) */}
                        <button 
                            onClick={(e) => handleDeleteClick(e, asset.id, asset.title)}
                            className="p-1 hover:bg-red-900/50 hover:text-red-400 rounded text-zinc-500"
                            title="Permanently Delete"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Render Children */}
            {isHierarchical && isExpanded && children.map(child => renderAssetRow(child, depth + 1))}
        </React.Fragment>
      );
  };

  // Get Root Assets (no parent)
  // For shared views, we only show Root Assets (Sequences/Scenes) at the top level
  // Children (Shots) are shown via recursion
  const rootAssets = isHierarchical ? deptAssets.filter(a => !a.parentId) : deptAssets;

  return (
    <div 
        className="h-full bg-surface border-r border-border flex flex-col z-10 relative"
        style={{ width: `${width}px` }}
    >
        {/* Resize Handle */}
        <div 
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 z-50 transition-colors opacity-0 hover:opacity-100 active:opacity-100 active:bg-blue-600"
            onMouseDown={() => setIsResizing(true)}
        />

        {/* Header */}
        <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-sm text-zinc-100 truncate flex items-center gap-2">
                    {department}
                </h2>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setShowArchived(!showArchived)}
                        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${showArchived ? 'bg-orange-900/30 text-orange-400 border border-orange-800' : 'text-zinc-500 hover:text-zinc-300'}`}
                        title={showArchived ? "Hide Archived" : "Show Archived"}
                    >
                        <Archive size={12} />
                    </button>
                    <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">
                        {deptAssets.length}
                    </span>
                </div>
            </div>
            
            {/* Main Action Button */}
            <div className="space-y-2">
                <button 
                    onClick={() => onCreateAsset()}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2.5 rounded-lg transition-all shadow-lg shadow-blue-900/20"
                >
                    <Plus size={16} /> New {assetLabel}
                </button>

                {/* AI Analysis Feature */}
                {analyzeLabel && onAnalyzeScripts && (
                    <button 
                        onClick={onAnalyzeScripts}
                        className="w-full flex items-center justify-center gap-2 bg-purple-900/30 hover:bg-purple-900/50 text-purple-200 border border-purple-800 text-xs font-medium py-2 rounded-lg transition-all"
                        title="Analyze scripts to auto-generate assets"
                    >
                        <Wand2 size={14} /> {analyzeLabel}
                    </button>
                )}
            </div>
        </div>
        
        {/* Asset List */}
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
             
             {/* "General" Context Item (Root of Department) */}
             <button
                onClick={() => onSelectAsset(null)}
                className={`w-full text-left flex items-center gap-3 px-3 py-3 rounded-lg transition-colors border mb-2 ${currentAssetId === null ? 'bg-zinc-800 border-zinc-700' : 'bg-transparent border-transparent hover:bg-zinc-800/50 text-zinc-500'}`}
             >
                 <div className="p-1.5 bg-zinc-900 rounded border border-zinc-800">
                     <Box size={14} className="text-zinc-400"/>
                 </div>
                 <div className="flex-1 min-w-0">
                     <div className="text-xs font-medium text-zinc-300">General Workspace</div>
                     <div className="text-[10px] text-zinc-600">Unassigned nodes</div>
                 </div>
             </button>

             <div className="h-[1px] bg-zinc-800/50 mb-2 mx-2" />

             {/* Created Assets */}
             {deptAssets.length === 0 && (
                 <div className="text-center py-8 px-4 border border-dashed border-zinc-800/50 rounded-lg m-2">
                     <p className="text-zinc-600 text-xs mb-1 font-medium">{showArchived ? "No matching assets." : `No ${assetLabel}s yet.`}</p>
                     <p className="text-zinc-700 text-[10px]">{showArchived ? "" : "Create one to start building."}</p>
                 </div>
             )}

             {rootAssets.map(asset => renderAssetRow(asset))}
        </div>
    </div>
  );
};
