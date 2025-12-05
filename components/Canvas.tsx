
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { FlowNode, FlowConnection, NodeType, Position, DepartmentType, ProjectAsset, NodeData } from '../types';
import { NodeItem } from './NodeItem';
import { Button, Input } from './UI';
import { ZoomIn, ZoomOut, Type, Image as ImageIcon, Sparkles, Video, Archive, UserCheck, FolderPlus, Search, Trash2, MousePointer2, Scan, Group, FileText } from 'lucide-react';
import { DEPARTMENTS } from '../constants';

interface CanvasProps {
  nodes: FlowNode[];
  connections: FlowConnection[];
  setNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>;
  setConnections: React.Dispatch<React.SetStateAction<FlowConnection[]>>;
  currentDept: DepartmentType;
  currentAssetId: string | null;
  activeAsset?: ProjectAsset;
  focusNodes?: string[];
  onSetThumbnail?: (assetId: string, imageUrl: string) => void;
  projectAssets?: ProjectAsset[];
}

// Available Nodes for Tab Menu
const NODE_TYPES_MENU = [
    { type: NodeType.TEXT_INPUT, label: "Note / Script", icon: Type, desc: "Manual text" },
    { type: NodeType.AI_TEXT_GEN, label: "AI Writer", icon: Sparkles, desc: "Generate text" },
    { type: NodeType.AI_IMAGE_GEN, label: "Image Generator", icon: ImageIcon, desc: "Imagen 4.0" },
    { type: NodeType.AI_IMAGE_EDIT, label: "Image Editor", icon: Sparkles, desc: "Nano Banana" },
    { type: NodeType.AI_VIDEO_GEN, label: "Video Generator", icon: Video, desc: "Veo Video" },
    { type: NodeType.GROUP, label: "Group", icon: FolderPlus, desc: "Container" },
];

interface HistoryState {
    nodes: FlowNode[];
    connections: FlowConnection[];
}

