# Graph Improvements Plan

## Overview
This document outlines a set of interactivity improvements for the node-based canvas system, focusing on resizing, view mode enhancements, and snapping functionality.

---

## Current State Analysis

### Canvas Architecture
- **Canvas.tsx** (~986 lines) handles all pan/zoom, drag logic, view modes, and node rendering
- **NodeItem.tsx** (~1419 lines) handles individual node rendering, styling, and interactions
- Nodes have `width` and `height` optional properties in `FlowNode` type
- Two view modes exist: `'normal'` and `'images-only'`
- Drag is handled via `interactionMode: 'draggingNode'` and mouse movement deltas
- No resize functionality currently exists
- No snapping functionality currently exists

### View Modes
- **Normal mode**: Full node UI with headers, controls, borders
- **Images-only mode**: Only renders nodes with `imageUrl` or `videoUrl`, showing media with hover tooltips and status badges
- Writer nodes (`TEXT_INPUT`, `AI_TEXT_GEN`) are completely hidden in images-only mode
- Group nodes are completely hidden in images-only mode

---

## Feature 1: Node Resize

### 1.1 Normal View - Drag from Lower Right Corner

**Goal**: Add a resize handle to the lower-right corner of all nodes in normal view.

**Implementation**:

1. **Add resize interaction mode** in Canvas.tsx:
   ```typescript
   type InteractionMode = 'none' | 'panning' | 'selecting' | 'draggingNode' | 'resizingNode';
   ```

2. **Add resize state** in Canvas.tsx:
   ```typescript
   const [resizingNodeId, setResizingNodeId] = useState<string | null>(null);
   const [resizeStartDimensions, setResizeStartDimensions] = useState<{w: number, h: number} | null>(null);
   ```

3. **Add resize handle UI** in NodeItem.tsx:
   - Position: absolute, bottom-right corner (bottom-0 right-0)
   - Size: ~12x12px hitbox
   - Visual: diagonal lines or corner bracket icon
   - Cursor: `cursor-nwse-resize`
   - Only visible on hover or when selected

4. **Add resize callbacks**:
   ```typescript
   interface NodeItemProps {
     // ... existing props
     onResizeStart?: (e: React.MouseEvent, id: string) => void;
   }
   ```

5. **Handle resize mouse movement** in Canvas.tsx `handleMouseMove`:
   - Calculate delta from drag start
   - Apply minimum dimensions (e.g., 150w x 100h for most nodes, larger minimums for groups)
   - Update node `width` and `height` via `setNodes`
   - Consider aspect ratio constraints for image/video nodes

6. **Persist dimensions**: Already supported via `node.width` and `node.height` in FlowNode type.

**Files to modify**:
- `components/Canvas.tsx` - Add resize interaction mode, mouse handlers
- `components/NodeItem.tsx` - Add resize handle UI element
- `types.ts` - No changes needed (width/height already exist)

---

### 1.2 Images-Only View - Scale from Any Corner

**Goal**: Allow scaling images/videos from any corner in image-only view, maintaining aspect ratio.

**Implementation**:

1. **Add corner handles** for each media item in images-only view (Canvas.tsx):
   - Four corner handles: top-left, top-right, bottom-left, bottom-right
   - Show on hover or selection
   - Cursor changes: `cursor-nw-resize`, `cursor-ne-resize`, `cursor-sw-resize`, `cursor-se-resize`

2. **Track which corner is being dragged**:
   ```typescript
   type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se' | null;
   const [resizeCorner, setResizeCorner] = useState<ResizeCorner>(null);
   ```

3. **Scale logic**:
   - Calculate scale factor based on mouse delta
   - Maintain aspect ratio (use the larger delta axis as reference)
   - Adjust position based on which corner is being dragged:
     - `se` (bottom-right): Position unchanged, size increases
     - `sw` (bottom-left): Position.x adjusts, width changes inversely
     - `ne` (top-right): Position.y adjusts, height changes inversely
     - `nw` (top-left): Both position values adjust

4. **Minimum size constraints**: Enforce minimum 50x50px or similar.

**Files to modify**:
- `components/Canvas.tsx` - Add corner handles in images-only view render section

---

## Feature 2: Writer Nodes in Image-Only Mode

### 2.1 Show Writer Nodes Without Chrome

**Goal**: Display `TEXT_INPUT` and `AI_TEXT_GEN` nodes in image-only mode, appearing as clean text blocks without borders or node UI.

**Implementation**:

1. **Modify images-only filter** in Canvas.tsx:
   - Current filter: `n.data.imageUrl || n.data.videoUrl || n.data.status === 'generating' || n.data.status === 'pending'`
   - New filter: Include `n.type === NodeType.TEXT_INPUT || n.type === NodeType.AI_TEXT_GEN`

