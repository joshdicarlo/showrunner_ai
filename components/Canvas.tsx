
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { FlowNode, FlowConnection, NodeType, Position, DepartmentType, ProjectAsset, NodeData, ProjectSettings } from '../types';
import { NodeItem } from './NodeItem';
import { Button, Input, Modal, ToggleGroup } from './UI';
import { ZoomIn, ZoomOut, Type, Image as ImageIcon, Sparkles, Video, Archive, UserCheck, FolderPlus, Search, Trash2, MousePointer2, Scan, Group, FileText, ScanFace, Rotate3d, Smile, Bug, Code as CodeIcon, Copy, BookmarkPlus } from 'lucide-react';
import { DEPARTMENTS, MODELS, VIDEO_MODEL_CAPABILITIES } from '../constants';
import { resolvePrompt, resolveReferenceImages } from '../utils/promptUtils';

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
  onRefineConcept?: (assetId: string, sourceImageUrl: string) => void;
  refinedImagesMap?: Record<string, string[]>;
  approvedImagesMap?: Record<string, string[]>;
  projectSettings?: ProjectSettings;
  // New prop for video generation triggers
  onGenerateVideo?: (node: FlowNode, model: string) => void;
  assetThumbnails?: Record<string, string>;
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

export const Canvas: React.FC<CanvasProps> = ({ 
    nodes, connections, setNodes, setConnections, currentDept, currentAssetId, activeAsset, focusNodes, onSetThumbnail, projectAssets, onRefineConcept, refinedImagesMap = {}, approvedImagesMap = {}, projectSettings, onGenerateVideo, assetThumbnails = {}
}) => {
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

  // Debug State
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [debugTrace, setDebugTrace] = useState<{resolved: string, trace: string[], referenceImages: string[], model: string, submittedPrompt?: string, nodeType?: string} | null>(null);
  const [debugView, setDebugView] = useState<'trace' | 'js' | 'python' | 'submitted'>('trace');

  // State Tracking
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const isDraggingRef = useRef(false);
  const mousePosRef = useRef<{x: number, y: number}>({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Solves "passive event listener" error by using a non-passive listener manually
  const stateRef = useRef({ scale, offset });
  stateRef.current = { scale, offset };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      const { scale, offset } = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const zoomSensitivity = -0.001;
      const delta = e.deltaY * zoomSensitivity;
      
      const oldScale = scale;
      const newScale = Math.min(Math.max(0.1, oldScale + delta), 3);
      const newOffsetX = mouseX - (mouseX - offset.x) * (newScale / oldScale);
      const newOffsetY = mouseY - (mouseY - offset.y) * (newScale / oldScale);
      
      setScale(newScale);
      setOffset({ x: newOffsetX, y: newOffsetY });
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // --- Smart Placement Helper ---
  const findSmartPosition = useCallback((preferredX: number, preferredY: number, width: number, height: number): Position => {
      const padding = 20;
      let x = preferredX;
      let y = preferredY;
      let attempts = 0;
      const maxAttempts = 50;

      const visible = nodes.filter(n => n.department === currentDept && n.assetId === (currentAssetId || undefined));

      const isColliding = (checkX: number, checkY: number) => {
          return visible.some(n => {
              const nW = n.width || 300;
              const nH = n.height || 300;
              return (
                  checkX < n.position.x + nW + padding &&
                  checkX + width + padding > n.position.x &&
                  checkY < n.position.y + nH + padding &&
                  checkY + height + padding > n.position.y
              );
          });
      };

      while (isColliding(x, y) && attempts < maxAttempts) {
          x += width + padding;
          if (attempts % 5 === 0 && attempts > 0) {
              x = preferredX;
              y += height + padding;
          }
          attempts++;
      }
      
      return { x, y };
  }, [nodes, currentDept, currentAssetId]);

  const findBelowPosition = useCallback((width: number, height: number): Position => {
      const visible = nodes.filter(n => n.department === currentDept && n.assetId === (currentAssetId || undefined));
      if (visible.length === 0) return { x: 100, y: 100 };

      const maxY = Math.max(...visible.map(n => n.position.y + (n.height || 400)));
      return { x: 100, y: maxY + 50 };
  }, [nodes, currentDept, currentAssetId]);

  // --- History Management ---
  const saveHistory = useCallback(() => {
      setHistory(prev => {
          const newState = { nodes: [...nodes], connections: [...connections] };
          const newHistory = [...prev, newState];
          return newHistory.slice(-20);
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

  // ... (Shortcuts & Interaction Handlers omitted for brevity, same as before) ...
  // Re-adding essential effects
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          const tagName = (e.target as HTMLElement).tagName;
          const isInput = ['INPUT', 'TEXTAREA'].includes(tagName);
          if (e.code === 'Space' && !e.repeat && !isInput) setIsSpacePressed(true);
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !isInput) { e.preventDefault(); performUndo(); }
          if (e.key === 'Tab' && !isInput) { e.preventDefault(); setTabMenu({ x: mousePosRef.current.x, y: mousePosRef.current.y, visible: true, search: '', selectedIndex: 0 }); setContextMenu(null); }
          if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput && selectedNodeIds.length > 0) deleteSelectedNodes();
          if (e.key.toLowerCase() === 'f' && !isInput) frameSelection();
      };
      const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpacePressed(false); };
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [selectedNodeIds, nodes, offset, scale, performUndo]);

  const visibleNodes = useMemo(() => nodes.filter(n => {
      const matchDept = n.department === currentDept;
      const matchAsset = n.assetId === (currentAssetId || undefined);
      const notArchived = showArchived ? true : n.data.status !== 'archived';
      if (n.parentId) { const parent = nodes.find(p => p.id === n.parentId); if (parent && parent.data.collapsed) return false; }
      return matchDept && matchAsset && notArchived;
  }), [nodes, currentDept, currentAssetId, showArchived]);

  useEffect(() => { setOffset({ x: 0, y: 0 }); setScale(1); setSelectedNodeIds([]); setContextMenu(null); setHistory([]); }, [currentDept, currentAssetId]);
  useEffect(() => { if (focusNodes && focusNodes.length > 0) frameSelection(focusNodes); }, [focusNodes]);

  // --- Actions ---
  const deleteSelectedNodes = () => {
      saveHistory(); 
      setNodes(prev => {
          const toDelete = new Set(selectedNodeIds);
          prev.forEach(n => { if (n.parentId && toDelete.has(n.parentId)) toDelete.add(n.id) });
          return prev.filter(n => !toDelete.has(n.id));
      });
      setSelectedNodeIds([]);
  };

  const handleGroupSelected = () => { 
      if (selectedNodeIds.length === 0) return;
      saveHistory();
      const targets = nodes.filter(n => selectedNodeIds.includes(n.id));
      const minX = Math.min(...targets.map(n => n.position.x));
      const minY = Math.min(...targets.map(n => n.position.y));
      const maxX = Math.max(...targets.map(n => n.position.x + (n.width || 300)));
      const maxY = Math.max(...targets.map(n => n.position.y + (n.height || 300)));
      const padding = 40; const headerHeight = 50;
      const groupNode: FlowNode = {
          id: `group-${Date.now()}`, type: NodeType.GROUP, department: currentDept, assetId: currentAssetId || undefined,
          position: { x: minX - padding, y: minY - padding - headerHeight }, width: (maxX - minX) + (padding * 2), height: (maxY - minY) + (padding * 2) + headerHeight,
          data: { label: 'New Group', collapsed: false }
      };
      setNodes(prev => [...prev.map(n => selectedNodeIds.includes(n.id) ? { ...n, parentId: groupNode.id } : n), groupNode]);
      setSelectedNodeIds([groupNode.id]); setContextMenu(null);
  };

  const frameSelection = (targetIds?: string[]) => { 
      setTimeout(() => {
          const idsToFrame = targetIds || (selectedNodeIds.length > 0 ? selectedNodeIds : visibleNodes.map(n => n.id));
          if (idsToFrame.length === 0) { setOffset({ x: 0, y: 0 }); setScale(1); return; }
          const targets = nodes.filter(n => idsToFrame.includes(n.id));
          if (targets.length === 0) return;
          const minX = Math.min(...targets.map(n => n.position.x)); const maxX = Math.max(...targets.map(n => n.position.x + (n.width || 300)));
          const minY = Math.min(...targets.map(n => n.position.y)); const maxY = Math.max(...targets.map(n => n.position.y + (n.height || 400)));
          const centerW = (maxX - minX) / 2 + minX; const centerH = (maxY - minY) / 2 + minY;
          const viewportW = canvasRef.current?.clientWidth || window.innerWidth; const viewportH = canvasRef.current?.clientHeight || window.innerHeight;
          const padding = 100; const scaleX = viewportW / (maxX - minX + padding * 2); const scaleY = viewportH / (maxY - minY + padding * 2);
          const newScale = Math.min(1, Math.min(scaleX, scaleY));
          setScale(Math.max(0.2, Math.min(newScale, 1.5))); setOffset({ x: (viewportW / 2) - (centerW * newScale), y: (viewportH / 2) - (centerH * newScale) });
      }, 50);
  };

  const addNodeAtLocation = (type: NodeType, clientX: number, clientY: number, initialData?: Partial<NodeData>) => { 
      const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
      const worldX = (clientX - rect.left - offset.x) / scale; const worldY = (clientY - rect.top - offset.y) / scale;
      const pos = findSmartPosition(worldX, worldY, 300, 400);
      let defaultRatio = undefined;
      if (type === NodeType.AI_IMAGE_GEN || type === NodeType.AI_VIDEO_GEN) {
          defaultRatio = "16:9";
          if (currentDept === DepartmentType.CASTING_WARDROBE) defaultRatio = "1:1";
      }
      const newNode: FlowNode = {
          id: `node-${Date.now()}`, type, department: currentDept, assetId: currentAssetId || undefined, position: pos,
          data: { status: 'draft', prompt: activeAsset && type === NodeType.AI_IMAGE_GEN ? `@${activeAsset.title}` : undefined, aspectRatio: defaultRatio, ...initialData }
      };
      setNodes(prev => [...prev, newNode]); setSelectedNodeIds([newNode.id]);
  };

  const handleNodeSelect = useCallback((e: React.MouseEvent, id: string) => { if (isDraggingRef.current) return; if (e.shiftKey) return; setSelectedNodeIds([id]); }, []);
  const onNodeDragStart = useCallback((e: React.MouseEvent, id: string) => { 
      e.stopPropagation(); setContextMenu(null); setTabMenu(null); saveHistory(); isDraggingRef.current = false; setInteractionMode('draggingNode'); setDraggingNodeId(id);
      setSelectedNodeIds(prev => e.shiftKey ? (prev.includes(id) ? prev.filter(nid => nid !== id) : [...prev, id]) : (!prev.includes(id) ? [id] : prev));
  }, [saveHistory]);
  const handleNodeContextMenu = useCallback((e: React.MouseEvent, nodeId: string) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, nodeId }); setTabMenu(null); }, []);

  const handleSetThumbnailAction = () => { 
      if (contextMenu && contextMenu.nodeId && onSetThumbnail) {
          const node = nodes.find(n => n.id === contextMenu.nodeId);
          if (node && node.assetId && node.data.imageUrl) onSetThumbnail(node.assetId, node.data.imageUrl);
      }
      setContextMenu(null);
  };
  const handleRefineAction = () => { 
      if (contextMenu && contextMenu.nodeId && onRefineConcept) {
          const node = nodes.find(n => n.id === contextMenu.nodeId);
          if (node && node.assetId && node.data.imageUrl) onRefineConcept(node.assetId, node.data.imageUrl);
      }
      setContextMenu(null);
  };
  const handleAddToRefAction = () => { if (contextMenu && contextMenu.nodeId) updateNodeData(contextMenu.nodeId, { tag: 'refinement', status: 'approved' }); setContextMenu(null); };
  
  // New Video Action Handlers
  const handleGenerateVideoAction = (instant: boolean) => {
      if (contextMenu && contextMenu.nodeId && onGenerateVideo) {
          const node = nodes.find(n => n.id === contextMenu.nodeId);
          if (node) {
              const model = instant ? MODELS.VIDEO_FAST : MODELS.VIDEO_HQ;
              onGenerateVideo(node, model);
          }
      }
      setContextMenu(null);
  }

  const handleTurntableAction = () => { 
      if (contextMenu && contextMenu.nodeId) {
          const node = nodes.find(n => n.id === contextMenu.nodeId);
          if (node && node.data.imageUrl) {
               const width = 300; const height = 400; const pos = findBelowPosition(width, height);
               const model = MODELS.VIDEO_HQ; const capabilities = VIDEO_MODEL_CAPABILITIES[model]; const supportsLastFrame = capabilities?.supportsLastFrame || false;
               const newNode: FlowNode = {
                   id: `vid-turntable-${Date.now()}`, type: NodeType.AI_VIDEO_GEN, department: currentDept, assetId: node.assetId, parentId: node.parentId, position: pos, width, height,
                   data: { prompt: `A smooth 360 degree 3D turntable of a static model, seamless loop, high quality render`, imageUrl: node.data.imageUrl, lastFrameImageUrl: supportsLastFrame ? node.data.imageUrl : undefined, model, aspectRatio: '16:9', status: 'draft', duration: '8', withAudio: false }
               };
               setNodes(prev => [...prev, newNode]); setSelectedNodeIds([newNode.id]); frameSelection([newNode.id]);
          }
      }
      setContextMenu(null);
  };
  const handleGenerateExpressions = () => { setContextMenu(null); };

  const deleteNode = useCallback((id: string) => { saveHistory(); setNodes(prev => { const toDelete = new Set([id]); prev.forEach(n => { if (n.parentId === id) toDelete.add(n.id) }); return prev.filter(n => !toDelete.has(n.id)); }); setConnections(prev => prev.filter(c => c.fromNode !== id && c.toNode !== id)); }, [setNodes, setConnections, saveHistory]);
  const updateNodeData = useCallback((id: string, data: any) => { setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, ...data } } : n)); }, [setNodes]);

  // --- Debug Logic ---
  const handleDebug = () => { 
      if (selectedNodeIds.length === 0) { alert("Select a node."); return; } 
      const node = nodes.find(n => n.id === selectedNodeIds[0]); 
      if (!node) return; 
      
      const rawPrompt = node.data.prompt || node.data.text || ""; 
      const { resolved, matchedAssets, trace } = resolvePrompt(rawPrompt, projectAssets, activeAsset, projectSettings, node.data.styleId, true); 
      
      let referenceImages: string[] = []; 
      if (node.data.referenceImageUrl) { 
          referenceImages = [node.data.referenceImageUrl]; 
      } else { 
          referenceImages = resolveReferenceImages(
              rawPrompt, 
              projectAssets, 
              activeAsset, 
              refinedImagesMap, 
              approvedImagesMap, 
              assetThumbnails, // Pass assetThumbnails here
              matchedAssets
          ); 
      } 
      
      setDebugTrace({ 
          resolved, 
          trace, 
          referenceImages, 
          model: node.data.model || 'default-model', 
          submittedPrompt: node.data.submittedPrompt,
          nodeType: node.type
      }); 
      setShowDebugModal(true); 
  }

  const getCodeSnippet = (lang: 'js' | 'python') => {
      if (!debugTrace) return "";
      const model = debugTrace.model;
      const prompt = debugTrace.resolved.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const hasRefs = debugTrace.referenceImages && debugTrace.referenceImages.length > 0;
      
      // Determine method based on node type
      const isVideo = debugTrace.nodeType === NodeType.AI_VIDEO_GEN;
      const isImage = debugTrace.nodeType === NodeType.AI_IMAGE_GEN || debugTrace.nodeType === NodeType.AI_IMAGE_EDIT;
      
      if (lang === 'js') {
          if (isVideo) {
              return `import { GoogleGenAI } from "@google/genai";\n\nconst ai = new GoogleGenAI({ apiKey: process.env.API_KEY });\n\nconst operation = await ai.models.generateVideos({\n  model: '${model}',\n  prompt: "${prompt}",\n  config: {\n    numberOfVideos: 1,\n    resolution: '720p',\n    aspectRatio: '16:9'\n  }\n});\n\n// Poll operation.done...`;
          }
          if (isImage) {
              return `import { GoogleGenAI } from "@google/genai";\n\nconst ai = new GoogleGenAI({ apiKey: process.env.API_KEY });\n\nconst response = await ai.models.generateContent({\n  model: '${model}',\n  contents: {\n    parts: [\n      // ... imageParts ...\n      { text: "${prompt}" }\n    ]\n  },\n  config: {\n    imageConfig: {\n      aspectRatio: "16:9",\n      imageSize: "1K"\n    }\n  }\n});`;
          }
          // Text Fallback
          return `import { GoogleGenAI } from "@google/genai";\n\nconst ai = new GoogleGenAI({ apiKey: process.env.API_KEY });\n\nconst response = await ai.models.generateContent({\n  model: '${model}',\n  contents: "${prompt}"\n});\n\nconsole.log(response.text);`;
      } 
      
      // Python
      else {
          if (isVideo) {
              return `from google import genai\n\nclient = genai.Client(api_key="GEMINI_API_KEY")\n\noperation = client.models.generate_videos(\n    model='${model}',\n    prompt="${prompt}",\n    config={\n        'number_of_videos': 1,\n        'resolution': '720p',\n        'aspect_ratio': '16:9'\n    }\n)`;
          }
          if (isImage) {
              return `from google import genai\nfrom google.genai import types\n\nclient = genai.Client(api_key="GEMINI_API_KEY")\n\nresponse = client.models.generate_content(\n    model='${model}',\n    contents=[\n        # ... image bytes ...\n        "${prompt}"\n    ],\n    config=types.GenerateContentConfig(\n        image_config=types.ImageGenerationConfig(\n            aspect_ratio="16:9",\n            image_size="1K"\n        )\n    )\n)`;
          }
          return `from google import genai\n\nclient = genai.Client(api_key="GEMINI_API_KEY")\n\nresponse = client.models.generate_content(\n    model='${model}',\n    contents="${prompt}"\n)\n\nprint(response.text)`;
      }
  }

  // --- Mouse Handlers ---
  const handleMouseDown = (e: React.MouseEvent) => { 
    if (contextMenu) setContextMenu(null); if (tabMenu) setTabMenu(null);
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return; setDragStart({ x: e.clientX, y: e.clientY });
    const isLeft = e.button === 0; const isMiddle = e.button === 1; const isRight = e.button === 2; if (isRight) return; 
    if (isMiddle || (isLeft && isSpacePressed) || (isLeft && !e.shiftKey)) { setInteractionMode('panning'); if (isLeft && !isSpacePressed) { setSelectedNodeIds([]); } return; }
    if (isLeft && e.shiftKey) { const relX = e.clientX - rect.left; const relY = e.clientY - rect.top; setInteractionMode('selecting'); setSelectionBox({ x: relX, y: relY, w: 0, h: 0 }); }
  };
  const handleMouseMove = (e: React.MouseEvent) => { 
    mousePosRef.current = { x: e.clientX, y: e.clientY }; const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    if (interactionMode === 'panning') { setOffset(prev => ({ x: prev.x + e.movementX, y: prev.y + e.movementY })); } 
    else if (interactionMode === 'selecting') { const currentX = e.clientX - rect.left; const currentY = e.clientY - rect.top; const x = Math.min(dragStart.x - rect.left, currentX); const y = Math.min(dragStart.y - rect.top, currentY); const w = Math.abs(currentX - (dragStart.x - rect.left)); const h = Math.abs(currentY - (dragStart.y - rect.top)); setSelectionBox({ x, y, w, h }); } 
    else if (interactionMode === 'draggingNode' && draggingNodeId) { isDraggingRef.current = true; const zoomFactor = scale; const deltaX = e.movementX / zoomFactor; const deltaY = e.movementY / zoomFactor; const mouseX = (e.clientX - rect.left - offset.x) / scale; const mouseY = (e.clientY - rect.top - offset.y) / scale; const targetGroup = visibleNodes.find(n => n.type === NodeType.GROUP && n.id !== draggingNodeId && !selectedNodeIds.includes(n.id) && mouseX >= n.position.x && mouseX <= n.position.x + (n.width || 400) && mouseY >= n.position.y && mouseY <= n.position.y + (n.height || 400)); setDragTargetGroupId(targetGroup ? targetGroup.id : null); setNodes(prev => { const movingIds = new Set<string>(); movingIds.add(draggingNodeId); if (selectedNodeIds.includes(draggingNodeId)) { selectedNodeIds.forEach(id => movingIds.add(id)); } const nodesToMove = new Set<string>(movingIds); prev.forEach(n => { if (movingIds.has(n.id) && n.type === NodeType.GROUP) { prev.forEach(child => { if (child.parentId === n.id) nodesToMove.add(child.id); }); } }); return prev.map(n => { if (nodesToMove.has(n.id)) { return { ...n, position: { x: n.position.x + deltaX, y: n.position.y + deltaY } }; } return n; }); }); }
  };
  const handleMouseUp = (e: React.MouseEvent) => { 
    if (interactionMode === 'selecting' && selectionBox) { const selLeft = (selectionBox.x - offset.x) / scale; const selTop = (selectionBox.y - offset.y) / scale; const selRight = (selectionBox.x + selectionBox.w - offset.x) / scale; const selBottom = (selectionBox.y + selectionBox.h - offset.y) / scale; const newSelected = visibleNodes.filter(n => { const nodeX = n.position.x; const nodeY = n.position.y; const nodeW = n.width || 288; const nodeH = n.height || 300; return (selLeft < nodeX + nodeW && selRight > nodeX && selTop < nodeY + nodeH && selBottom > nodeY); }).map(n => n.id); setSelectedNodeIds(prev => [...new Set([...prev, ...newSelected])]); }
    if (interactionMode === 'draggingNode' && dragTargetGroupId) { const targetGroup = nodes.find(n => n.id === dragTargetGroupId); if (targetGroup) { const nodesToDrop = selectedNodeIds.length > 0 ? selectedNodeIds : [draggingNodeId!]; const allChildrenIds = nodes.filter(n => n.parentId === dragTargetGroupId).map(n => n.id); const newMemberIds = nodesToDrop; const unionIds = [...new Set([...allChildrenIds, ...newMemberIds])]; const members = nodes.filter(n => unionIds.includes(n.id)); if (members.length > 0) { const padding = 40; const headerHeight = 50; const minX = Math.min(...members.map(n => n.position.x), targetGroup.position.x + padding); const minY = Math.min(...members.map(n => n.position.y), targetGroup.position.y + padding + headerHeight); const maxX = Math.max(...members.map(n => n.position.x + (n.width || 300)), targetGroup.position.x + (targetGroup.width || 400) - padding); const maxY = Math.max(...members.map(n => n.position.y + (n.height || 300)), targetGroup.position.x + (targetGroup.height || 400) - padding); setNodes(prev => prev.map(n => { if (n.id === dragTargetGroupId) { return { ...n, position: { x: minX - padding, y: minY - padding - headerHeight }, width: (maxX - minX) + (padding * 2), height: (maxY - minY) + (padding * 2) + headerHeight }; } if (newMemberIds.includes(n.id)) { return { ...n, parentId: dragTargetGroupId }; } return n; })); } } }
    setInteractionMode('none'); setSelectionBox(null); setDraggingNodeId(null); setDragTargetGroupId(null);
  };
  // Replaced with manual passive:false listener above
  const handleCanvasContextMenu = (e: React.MouseEvent) => { e.preventDefault(); if (interactionMode !== 'none') return; setContextMenu({ x: e.clientX, y: e.clientY, nodeId: null }); };
  const handleTabMenuKeyDown = (e: React.KeyboardEvent) => { if (!tabMenu) return; if (e.key === 'ArrowDown') { e.preventDefault(); setTabMenu(prev => prev ? {...prev, selectedIndex: Math.min(prev.selectedIndex + 1, filteredMenuNodes.length - 1)} : null); } else if (e.key === 'ArrowUp') { e.preventDefault(); setTabMenu(prev => prev ? {...prev, selectedIndex: Math.max(prev.selectedIndex - 1, 0)} : null); } else if (e.key === 'Enter') { e.preventDefault(); const item = filteredMenuNodes[tabMenu.selectedIndex]; if (item) { addNodeAtLocation(item.type, tabMenu.x, tabMenu.y); setTabMenu(null); } } else if (e.key === 'Escape') { setTabMenu(null); } };
  const filteredMenuNodes = tabMenu ? NODE_TYPES_MENU.filter(n => n.label.toLowerCase().includes(tabMenu.search.toLowerCase())) : [];

  return (
    <div className="w-full h-full bg-black relative overflow-hidden font-sans select-none" onContextMenu={handleCanvasContextMenu}>
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: `${20 * scale}px ${20 * scale}px`, transform: `translate(${offset.x % (20 * scale)}px, ${offset.y % (20 * scale)}px)` }} />
        <div ref={canvasRef} className={`w-full h-full ${interactionMode === 'panning' || isSpacePressed ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
            <div className="origin-top-left w-full h-full absolute top-0 left-0 canvas-layer" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
                {visibleNodes.map(node => (
                    <NodeItem key={node.id} node={node} isSelected={selectedNodeIds.includes(node.id)} onSelect={handleNodeSelect} onDelete={deleteNode} onUpdate={updateNodeData} onDragStart={onNodeDragStart} onContextMenu={handleNodeContextMenu} activeAsset={activeAsset} isThumbnail={activeAsset?.thumbnailUrl === node.data.imageUrl} isDragOver={dragTargetGroupId === node.id} projectAssets={projectAssets} assetThumbnails={onSetThumbnail ? {} : undefined} refinedImagesMap={refinedImagesMap} approvedImagesMap={approvedImagesMap} projectSettings={projectSettings} />
                ))}
            </div>
        </div>
        {selectionBox && ( <div className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none z-50" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.w, height: selectionBox.h }} /> )}

        {contextMenu && (
            <div className="fixed bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[180px] overflow-hidden" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
                {contextMenu.nodeId ? (
                    <>
                        <div className="px-3 py-2 border-b border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase">Node Actions</div>
                        {(() => {
                            const node = nodes.find(n => n.id === contextMenu.nodeId);
                            if (node?.data.imageUrl && node.assetId) {
                                return (
                                    <>
                                        <button onClick={handleSetThumbnailAction} className="w-full text-left px-3 py-2 text-xs hover:bg-blue-900/30 text-zinc-200 hover:text-blue-300 flex items-center gap-2">
                                            <UserCheck size={12} /> Set Thumbnail
                                        </button>
                                        
                                        {/* Video Generation Options */}
                                        {(node.department === DepartmentType.STORY || node.department === DepartmentType.PRODUCTION) && onGenerateVideo && (
                                            <>
                                                <div className="h-[1px] bg-zinc-800 my-1 mx-2" />
                                                <button onClick={() => handleGenerateVideoAction(false)} className="w-full text-left px-3 py-2 text-xs hover:bg-purple-900/30 text-zinc-200 hover:text-purple-300 flex items-center gap-2">
                                                    <Video size={12} /> Generate Video
                                                </button>
                                                <button onClick={() => handleGenerateVideoAction(true)} className="w-full text-left px-3 py-2 text-xs hover:bg-purple-900/30 text-zinc-200 hover:text-purple-300 flex items-center gap-2">
                                                    <Sparkles size={12} /> Generate Video (Instant)
                                                </button>
                                                <div className="h-[1px] bg-zinc-800 my-1 mx-2" />
                                            </>
                                        )}

                                        {node.department === DepartmentType.CASTING_WARDROBE && (
                                            <>
                                                <button onClick={handleAddToRefAction} className="w-full text-left px-3 py-2 text-xs hover:bg-yellow-900/30 text-zinc-200 hover:text-yellow-300 flex items-center gap-2">
                                                    <BookmarkPlus size={12} /> Add to Ref
                                                </button>
                                                {node.data.status === 'approved' && (
                                                    <>
                                                    {onRefineConcept && <button onClick={handleRefineAction} className="w-full text-left px-3 py-2 text-xs hover:bg-green-900/30 text-zinc-200 hover:text-green-300 flex items-center gap-2"><ScanFace size={12} /> Refine Character</button>}
                                                    <button onClick={handleTurntableAction} className="w-full text-left px-3 py-2 text-xs hover:bg-red-900/30 text-zinc-200 hover:text-red-300 flex items-center gap-2"><Rotate3d size={12} /> Generate 3D Turntable</button>
                                                    <button onClick={handleGenerateExpressions} className="w-full text-left px-3 py-2 text-xs hover:bg-purple-900/30 text-zinc-200 hover:text-purple-300 flex items-center gap-2"><Smile size={12} /> Generate Expressions</button>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </>
                                );
                            }
                            return null;
                        })()}
                        <button onClick={() => { deleteNode(contextMenu.nodeId!); setContextMenu(null); }} className="w-full text-left px-3 py-2 text-xs hover:bg-red-900/30 text-red-400 flex items-center gap-2"><Trash2 size={12} /> Delete Node</button>
                    </>
                ) : (
                    <>
                         <div className="px-3 py-2 border-b border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase">Canvas Actions</div>
                         {currentDept === DepartmentType.WRITERS_ROOM && (
                             <>
                                <button onClick={() => { addNodeAtLocation(NodeType.AI_TEXT_GEN, contextMenu.x, contextMenu.y, { prompt: activeAsset ? `Detailed outline for @${activeAsset.title}` : "Detailed story outline" }); setContextMenu(null); }} className="w-full text-left px-3 py-2 text-xs hover:bg-blue-900/30 text-blue-200 flex items-center gap-2"><FileText size={12} /> Generate Outline</button>
                                <button onClick={() => { addNodeAtLocation(NodeType.AI_IMAGE_GEN, contextMenu.x, contextMenu.y, { prompt: activeAsset ? `Concept art for @${activeAsset.title}` : "Cinematic concept art" }); setContextMenu(null); }} className="w-full text-left px-3 py-2 text-xs hover:bg-purple-900/30 text-purple-200 flex items-center gap-2"><ImageIcon size={12} /> Generate Concept</button>
                                <div className="h-[1px] bg-zinc-800 my-1 mx-2" />
                             </>
                         )}
                         <button onClick={() => { addNodeAtLocation(NodeType.TEXT_INPUT, contextMenu.x, contextMenu.y); setContextMenu(null); }} className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 text-zinc-300 flex items-center gap-2"><Type size={12} /> Add Note</button>
                        {selectedNodeIds.length > 0 && ( <button onClick={handleGroupSelected} className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 text-zinc-300 flex items-center gap-2"><FolderPlus size={12} /> Group Selected</button> )}
                        <button onClick={() => { frameSelection([]); setContextMenu(null); }} className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 text-zinc-300 flex items-center gap-2"><Scan size={12} /> Reset View</button>
                    </>
                )}
            </div>
        )}
        {/* ... TabMenu, Toolbar, Hints, DebugModal (Same) ... */}
        {tabMenu && ( <div className="fixed z-50 flex flex-col bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-64 overflow-hidden animate-in fade-in zoom-in-95 duration-100" style={{ left: tabMenu.x, top: tabMenu.y }} onClick={(e) => e.stopPropagation()}> <div className="p-2 border-b border-zinc-800 flex items-center gap-2"> <Search size={14} className="text-zinc-500" /> <input autoFocus className="bg-transparent text-sm text-white focus:outline-none w-full placeholder-zinc-600" placeholder="Search nodes..." value={tabMenu.search} onChange={(e) => setTabMenu({...tabMenu, search: e.target.value, selectedIndex: 0})} onKeyDown={handleTabMenuKeyDown} /> </div> <div className="max-h-60 overflow-y-auto p-1"> {filteredMenuNodes.map((item, idx) => ( <button key={item.type} onClick={() => { addNodeAtLocation(item.type, tabMenu.x, tabMenu.y); setTabMenu(null); }} className={`w-full text-left px-3 py-2 rounded flex items-center gap-3 transition-colors ${idx === tabMenu.selectedIndex ? 'bg-blue-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`} > <item.icon size={16} className={idx === tabMenu.selectedIndex ? 'text-white' : 'text-zinc-500'} /> <div> <div className="text-xs font-bold">{item.label}</div> <div className={`text-[10px] ${idx === tabMenu.selectedIndex ? 'text-blue-200' : 'text-zinc-500'}`}>{item.desc}</div> </div> </button> ))} {filteredMenuNodes.length === 0 && ( <div className="p-3 text-xs text-zinc-500 text-center">No matching nodes</div> )} </div> <div className="bg-zinc-950 px-2 py-1 text-[9px] text-zinc-600 border-t border-zinc-800 flex justify-between"> <span>Create: ⏎</span> <span>Navigate: ↑↓</span> </div> </div> )}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-full shadow-2xl z-40"> <div className="flex items-center gap-1 px-2 border-r border-zinc-700"> <Button variant="ghost" onClick={() => addNodeAtLocation(NodeType.TEXT_INPUT, window.innerWidth/2, window.innerHeight/2)} title="Add Note"> <Type size={18} /> </Button> <Button variant="ghost" onClick={() => addNodeAtLocation(NodeType.AI_TEXT_GEN, window.innerWidth/2, window.innerHeight/2)} title="AI Writer"> <Sparkles size={18} className="text-blue-400"/> </Button> <Button variant="ghost" onClick={() => addNodeAtLocation(NodeType.AI_IMAGE_GEN, window.innerWidth/2, window.innerHeight/2)} title="Generate Image"> <ImageIcon size={18} className="text-purple-400"/> </Button> <Button variant="ghost" onClick={() => addNodeAtLocation(NodeType.AI_IMAGE_EDIT, window.innerWidth/2, window.innerHeight/2)} title="Edit Image"> <Sparkles size={18} className="text-pink-400"/> </Button> <Button variant="ghost" onClick={() => addNodeAtLocation(NodeType.AI_VIDEO_GEN, window.innerWidth/2, window.innerHeight/2)} title="Veo Video"> <Video size={18} className="text-red-400"/> </Button> </div> <div className="flex items-center gap-1 px-2 border-r border-zinc-700"> <Button variant="ghost" onClick={() => setScale(s => s - 0.1)}><ZoomOut size={16}/></Button> <span className="text-xs text-zinc-500 font-mono w-12 text-center">{Math.round(scale * 100)}%</span> <Button variant="ghost" onClick={() => setScale(s => s + 0.1)}><ZoomIn size={16}/></Button> </div> <div className="flex items-center gap-1 pl-1"> <Button variant={showArchived ? 'primary' : 'ghost'} onClick={() => setShowArchived(!showArchived)} title={showArchived ? "Hide Archived" : "Show Archived"} > <Archive size={16} className={showArchived ? "text-white" : "text-zinc-500"}/> </Button> <Button variant="ghost" onClick={handleDebug} title="Debug Prompt Resolution" className="hover:text-yellow-400" > <Bug size={16} /> </Button> </div> </div>
        <div className="absolute top-4 right-4 flex flex-col items-end gap-1 pointer-events-none opacity-50"> <div className="text-[10px] text-zinc-500 bg-black/50 px-2 py-1 rounded">TAB for Menu</div> <div className="text-[10px] text-zinc-500 bg-black/50 px-2 py-1 rounded">F to Frame</div> <div className="text-[10px] text-zinc-500 bg-black/50 px-2 py-1 rounded">Ctrl+Z Undo</div> </div>
        {showDebugModal && debugTrace && ( <Modal title="Prompt Resolution Debugger" onClose={() => setShowDebugModal(false)} maxWidth="max-w-4xl"> <div className="flex flex-col gap-4 h-[70vh] overflow-hidden"> <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 shrink-0"> <button onClick={() => setDebugView('trace')} className={`flex-1 py-1.5 text-xs font-bold rounded ${debugView === 'trace' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Trace & Data</button> <button onClick={() => setDebugView('js')} className={`flex-1 py-1.5 text-xs font-bold rounded ${debugView === 'js' ? 'bg-zinc-800 text-yellow-400' : 'text-zinc-500 hover:text-zinc-300'}`}>JavaScript</button> <button onClick={() => setDebugView('python')} className={`flex-1 py-1.5 text-xs font-bold rounded ${debugView === 'python' ? 'bg-zinc-800 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'}`}>Python</button> <button onClick={() => setDebugView('submitted')} className={`flex-1 py-1.5 text-xs font-bold rounded ${debugView === 'submitted' ? 'bg-zinc-800 text-green-400' : 'text-zinc-500 hover:text-zinc-300'}`}>Submitted Prompt</button> </div> {debugView === 'submitted' ? ( <div className="flex-1 flex flex-col min-h-0"> <div className="bg-zinc-950 p-4 rounded border border-zinc-800 h-full flex flex-col"> <div className="text-xs font-bold text-zinc-500 mb-2">EXACT PROMPT SENT TO API</div> {debugTrace.submittedPrompt ? ( <div className="flex-1 overflow-y-auto custom-scrollbar font-mono text-sm text-green-300 whitespace-pre-wrap select-text"> {debugTrace.submittedPrompt} </div> ) : ( <div className="flex-1 flex items-center justify-center text-zinc-600 italic text-sm"> No submitted prompt recorded for this item. Try regenerating. </div> )} {debugTrace.submittedPrompt && ( <div className="mt-4 flex justify-end"> <button onClick={() => navigator.clipboard.writeText(debugTrace.submittedPrompt || '')} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded text-xs flex items-center gap-2 transition-colors" > <Copy size={14} /> Copy to Clipboard </button> </div> )} </div> </div> ) : debugView === 'trace' ? ( <div className="flex-1 flex flex-col min-h-0 gap-4"> <div className="bg-zinc-950 p-4 rounded border border-zinc-800 relative group shrink-0"> <div className="text-xs font-bold text-zinc-500 mb-1">PREVIEW RESOLVED PROMPT</div> <div className="font-mono text-sm text-green-400 whitespace-pre-wrap select-text max-h-[150px] overflow-y-auto custom-scrollbar">{debugTrace.resolved}</div> <button onClick={() => navigator.clipboard.writeText(debugTrace.resolved)} className="absolute top-2 right-2 bg-zinc-800 text-zinc-400 hover:text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity" title="Copy Prompt" > <Copy size={14} /> </button> </div> <div className="flex-1 overflow-y-auto border border-zinc-800 rounded bg-black p-4 font-mono text-xs text-zinc-300 space-y-2 select-text custom-scrollbar"> <div className="text-zinc-500 font-bold border-b border-zinc-800 pb-2 mb-2">RESOLUTION TRACE</div> {debugTrace.trace.map((line, i) => ( <div key={i} className="whitespace-pre-wrap border-l-2 border-zinc-800 pl-2">{line}</div> ))} </div> {debugTrace.referenceImages && debugTrace.referenceImages.length > 0 && ( <div className="bg-zinc-950 p-4 rounded border border-zinc-800 shrink-0"> <div className="text-xs font-bold text-zinc-500 mb-2">RESOLVED REFERENCE IMAGES ({debugTrace.referenceImages.length})</div> <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar"> {debugTrace.referenceImages.map((img, i) => ( <div key={i} className="w-24 h-24 rounded border border-zinc-700 overflow-hidden bg-black shrink-0 relative group"> <img src={img} className="w-full h-full object-cover" /> <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[9px] text-white p-1 text-center truncate">Ref #{i+1}</div> </div> ))} </div> </div> )} </div> ) : ( <div className="flex-1 overflow-hidden relative border border-zinc-800 rounded bg-black flex flex-col"> <textarea readOnly value={getCodeSnippet(debugView as 'js' | 'python')} className="flex-1 w-full bg-black p-4 font-mono text-xs text-zinc-300 resize-none focus:outline-none select-text custom-scrollbar" /> <button onClick={() => navigator.clipboard.writeText(getCodeSnippet(debugView as 'js' | 'python'))} className="absolute top-2 right-2 bg-zinc-800 text-zinc-400 hover:text-white p-2 rounded text-xs flex items-center gap-2 z-10" > <CodeIcon size={14}/> Copy Code </button> </div> )} </div> </Modal> )}
    </div>
  );
};
