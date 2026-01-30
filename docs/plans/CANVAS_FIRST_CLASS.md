# Canvases as First-Class Objects

## Overview

This document outlines the architectural changes needed to make canvases a first-class entity in Showrunner, enabling content reuse across multiple canvases and providing better organization of creative work.

---

## Current Architecture

### How It Works Now

```
ProjectAsset
  └── nodes filtered by: node.assetId === asset.id && node.department === asset.department
```

- **Nodes** are stored in a flat array in `projectStore`
- **Filtering** happens at render time based on `assetId` and `department`
- **Position** is stored directly on the node (`node.position`)
- **No explicit canvas entity** - the "canvas" is an emergent view created by filtering

### Current Data Flow
```
Click Asset → Filter nodes by assetId → Render Canvas component → Show filtered nodes
```

### Limitations
1. A node can only belong to one asset/view
2. No way to organize content within an asset into sub-canvases
3. No distinction between generated content vs. manually added content
4. Gallery view shows everything, including pasted images

---

## Proposed Architecture

### New Entity: Canvas

```typescript
interface Canvas {
  id: string;
  label: string;
  assetId: string;           // Parent asset
  isDefault: boolean;        // True for the auto-created "main" canvas
  createdAt: number;
  
  // Canvas-specific settings
  settings?: {
    backgroundColor?: string;
    gridEnabled?: boolean;
    // etc.
  };
}
```

### Node-Canvas Relationship: Placements

Instead of nodes having a single position, we introduce a **Placement** concept:

```typescript
interface NodePlacement {
  id: string;
  nodeId: string;            // Reference to the actual node
  canvasId: string;          // Which canvas this placement is on
  position: Position;        // Position on this specific canvas
  width?: number;            // Optional size override for this placement
  height?: number;
  zIndex?: number;           // Layer ordering on this canvas
}
```

### Updated Node Structure

```typescript
interface FlowNode {
  id: string;
  type: NodeType;
  department: DepartmentType;
  
  // NEW: Content origin tracking
  origin: 'generated' | 'uploaded' | 'pasted' | 'linked';
  generationType?: 'image' | 'video' | 'text';  // If origin === 'generated'
  
  // REMOVED: position, width, height (now in NodePlacement)
  // REMOVED: assetId (relationship now through Canvas → Placement)
  
  parentId?: string;         // For grouping (stays here, groups are node-level)
  data: NodeData;
}
```

### New Hierarchy

```
Department
  └── Asset
        ├── Canvas (default, hidden)
        │     └── NodePlacement → Node
        │     └── NodePlacement → Node
        ├── Canvas (user-created)
        │     └── NodePlacement → Node (same node, different position)
        │     └── NodePlacement → Node
        └── Canvas (user-created)
              └── ...
```

---

## Gallery View Changes

### Current Behavior
- Shows all nodes with `imageUrl` or `videoUrl` for the current asset

### New Behavior
- Only shows nodes where `origin === 'generated'`
- Filters out: uploaded images, pasted content, linked references
- Operates at the **Node** level, not Placement level (no duplicates)
- Add filter chips: "All Generated", "Images Only", "Videos Only"

### Implementation
```typescript
const galleryNodes = allNodes.filter(node => 
  node.origin === 'generated' && 
  (node.data.imageUrl || node.data.videoUrl)
);
```

---

## Migration Strategy

### Phase 1: Add Origin Tracking (Non-Breaking)
1. Add `origin` field to FlowNode type with default `'generated'`
2. Update node creation points to set appropriate origin:
   - AI generation → `origin: 'generated'`
   - File upload → `origin: 'uploaded'`
   - Paste → `origin: 'pasted'`
   - Reference/link → `origin: 'linked'`
3. Migrate existing nodes: assume all are `'generated'` (safe default)

### Phase 2: Add Canvas Entity (Non-Breaking)
1. Add `Canvas` type to types.ts
2. Add `canvases` array to project store
3. Auto-create default canvas for each asset on first access
4. UI: Show canvas as a tab/section within asset view

### Phase 3: Add Placements (Breaking for Position)
1. Add `NodePlacement` type
2. Add `placements` array to project store
3. Migrate existing nodes:
   ```typescript
   // For each node with position:
   const placement: NodePlacement = {
     id: generateId(),
     nodeId: node.id,
     canvasId: getDefaultCanvasForAsset(node.assetId),
     position: node.position,
     width: node.width,
     height: node.height,
   };
   ```
4. Remove position/width/height from node
5. Update Canvas component to read from placements

### Phase 4: Enable Multi-Canvas Features
1. UI for creating new canvases under an asset
2. UI for adding existing nodes to a canvas (creates new placement)
3. UI for removing node from canvas (deletes placement, not node)
4. Shared node editing (edit node → all placements update)

---

## Store Changes

### Current projectStore

```typescript
interface ProjectState {
  assets: ProjectAsset[];
  nodes: FlowNode[];
  connections: FlowConnection[];
  // ...
}
```

### New projectStore

```typescript
interface ProjectState {
  assets: ProjectAsset[];
  canvases: Canvas[];
  nodes: FlowNode[];
  placements: NodePlacement[];
  connections: FlowConnection[];  // May need to reference placements?
  // ...
}
```

---

## UI/UX Considerations

### Asset View Changes