export const Canvas: React.FC<CanvasProps> = ({ nodes, connections, setNodes, setConnections, currentDept, currentAssetId, activeAsset, focusNodes, onSetThumbnail, projectAssets }) => {
  const [offset, setOffset] = useState<Position>({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  
  // Undo History
  const [history, setHistory] = useState<HistoryState[]>([]);
  
  // Interaction Modes
  const [interactionMode, setInteractionMode] = useState<'none' | 'panning' | 'selecting' | 'draggingNode'>('none');
  
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 }); // Client coordinates
  const [selectionBox, setSelectionBox] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragTargetGroupId, setDragTargetGroupId] = useState<string | null>(null); // Highlighted group on drag
  
  // Menus
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, nodeId: string | null } | null>(null);
  const [tabMenu, setTabMenu] = useState<{ x: number, y: number, visible: boolean, search: string, selectedIndex: number } | null>(null);

  // State Tracking
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const isDraggingRef = useRef(false);
  const mousePosRef = useRef<{x: number, y: number}>({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // --- History Management ---
  const saveHistory = useCallback(() => {
      setHistory(prev => {
          const newState = { nodes: [...nodes], connections: [...connections] };
          const newHistory = [...prev, newState];
          return newHistory.slice(-20); // Keep last 20
      });
  }, [nodes, connections]);

  const performUndo = useCallback(() => {
      setHistory(prev => {
          if (prev.length === 0) return prev;
          const previousState = prev[prev.length - 1];
          setNodes(previousState.nodes);
          setConnections(previousState.connections);
          return prev.slice(0, -1);
      });
  }, [setNodes, setConnections]);

  // Space Key & Shortcuts Listener
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          const tagName = (e.target as HTMLElement).tagName;
          const isInput = ['INPUT', 'TEXTAREA'].includes(tagName);

          // Space for Panning
          if (e.code === 'Space' && !e.repeat && !isInput) {
              setIsSpacePressed(true);
          }

          // Undo (Ctrl+Z)
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !isInput) {
              e.preventDefault();
              performUndo();
          }

          // Tab Menu
          if (e.key === 'Tab' && !isInput) {
              e.preventDefault();
              setTabMenu({
                  x: mousePosRef.current.x,
                  y: mousePosRef.current.y,
                  visible: true,
                  search: '',
                  selectedIndex: 0
              });
              setContextMenu(null);
          }

          // Delete
          if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
             if (selectedNodeIds.length > 0) {
                 deleteSelectedNodes();
             }
          }

          // Frame Selection
          if (e.key.toLowerCase() === 'f' && !isInput) {
              frameSelection();
          }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
          if (e.code === 'Space') {
              setIsSpacePressed(false);
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
      };
  }, [selectedNodeIds, nodes, offset, scale, performUndo]);

  // --- Filter Visible Nodes (Memoized) ---
  const visibleNodes = useMemo(() => nodes.filter(n => {
      const matchDept = n.department === currentDept;
      const matchAsset = n.assetId === (currentAssetId || undefined);
      const notArchived = showArchived ? true : n.data.status !== 'archived';
      
      // Check if parent is collapsed
      if (n.parentId) {
          const parent = nodes.find(p => p.id === n.parentId);
          if (parent && parent.data.collapsed) return false;
      }
      
      return matchDept && matchAsset && notArchived;
  }), [nodes, currentDept, currentAssetId, showArchived]);

  // Reset View when context changes
  useEffect(() => {
      setOffset({ x: 0, y: 0 });
      setScale(1);
      setSelectedNodeIds([]);
      setContextMenu(null);
      setHistory([]); // Clear history on context switch
  }, [currentDept, currentAssetId]);

  // Focus Logic (External)
  useEffect(() => {
      if (focusNodes && focusNodes.length > 0) {
          frameSelection(focusNodes);
      }
  }, [focusNodes]);

  // --- Actions ---

  const deleteSelectedNodes = () => {
      saveHistory(); // Snapshot before delete
      setNodes(prev => {
          const toDelete = new Set(selectedNodeIds);
          // Cascade delete children
          prev.forEach(n => { if (n.parentId && toDelete.has(n.parentId)) toDelete.add(n.id) });
          return prev.filter(n => !toDelete.has(n.id));
      });
      setSelectedNodeIds([]);
  };

  const handleGroupSelected = () => {
      if (selectedNodeIds.length === 0) return;
      
      saveHistory();

      const targets = nodes.filter(n => selectedNodeIds.includes(n.id));
      
      // Calculate Bounds
      const minX = Math.min(...targets.map(n => n.position.x));
      const minY = Math.min(...targets.map(n => n.position.y));
      const maxX = Math.max(...targets.map(n => n.position.x + (n.width || 300)));
      const maxY = Math.max(...targets.map(n => n.position.y + (n.height || 300)));
      
      const padding = 40;
      const headerHeight = 50;

      const groupNode: FlowNode = {
          id: `group-${Date.now()}`,
          type: NodeType.GROUP,
          department: currentDept,
          assetId: currentAssetId || undefined,
          position: { x: minX - padding, y: minY - padding - headerHeight },
          width: (maxX - minX) + (padding * 2),
          height: (maxY - minY) + (padding * 2) + headerHeight,
          data: { label: 'New Group', collapsed: false }
      };

      setNodes(prev => [
          ...prev.map(n => selectedNodeIds.includes(n.id) ? { ...n, parentId: groupNode.id } : n),
          groupNode
      ]);
      
      setSelectedNodeIds([groupNode.id]);
      setContextMenu(null);
  };

  const frameSelection = (targetIds?: string[]) => {
      const idsToFrame = targetIds || (selectedNodeIds.length > 0 ? selectedNodeIds : visibleNodes.map(n => n.id));
      if (idsToFrame.length === 0) {
          setOffset({ x: 0, y: 0 });
          setScale(1);
          return;
      }

      const targets = visibleNodes.filter(n => idsToFrame.includes(n.id));
      if (targets.length === 0) return;

      const minX = Math.min(...targets.map(n => n.position.x));
      const maxX = Math.max(...targets.map(n => n.position.x + (n.width || 300)));
      const minY = Math.min(...targets.map(n => n.position.y));
      const maxY = Math.max(...targets.map(n => n.position.y + (n.height || 400)));

      const centerW = (maxX - minX) / 2 + minX;
      const centerH = (maxY - minY) / 2 + minY;

      const viewportW = canvasRef.current?.clientWidth || window.innerWidth;
      const viewportH = canvasRef.current?.clientHeight || window.innerHeight;

      const padding = 100;
      const scaleX = viewportW / (maxX - minX + padding * 2);
      const scaleY = viewportH / (maxY - minY + padding * 2);
      const newScale = Math.min(1, Math.min(scaleX, scaleY)); 

      const newX = (viewportW / 2) - (centerW * newScale);
      const newY = (viewportH / 2) - (centerH * newScale);

      setScale(Math.max(0.2, Math.min(newScale, 1.5)));
      setOffset({ x: newX, y: newY });
  };

  const addNodeAtLocation = (type: NodeType, clientX: number, clientY: number, initialData?: Partial<NodeData>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      // Calculate world position
      const worldX = (clientX - rect.left - offset.x) / scale;
      const worldY = (clientY - rect.top - offset.y) / scale;

      const newNode: FlowNode = {
          id: `node-${Date.now()}`,
          type,
          department: currentDept,
          assetId: currentAssetId || undefined,
          position: { x: worldX, y: worldY },
          data: { 
              status: 'draft',
              prompt: activeAsset && type === NodeType.AI_IMAGE_GEN ? `@${activeAsset.title}` : undefined,
              ...initialData
          }
      };
      setNodes(prev => [...prev, newNode]);
      setSelectedNodeIds([newNode.id]);
  };

  // --- Callbacks for NodeItem ---

  const handleNodeSelect = useCallback((e: React.MouseEvent, id: string) => {
      // If we were dragging, do NOT trigger selection logic on mouse up/click
      if (isDraggingRef.current) return;
      if (e.shiftKey) return; // Shift handled in DragStart

      // Exclusive Select
      setSelectedNodeIds([id]);
  }, []);

  const onNodeDragStart = useCallback((e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setContextMenu(null);
      setTabMenu(null);
      
      // Save history before drag starts (state snapshot)
      // We do this here because handleMouseDown on canvas might trigger before we know it's a node drag
      saveHistory();

      isDraggingRef.current = false;
      setInteractionMode('draggingNode');
      setDraggingNodeId(id);

      setSelectedNodeIds(prev => {
          if (e.shiftKey) {
              // Toggle
              if (prev.includes(id)) return prev.filter(nid => nid !== id);
              return [...prev, id];
          } else {
              // If node is not already in selection, select it exclusively
              // If it IS in selection, keep selection (allows moving multiple)
              if (!prev.includes(id)) return [id];
              return prev;
          }
      });
  }, [saveHistory]);

  const handleNodeContextMenu = useCallback((e: React.MouseEvent, nodeId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
      setTabMenu(null);
  }, []);

  const handleSetThumbnailAction = () => {
      if (contextMenu && contextMenu.nodeId && onSetThumbnail) {
          const node = nodes.find(n => n.id === contextMenu.nodeId);
          if (node && node.assetId && node.data.imageUrl) {
               onSetThumbnail(node.assetId, node.data.imageUrl);
          }
      }
      setContextMenu(null);
  };

  const deleteNode = useCallback((id: string) => {
      saveHistory(); // Snapshot before delete
      setNodes(prev => {
          const toDelete = new Set([id]);
          prev.forEach(n => { if (n.parentId === id) toDelete.add(n.id) });
          return prev.filter(n => !toDelete.has(n.id));
      });
      setConnections(prev => prev.filter(c => c.fromNode !== id && c.toNode !== id));
  }, [setNodes, setConnections, saveHistory]);

  const updateNodeData = useCallback((id: string, data: any) => {
      setNodes(prev => prev.map(n => n.id === id ? { ...n, data } : n));
  }, [setNodes]);

  // --- Mouse Handlers ---

  const handleMouseDown = (e: React.MouseEvent) => {
    // Close menus
    if (contextMenu) setContextMenu(null);
    if (tabMenu) setTabMenu(null);

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    setDragStart({ x: e.clientX, y: e.clientY });

    const isLeft = e.button === 0;
    const isMiddle = e.button === 1;
    const isRight = e.button === 2;

    // Context Menu
    if (isRight) {
        return; // Handled by onContextMenu
    }

    // Pan Logic (Middle OR Left+Space OR Left on Background)
    if (isMiddle || (isLeft && isSpacePressed) || (isLeft && !e.shiftKey)) {
         setInteractionMode('panning');
         if (isLeft && !isSpacePressed) {
             // Standard app behavior: clicking background deselects
             setSelectedNodeIds([]); 
         }
         return;
    }

    // Selection Logic (Left + Shift)
    if (isLeft && e.shiftKey) {
         const relX = e.clientX - rect.left;
         const relY = e.clientY - rect.top;
         setInteractionMode('selecting');
         setSelectionBox({ x: relX, y: relY, w: 0, h: 0 });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Track mouse globally for Tab menu spawn
    mousePosRef.current = { x: e.clientX, y: e.clientY };

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (interactionMode === 'panning') {
        setOffset(prev => ({
            x: prev.x + e.movementX,
            y: prev.y + e.movementY
        }));
    } else if (interactionMode === 'selecting') {
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        
        const x = Math.min(dragStart.x - rect.left, currentX);
        const y = Math.min(dragStart.y - rect.top, currentY);
        const w = Math.abs(currentX - (dragStart.x - rect.left));
        const h = Math.abs(currentY - (dragStart.y - rect.top));

        setSelectionBox({ x, y, w, h });
    } else if (interactionMode === 'draggingNode' && draggingNodeId) {
        isDraggingRef.current = true;
        const zoomFactor = scale;
        const deltaX = e.movementX / zoomFactor;
        const deltaY = e.movementY / zoomFactor;
        
        // --- Drag to Group Detection ---
        const mouseX = (e.clientX - rect.left - offset.x) / scale;
        const mouseY = (e.clientY - rect.top - offset.y) / scale;
        
        const targetGroup = visibleNodes.find(n => 
            n.type === NodeType.GROUP && 
            n.id !== draggingNodeId && 
            !selectedNodeIds.includes(n.id) &&
            mouseX >= n.position.x && 
            mouseX <= n.position.x + (n.width || 400) && 
            mouseY >= n.position.y && 
            mouseY <= n.position.y + (n.height || 400)
        );

        setDragTargetGroupId(targetGroup ? targetGroup.id : null);
        // -------------------------------

        setNodes(prev => {
            const movingIds = new Set<string>();
            movingIds.add(draggingNodeId);
            
            if (selectedNodeIds.includes(draggingNodeId)) {
                selectedNodeIds.forEach(id => movingIds.add(id));
            }

            const nodesToMove = new Set<string>(movingIds);
            prev.forEach(n => {
                 if (movingIds.has(n.id) && n.type === NodeType.GROUP) {
                      prev.forEach(child => {
                          if (child.parentId === n.id) nodesToMove.add(child.id);
                      });
                 }
            });

            return prev.map(n => {
                if (nodesToMove.has(n.id)) {
                     return {
                        ...n,
                        position: {
                            x: n.position.x + deltaX,
                            y: n.position.y + deltaY
                        }
                    };
                }
                return n;
            });
        });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (interactionMode === 'selecting' && selectionBox) {
        const selLeft = (selectionBox.x - offset.x) / scale;
        const selTop = (selectionBox.y - offset.y) / scale;
        const selRight = (selectionBox.x + selectionBox.w - offset.x) / scale;
        const selBottom = (selectionBox.y + selectionBox.h - offset.y) / scale;

        const newSelected = visibleNodes.filter(n => {
            const nodeX = n.position.x;
            const nodeY = n.position.y;
            const nodeW = n.width || 288;
            const nodeH = n.height || 300;
            return (selLeft < nodeX + nodeW && selRight > nodeX && selTop < nodeY + nodeH && selBottom > nodeY);
        }).map(n => n.id);
        
        // Additive selection for Shift+Drag
        setSelectedNodeIds(prev => [...new Set([...prev, ...newSelected])]);
    }

    // --- Drop Node into Group ---
    if (interactionMode === 'draggingNode' && dragTargetGroupId) {
        const targetGroup = nodes.find(n => n.id === dragTargetGroupId);
        if (targetGroup) {
             // Determine nodes being dropped
             const nodesToDrop = selectedNodeIds.length > 0 ? selectedNodeIds : [draggingNodeId!];
             
             // Calculate union of group + new children to resize group
             const allChildrenIds = nodes.filter(n => n.parentId === dragTargetGroupId).map(n => n.id);
             const newMemberIds = nodesToDrop;
             const unionIds = [...new Set([...allChildrenIds, ...newMemberIds])];

             const members = nodes.filter(n => unionIds.includes(n.id));
             
             if (members.length > 0) {
                 const padding = 40;
                 const headerHeight = 50;

                 const minX = Math.min(...members.map(n => n.position.x), targetGroup.position.x + padding);
                 const minY = Math.min(...members.map(n => n.position.y), targetGroup.position.y + padding + headerHeight);
                 const maxX = Math.max(...members.map(n => n.position.x + (n.width || 300)), targetGroup.position.x + (targetGroup.width || 400) - padding);
                 const maxY = Math.max(...members.map(n => n.position.y + (n.height || 300)), targetGroup.position.y + (targetGroup.height || 400) - padding);

                 setNodes(prev => prev.map(n => {
                     if (n.id === dragTargetGroupId) {
                         // Update Group Dimensions
                         return {
                             ...n,
                             position: { x: minX - padding, y: minY - padding - headerHeight },
                             width: (maxX - minX) + (padding * 2),
                             height: (maxY - minY) + (padding * 2) + headerHeight
                         };
                     }
                     if (newMemberIds.includes(n.id)) {
                         // Assign Parent
                         return { ...n, parentId: dragTargetGroupId };
                     }
                     return n;
                 }));
             }
        }
    }
    // ----------------------------

    setInteractionMode('none');
    setSelectionBox(null);
    setDraggingNodeId(null);
    setDragTargetGroupId(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Standard Zoom to Point Logic
    const zoomSensitivity = -0.001;
    const delta = e.deltaY * zoomSensitivity;
    const oldScale = scale;
    const newScale = Math.min(Math.max(0.1, oldScale + delta), 3);

    // Calculate new offset to maintain mouse position in world space
    const newOffsetX = mouseX - (mouseX - offset.x) * (newScale / oldScale);
    const newOffsetY = mouseY - (mouseY - offset.y) * (newScale / oldScale);

    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  const handleCanvasContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      if (interactionMode !== 'none') return;
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId: null });
  };

  // --- Tab Menu Logic ---
  const filteredMenuNodes = tabMenu 
      ? NODE_TYPES_MENU.filter(n => n.label.toLowerCase().includes(tabMenu.search.toLowerCase()))
      : [];

  const handleTabMenuKeyDown = (e: React.KeyboardEvent) => {
      if (!tabMenu) return;
      if (e.key === 'ArrowDown') {
          e.preventDefault();
          setTabMenu(prev => prev ? {...prev, selectedIndex: Math.min(prev.selectedIndex + 1, filteredMenuNodes.length - 1)} : null);
      } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setTabMenu(prev => prev ? {...prev, selectedIndex: Math.max(prev.selectedIndex - 1, 0)} : null);
      } else if (e.key === 'Enter') {
          e.preventDefault();
          const item = filteredMenuNodes[tabMenu.selectedIndex];
          if (item) {
              addNodeAtLocation(item.type, tabMenu.x, tabMenu.y);
              setTabMenu(null);
          }
      } else if (e.key === 'Escape') {
          setTabMenu(null);
      }
  };

  return (
    <div 
        className="w-full h-full bg-black relative overflow-hidden font-sans select-none"
        onContextMenu={handleCanvasContextMenu}
    >
        {/* Grid Background */}
        <div 
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
                backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)',
                backgroundSize: `${20 * scale}px ${20 * scale}px`,
                transform: `translate(${offset.x % (20 * scale)}px, ${offset.y % (20 * scale)}px)`
            }}
        />
        
        {/* Main Canvas Area */}
        <div 
            ref={canvasRef}
            className={`w-full h-full ${interactionMode === 'panning' || isSpacePressed ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            onMouseLeave={handleMouseUp}
        >
            <div 
                className="origin-top-left w-full h-full absolute top-0 left-0 canvas-layer"
                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
            >
                {visibleNodes.map(node => (
                    <NodeItem 
                        key={node.id} 
                        node={node} 
                        isSelected={selectedNodeIds.includes(node.id)}
                        onSelect={handleNodeSelect}
                        onDelete={deleteNode}
                        onUpdate={updateNodeData}
                        onDragStart={onNodeDragStart}
                        onContextMenu={handleNodeContextMenu}
                        activeAsset={activeAsset}
                        isThumbnail={activeAsset?.thumbnailUrl === node.data.imageUrl}
                        isDragOver={dragTargetGroupId === node.id}
                        projectAssets={projectAssets}
                    />
                ))}
            </div>
        </div>

        {/* Selection Box */}
        {selectionBox && (
            <div 
                className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none z-50"
                style={{
                    left: selectionBox.x,
                    top: selectionBox.y,
                    width: selectionBox.w,
                    height: selectionBox.h
                }}
            />
        )}

        {/* Context Menu (Canvas & Node) */}
        {contextMenu && (
            <div 
                className="fixed bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[180px] overflow-hidden"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                onClick={(e) => e.stopPropagation()}
            >
                {contextMenu.nodeId ? (
                    // Node Context Menu
                    <>
                        <div className="px-3 py-2 border-b border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase">
                            Node Actions
                        </div>
                        {(() => {
                            const node = nodes.find(n => n.id === contextMenu.nodeId);
                            if (node?.data.imageUrl && node.assetId) {
                                return (
                                    <button 
                                        onClick={handleSetThumbnailAction}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-blue-900/30 text-zinc-200 hover:text-blue-300 flex items-center gap-2"
                                    >
                                        <UserCheck size={12} /> Set Thumbnail
                                    </button>
                                );
                            }
                            return null;
                        })()}
                         {/* Standard Delete */}
                        <button 
                            onClick={() => { deleteNode(contextMenu.nodeId!); setContextMenu(null); }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-red-900/30 text-red-400 flex items-center gap-2"
                        >
                            <Trash2 size={12} /> Delete Node
                        </button>
                    </>
                ) : (
                    // Canvas Context Menu
                    <>
                         <div className="px-3 py-2 border-b border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase">
                            Canvas Actions
                        </div>

                         {/* Writer's Room Specific Actions */}
                         {currentDept === DepartmentType.WRITERS_ROOM && (
                             <>
                                <button 
                                    onClick={() => { 
                                        addNodeAtLocation(NodeType.AI_TEXT_GEN, contextMenu.x, contextMenu.y, {
                                            prompt: activeAsset ? `Detailed outline for @${activeAsset.title}` : "Detailed story outline"
                                        }); 
                                        setContextMenu(null); 
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-blue-900/30 text-blue-200 flex items-center gap-2"
                                >
                                    <FileText size={12} /> Generate Outline
                                </button>
                                <button 
                                    onClick={() => { 
                                        addNodeAtLocation(NodeType.AI_IMAGE_GEN, contextMenu.x, contextMenu.y, {
                                            prompt: activeAsset ? `Concept art for @${activeAsset.title}` : "Cinematic concept art"
                                        }); 
                                        setContextMenu(null); 
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-purple-900/30 text-purple-200 flex items-center gap-2"
                                >
                                    <ImageIcon size={12} /> Generate Concept
                                </button>
                                <div className="h-[1px] bg-zinc-800 my-1 mx-2" />
                             </>
                         )}

                         <button 
                            onClick={() => { addNodeAtLocation(NodeType.TEXT_INPUT, contextMenu.x, contextMenu.y); setContextMenu(null); }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 text-zinc-300 flex items-center gap-2"
                        >
                            <Type size={12} /> Add Note
                        </button>
                        {selectedNodeIds.length > 0 && (
                            <button 
                                onClick={handleGroupSelected}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 text-zinc-300 flex items-center gap-2"
                            >
                                <FolderPlus size={12} /> Group Selected
                            </button>
                        )}
                        <button 
                            onClick={() => { frameSelection([]); setContextMenu(null); }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 text-zinc-300 flex items-center gap-2"
                        >
                            <Scan size={12} /> Reset View
                        </button>
                    </>
                )}
            </div>
        )}

        {/* Tab Menu (Node Search) */}
        {tabMenu && (
            <div 
                className="fixed z-50 flex flex-col bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-64 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                style={{ left: tabMenu.x, top: tabMenu.y }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-2 border-b border-zinc-800 flex items-center gap-2">
                    <Search size={14} className="text-zinc-500" />
                    <input 
                        autoFocus
                        className="bg-transparent text-sm text-white focus:outline-none w-full placeholder-zinc-600"
                        placeholder="Search nodes..."
                        value={tabMenu.search}
                        onChange={(e) => setTabMenu({...tabMenu, search: e.target.value, selectedIndex: 0})}
                        onKeyDown={handleTabMenuKeyDown}
                    />
                </div>
                <div className="max-h-60 overflow-y-auto p-1">
                    {filteredMenuNodes.map((item, idx) => (
                        <button
                            key={item.type}
                            onClick={() => { addNodeAtLocation(item.type, tabMenu.x, tabMenu.y); setTabMenu(null); }}
                            className={`w-full text-left px-3 py-2 rounded flex items-center gap-3 transition-colors ${idx === tabMenu.selectedIndex ? 'bg-blue-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}
                        >
                            <item.icon size={16} className={idx === tabMenu.selectedIndex ? 'text-white' : 'text-zinc-500'} />
                            <div>
                                <div className="text-xs font-bold">{item.label}</div>
                                <div className={`text-[10px] ${idx === tabMenu.selectedIndex ? 'text-blue-200' : 'text-zinc-500'}`}>{item.desc}</div>
                            </div>
                        </button>
                    ))}
                    {filteredMenuNodes.length === 0 && (
                        <div className="p-3 text-xs text-zinc-500 text-center">No matching nodes</div>
                    )}
                </div>
                <div className="bg-zinc-950 px-2 py-1 text-[9px] text-zinc-600 border-t border-zinc-800 flex justify-between">
                    <span>Create: ⏎</span>
                    <span>Navigate: ↑↓</span>
                </div>
            </div>
        )}

        {/* Floating Toolbar */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-full shadow-2xl z-40">
            <div className="flex items-center gap-1 px-2 border-r border-zinc-700">
                 {/* Quick Add Buttons */}
                <Button variant="ghost" onClick={() => addNodeAtLocation(NodeType.TEXT_INPUT, window.innerWidth/2, window.innerHeight/2)} title="Add Note">
                    <Type size={18} />
                </Button>
                <Button variant="ghost" onClick={() => addNodeAtLocation(NodeType.AI_TEXT_GEN, window.innerWidth/2, window.innerHeight/2)} title="AI Writer">
                    <Sparkles size={18} className="text-blue-400"/>
                </Button>
                <Button variant="ghost" onClick={() => addNodeAtLocation(NodeType.AI_IMAGE_GEN, window.innerWidth/2, window.innerHeight/2)} title="Generate Image">
                    <ImageIcon size={18} className="text-purple-400"/>
                </Button>
                 <Button variant="ghost" onClick={() => addNodeAtLocation(NodeType.AI_IMAGE_EDIT, window.innerWidth/2, window.innerHeight/2)} title="Edit Image">
                    <Sparkles size={18} className="text-pink-400"/>
                </Button>
                <Button variant="ghost" onClick={() => addNodeAtLocation(NodeType.AI_VIDEO_GEN, window.innerWidth/2, window.innerHeight/2)} title="Veo Video">
                    <Video size={18} className="text-red-400"/>
                </Button>
            </div>
            <div className="flex items-center gap-1 px-2 border-r border-zinc-700">
                <Button variant="ghost" onClick={() => setScale(s => s - 0.1)}><ZoomOut size={16}/></Button>
                <span className="text-xs text-zinc-500 font-mono w-12 text-center">{Math.round(scale * 100)}%</span>
                <Button variant="ghost" onClick={() => setScale(s => s + 0.1)}><ZoomIn size={16}/></Button>
            </div>
             <div className="flex items-center gap-1 pl-1">
                <Button 
                    variant={showArchived ? 'primary' : 'ghost'} 
                    onClick={() => setShowArchived(!showArchived)}
                    title={showArchived ? "Hide Archived" : "Show Archived"}
                >
                    <Archive size={16} className={showArchived ? "text-white" : "text-zinc-500"}/>
                </Button>
            </div>
        </div>
        
        {/* Key Hint Overlay */}
        <div className="absolute top-4 right-4 flex flex-col items-end gap-1 pointer-events-none opacity-50">
             <div className="text-[10px] text-zinc-500 bg-black/50 px-2 py-1 rounded">TAB for Menu</div>
             <div className="text-[10px] text-zinc-500 bg-black/50 px-2 py-1 rounded">F to Frame</div>
             <div className="text-[10px] text-zinc-500 bg-black/50 px-2 py-1 rounded">Ctrl+Z Undo</div>
        </div>
    </div>
  );
};