2. **Render writer nodes differently** in images-only mode:
   ```tsx
   {(node.type === NodeType.TEXT_INPUT || node.type === NodeType.AI_TEXT_GEN) ? (
     <div 
       className="absolute bg-transparent p-4"
       style={{ left: node.position.x, top: node.position.y, width: node.width || 300, height: node.height || 'auto' }}
     >
       <div className="text-zinc-200 text-sm whitespace-pre-wrap select-text prose prose-invert prose-sm">
         <ReactMarkdown>{node.data.text || ''}</ReactMarkdown>
       </div>
     </div>
   ) : (
     // existing media rendering
   )}
   ```

3. **Interaction support**:
   - Click to select
   - Drag to move (position preserved in node.position)
   - Corner resize for scaling (same as media nodes)

4. **Minimal hover state**: Subtle highlight or outline on hover, not full node UI

**Files to modify**:
- `components/Canvas.tsx` - Update filter and add writer node render path

---

## Feature 3: Group Nodes as Frames in Image-Only View

### 3.1 Show Groups as Basic Frames

**Goal**: Display group nodes as simple rectangular frames in image-only view.

**Implementation**:

1. **Include groups in images-only filter**:
   - Add: `n.type === NodeType.GROUP`

2. **Render group as frame**:
   ```tsx
   {node.type === NodeType.GROUP && (
     <div 
       className="absolute border-2 border-dashed border-zinc-600 rounded-lg pointer-events-none"
       style={{ 
         left: node.position.x, 
         top: node.position.y, 
         width: node.width || 400, 
         height: node.height || 400 
       }}
     >
       {/* Optional: Label at top */}
       {node.data.label && (
         <div className="absolute -top-6 left-2 text-xs text-zinc-500 bg-black/50 px-2 py-0.5 rounded">
           {node.data.label}
         </div>
       )}
     </div>
   )}
   ```

3. **Interaction**: 
   - Groups should be selectable and movable like other nodes
   - Move group = move all children (existing behavior should carry over)
   - Resize via corner handles

**Files to modify**:
- `components/Canvas.tsx` - Update filter and add group frame render

---

## Feature 4: Preserve Move/Scale in Image-Only View

### 4.1 Ensure Drag Works

**Current state**: Images-only view has `onClick` handler but no drag support (only uses `handleNodeSelect`).

**Implementation**:

1. **Add `onMouseDown` handler** to each media item in images-only view:
   ```tsx
   onMouseDown={(e) => {
     e.stopPropagation();
     // Check if on resize handle first
     if (!isResizeHandle(e)) {
       onNodeDragStart(e, node.id);
     }
   }}
   ```

2. **Ensure drag logic in `handleMouseMove`** applies to all view modes (already should work if `draggingNodeId` is set properly).

3. **Test that position updates persist** when switching between view modes.

**Files to modify**:
- `components/Canvas.tsx` - Add mouse handlers to images-only view items

---

## Feature 5: Snapping Functionality

### 5.1 Grid Snapping

**Goal**: Option to snap nodes to a grid while dragging.

**Implementation**:

1. **Add settings state**:
   ```typescript
   const [snapToGrid, setSnapToGrid] = useState(false);
   const [gridSize, setGridSize] = useState(20); // pixels
   ```

2. **Snap function**:
   ```typescript
   const snapToGridValue = (value: number, size: number) => 
     Math.round(value / size) * size;
   ```

3. **Apply in drag handler** when `snapToGrid` is enabled:
   ```typescript
   if (snapToGrid) {
     newX = snapToGridValue(newX, gridSize);
     newY = snapToGridValue(newY, gridSize);
   }
   ```

4. **UI Toggle**: Add grid snap button to toolbar
   - Icon: `Grid3X3` from lucide-react (already imported)
   - Visual indicator when active

5. **Visual grid lines**: 
   - Show grid overlay when snap is enabled
   - Current dot pattern could be enhanced to show lines

---

### 5.2 Object Snapping with Alignment Lines

**Goal**: Snap nodes to align with nearby nodes, showing red alignment lines as visual guides.

**Implementation**:

1. **Add settings state**:
   ```typescript
   const [snapToObjects, setSnapToObjects] = useState(true);
   const [snapThreshold, setSnapThreshold] = useState(10); // pixels
   const [alignmentLines, setAlignmentLines] = useState<AlignmentLine[]>([]);
   
   interface AlignmentLine {
     type: 'horizontal' | 'vertical';
     position: number; // x for vertical, y for horizontal
     start: number;    // start coordinate on perpendicular axis
     end: number;      // end coordinate on perpendicular axis
   }
   ```

2. **Calculate snap targets** during drag:
   ```typescript
   const calculateSnapTargets = (movingNodeIds: Set<string>) => {
     const otherNodes = visibleNodes.filter(n => !movingNodeIds.has(n.id));
     const targets: { x: number[], y: number[] } = { x: [], y: [] };
     
     otherNodes.forEach(node => {
       const x = node.position.x;
       const y = node.position.y;
       const w = node.width || 300;
       const h = node.height || 400;
       
       // Left, center, right edges
       targets.x.push(x, x + w / 2, x + w);
       // Top, center, bottom edges
       targets.y.push(y, y + h / 2, y + h);
     });
     
     return targets;
   };
   ```