```
┌─────────────────────────────────────────────────────────┐
│  Character: Hero                                    [+] │  ← Asset header with "Add Canvas" button
├─────────────────────────────────────────────────────────┤
│  [Main Canvas] [Expressions] [Costumes] [+ New]         │  ← Canvas tabs (Main is default)
├─────────────────────────────────────────────────────────┤
│                                                         │
│            Canvas content area                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Adding Content to Canvas

**Option A: "Add to Canvas" from Library**
- Global node library panel
- Drag node onto canvas → creates placement
- Same node can be dragged to multiple canvases

**Option B: "Link Existing" Context Menu**
- Right-click on canvas → "Add Existing Node"
- Opens picker showing all compatible nodes
- Select → creates placement at cursor position

**Option C: Copy Reference**
- Select node → Ctrl+Shift+C → "Copy as Reference"
- Go to other canvas → Ctrl+V → Creates placement (not duplicate node)

### Deleting Content

**From Canvas (Delete Placement)**
- "Remove from Canvas" - removes placement, keeps node
- Node still exists in other placements / gallery

**From Project (Delete Node)**
- "Delete Permanently" - removes node and ALL placements
- Warning: "This will remove from 3 canvases"

---

## Connections Considerations

### Current
Connections reference node IDs:
```typescript
interface FlowConnection {
  id: string;
  fromNode: string;  // Node ID
  toNode: string;    // Node ID
}
```

### Question: Should connections be canvas-specific?

**Option A: Connections are Node-Level (Recommended for now)**
- Connections exist between nodes regardless of canvas
- If both nodes appear on same canvas, connection is visible
- Simpler model, matches conceptual idea that nodes are connected

**Option B: Connections are Placement-Level**
- Connections are specific to a canvas view
- Same nodes might be connected on one canvas but not another
- More complex, but more flexible

**Recommendation:** Start with Option A. Most use cases involve logical connections between content, not visual-only connections.

---

## Open Questions

1. **Group Nodes**: Should groups be:
   - Node-level (group contains nodes, appears same on all canvases)?
   - Placement-level (group is a canvas-specific arrangement)?
   - **Recommendation:** Node-level, simpler and matches mental model

2. **Node Size**: Should size be:
   - On the Node (all placements share size)?
   - On the Placement (different sizes per canvas)?
   - **Recommendation:** On Placement, allows different presentations

3. **Default Canvas Visibility**: Should the default canvas:
   - Be hidden in UI (just "the asset view")?
   - Be shown as a tab named "Main" or similar?
   - **Recommendation:** Show as "Main" tab, more discoverable

4. **Cross-Asset Nodes**: Can a node appear in canvases of different assets?
   - Current thinking: No, nodes belong to a department context
   - Alternative: Yes, with "linked" origin type
   - **Recommendation:** Start with No, add later if needed

5. **Shotlist Integration**: How do shotlists relate?
   - Shotlists could become a special canvas type?
   - Or shotlists reference nodes via separate system?
   - **TBD:** Needs more thought

---

## File Changes Summary

| File | Changes |
|------|---------|
| `types.ts` | Add `Canvas`, `NodePlacement`, `NodeOrigin` types; update `FlowNode` |
| `stores/projectStore.ts` | Add `canvases`, `placements` arrays and actions |
| `components/Canvas.tsx` | Read from placements instead of node.position |
| `components/AssetEditorPanel.tsx` | Canvas tab UI |
| `components/GalleryView.tsx` | Filter by `origin === 'generated'` |
| `components/NodeItem.tsx` | Accept placement position as prop |
| `utils/migrationUtils.ts` | New file for data migration logic |

---

## Implementation Phases

### Phase 1: Origin Tracking (1-2 hours)
- Add `origin` field
- Update all node creation points
- Update gallery filter
- **No breaking changes**

### Phase 2: Canvas Entity (2-3 hours)
- Add Canvas type and store
- Auto-create default canvases
- Basic canvas switching UI
- **No breaking changes** (default canvas = current behavior)

### Phase 3: Placements (4-6 hours)
- Add Placement type and store
- Migration of existing data
- Update Canvas component
- Update all drag/resize handlers
- **Breaking change** - requires migration

### Phase 4: Multi-Canvas UX (3-4 hours)
- Create/rename/delete canvas UI
- Add node to canvas UI
- Remove from canvas vs delete node
- Cross-canvas node browser

### Total Estimated Effort: 10-15 hours

---

## Appendix: Type Definitions

```typescript
// types.ts additions

export type NodeOrigin = 'generated' | 'uploaded' | 'pasted' | 'linked';

export interface Canvas {
  id: string;
  assetId: string;
  label: string;
  isDefault: boolean;
  createdAt: number;
  settings?: CanvasSettings;
}

export interface CanvasSettings {
  backgroundColor?: string;
  gridEnabled?: boolean;
  snapToGrid?: boolean;
  snapToObjects?: boolean;
}

export interface NodePlacement {
  id: string;
  nodeId: string;
  canvasId: string;
  position: Position;
  width?: number;
  height?: number;
  zIndex?: number;
}

// Updated FlowNode (Phase 3)
export interface FlowNode {
  id: string;
  type: NodeType;
  department: DepartmentType;
  origin: NodeOrigin;
  generationType?: 'image' | 'video' | 'text';
  parentId?: string;
  data: NodeData;
  // REMOVED: position, width, height, assetId
}
```

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| TBD | Connections are node-level | Simpler model, logical connections |
| TBD | Groups are node-level | Matches mental model of grouping content |
| TBD | Size stored on Placement | Allows different presentations per canvas |
| TBD | No cross-asset nodes initially | Keeps scope manageable |