3. **Find snap positions** during drag:
   ```typescript
   const findSnapPosition = (
     nodeX: number, nodeY: number, nodeW: number, nodeH: number,
     targets: { x: number[], y: number[] }
   ) => {
     const nodeEdgesX = [nodeX, nodeX + nodeW / 2, nodeX + nodeW];
     const nodeEdgesY = [nodeY, nodeY + nodeH / 2, nodeY + nodeH];
     
     let snapX: number | null = null;
     let snapY: number | null = null;
     const lines: AlignmentLine[] = [];
     
     // Check X alignment
     for (const edgeX of nodeEdgesX) {
       for (const targetX of targets.x) {
         if (Math.abs(edgeX - targetX) < snapThreshold) {
           snapX = nodeX + (targetX - edgeX);
           lines.push({ type: 'vertical', position: targetX, start: 0, end: canvasHeight });
           break;
         }
       }
       if (snapX !== null) break;
     }
     
     // Check Y alignment (similar logic)
     // ...
     
     return { snapX, snapY, lines };
   };
   ```

4. **Render alignment lines**:
   ```tsx
   {alignmentLines.map((line, i) => (
     <div
       key={i}
       className="absolute pointer-events-none bg-red-500/50"
       style={line.type === 'vertical' 
         ? { left: line.position * scale + offset.x, top: 0, width: 1, height: '100%' }
         : { top: line.position * scale + offset.y, left: 0, height: 1, width: '100%' }
       }
     />
   ))}
   ```

5. **Clear alignment lines** on mouse up.

6. **UI Toggle**: Add object snap button to toolbar
   - Icon: `Magnet` or similar from lucide-react
   - Visual indicator when active

---

## File Changes Summary

| File | Changes |
|------|---------|
| `components/Canvas.tsx` | Resize handlers, snap logic, alignment lines, images-only view updates, toolbar toggles |
| `components/NodeItem.tsx` | Resize handle UI in lower-right corner, resize callbacks |
| `types.ts` | No changes needed |
| `stores/settingsStore.ts` | Optional: persist snap preferences |

---

## Implementation Order

1. **Phase 1: Resize in Normal View** (Feature 1.1)
   - Add resize handle to NodeItem
   - Add resize mode to Canvas
   - Test with different node types

2. **Phase 2: Images-Only View Enhancements** (Features 2, 3, 4)
   - Add writer nodes to images-only view
   - Add group frames to images-only view
   - Ensure drag/move works for all items
   
3. **Phase 3: Corner Scaling in Images-Only View** (Feature 1.2)
   - Add corner handles
   - Implement aspect-ratio-preserving scale

4. **Phase 4: Grid Snapping** (Feature 5.1)
   - Add toggle and state
   - Implement snap logic
   - Add visual grid enhancement

5. **Phase 5: Object Snapping** (Feature 5.2)
   - Add snap target calculation
   - Implement alignment detection
   - Render alignment lines
   - Add toggle

---

## Testing Checklist

- [ ] Resize works on all node types in normal view
- [ ] Resize respects minimum dimensions
- [ ] Writer nodes visible in images-only mode (no chrome)
- [ ] Group nodes appear as frames in images-only mode
- [ ] Drag works in images-only mode for all items
- [ ] Corner scaling works in images-only mode
- [ ] Aspect ratio preserved when scaling media
- [ ] Grid snap works when enabled
- [ ] Grid visual updates appropriately
- [ ] Object snap detects edges and centers
- [ ] Alignment lines appear/disappear correctly
- [ ] Snap tolerance feels right (~10px default)
- [ ] Performance acceptable with many nodes
- [ ] Undo works for resize operations
- [ ] Snap settings persist (if added to settingsStore)

---

## Open Questions

1. **Resize undo**: Should resize be added to history like drag? (Recommend: Yes)
2. **Snap settings UI**: Settings modal or just toolbar toggles? (Recommend: Toolbar toggles for MVP, settings modal for fine-tuning later)
3. **Grid size customization**: Fixed 20px or user-configurable? (Recommend: Fixed for MVP)
4. **Object snap edge types**: Snap to edges only, or also to centers? (Recommend: Both, but prioritize edges)
5. **Alignment line color**: Red as specified, or theme-aware? (Recommend: Light red as specified, `red-400/50`)

---

## Estimated Effort

| Phase | Estimated Time |
|-------|----------------|
| Phase 1: Resize | 2-3 hours |
| Phase 2: Images-Only Enhancements | 1-2 hours |
| Phase 3: Corner Scaling | 1-2 hours |
| Phase 4: Grid Snapping | 1 hour |
| Phase 5: Object Snapping | 2-3 hours |
| **Total** | **7-11 hours** |
