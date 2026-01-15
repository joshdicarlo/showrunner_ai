# Showrunner AI - Technical Debt Refactoring Plan

> **Document Version:** 1.0  
> **Created:** January 14, 2026  
> **Status:** In Progress

## Overview

This document outlines the 5-phase refactoring plan to address technical debt in the Showrunner AI codebase. The goal is to improve maintainability, reduce code duplication, and establish a cleaner architecture for future development.

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Phase 1: Unify Discovery](#phase-1-unify-discovery) ✅ Complete
3. [Phase 2: Centralize Generation](#phase-2-centralize-generation) ✅ Complete
4. [Phase 3: Service Layer Separation](#phase-3-service-layer-separation) ✅ Complete
5. [Phase 4: Component Decomposition](#phase-4-component-decomposition)
6. [Phase 5: State Management](#phase-5-state-management)
7. [Implementation Notes](#implementation-notes)

---

## Current State Analysis

### Key Problem Areas Identified

| Issue | Location | Impact |
|-------|----------|--------|
| Duplicate job execution paths | `NodeItem.tsx` + `RenderQueue` | Double API calls, wasted credits |
| Fragmented discovery functions | `geminiService.ts` | 4 nearly identical functions |
| Massive component file | `App.tsx` (2200+ lines) | Difficult to maintain |
| No backend/frontend separation | All files | Security risks, tight coupling |
| Duplicate prompt resolution | Multiple locations | Inconsistent behavior |
| Inconsistent model routing | `NodeItem`, `App.tsx`, queue | Luma vs Gemini confusion |

---

## Phase 1: Unify Discovery

**Status:** ✅ Complete

### Objective
Consolidate the 4 fragmented script extraction functions into a single, unified discovery service with streaming thinking support.

### Before (Problem)
```
geminiService.ts
├── extractCharactersFromScript()    // ~80 lines
├── extractLocationsFromScript()     // ~60 lines
├── extractStoryElementsFromScript() // ~120 lines
└── extractOneShotBreakdown()        // ~150 lines
```

Each function had:
- Duplicate API initialization
- Similar schema definitions
- Redundant error handling
- No streaming thinking (except oneShot)

### After (Solution)

**New File:** `services/discoveryService.ts`

```typescript
// Core function with all options
discoverFromScript(scriptText, options: DiscoveryOptions): Promise<DiscoveryResult>

// Convenience wrappers
discoverCharacters(scriptText, onThinking?): Promise<CharacterResult[]>
discoverLocations(scriptText, onThinking?): Promise<LocationResult[]>
discoverScenes(scriptText, includeShots?, knownChars?, onThinking?): Promise<SceneResult[]>
discoverAll(scriptText, options?): Promise<DiscoveryResult>
```

### Key Features
- **Dynamic schema building** - Only requests what's needed
- **Streaming thinking** - Available for all discovery modes
- **Type-safe results** - Proper TypeScript interfaces
- **Single API initialization** - Reduces overhead

### Files Modified
- `services/discoveryService.ts` - New file (428 lines)
- `App.tsx` - Updated imports and function calls
- `geminiService.ts` - Legacy functions remain for backward compatibility (can be deprecated)

### Migration Notes
- Old functions in `geminiService.ts` can be marked as `@deprecated`
- All new code should use `discoveryService.ts`
- One Shot Discovery now uses `discoverAll()` with `onThinking` callback

### UI Unification

The Find Characters/Locations/Story modal was updated to fully match the One Shot Discovery UI:

**Before:**
- Simple "Analyzing..." button text during discovery
- No visibility into AI reasoning process
- Basic checkbox + text list for detected items
- Only "Import Selected" functionality (no generation)

**After:**
- Animated spinner with descriptive loading message
- Live streaming "AI Reasoning" panel showing model's thought process
- Full OneShotModal-style row rendering with:
  - Type-specific icons (User/MapPin/Layout/Clapperboard)
  - Model selector dropdown per item
  - Auto-Generate toggle (Manual/Auto-Gen)
  - Auto-Approve toggle (Review/Approved)
  - Bulk actions header (All/None/Auto-Gen All)
- "Import & Execute" button that creates assets AND queues generation tasks

**Changes:**
- Updated `DetectedItem` interface to match `OneShotItem` (added `id`, `autoGenerate`, `autoApprove`, `model`)
- Updated `handleRunAnalysis()` to:
  - Pass `onThinking` callback to discovery functions
  - Assign unique IDs and default generation settings to items
- Replaced simple item list UI with OneShotModal-style row components
- Updated `handleApproveAnalysis()` to:
  - Create assets for selected items
  - Queue `RenderTask` for items with `autoGenerate: true`
  - Use `autoApprove` and `model` settings from each item
- Added missing icon imports (`User`, `MapPin`, `Clapperboard`, `CheckCircle`, `Circle`, `ChevronDown`, `Play`)
- Added `IMAGE_MODELS_OPTIONS` import for model selector

---

## Phase 2: Centralize Generation

**Status:** ✅ Complete

### Objective
Route all image and video generation through a central handler that properly integrates with the RenderQueue, eliminating the dual execution paths.

### Before (Problem)

```
Generation triggered from:
├── NodeItem.tsx
│   ├── handleImageGen()      → Direct API call (bypasses queue)
│   ├── handleVideoGen()      → Direct API call (bypasses queue)
│   └── handleTextGen()       → Direct API call
│
├── App.tsx (via RenderQueue)
│   └── handleTaskExecution() → Queue-managed API call
│
└── Result: Same generation could fire twice!
```

### After (Solution)

**New File:** `services/generationService.ts`

```typescript
// Unified image generation with auto-routing
generateImage(options: ImageGenerationOptions): Promise<GenerationResult>

// Unified video generation with auto-routing  
generateVideo(options: VideoGenerationOptions): Promise<GenerationResult>

// Image editing
editImage(imageUrl, prompt, options?): Promise<GenerationResult>
```

**New Interface:** `GenerationRequest` (in NodeItem.tsx)

```typescript
interface GenerationRequest {
    nodeId: string;
    type: 'image' | 'video' | 'text';
    prompt: string;
    config?: {
        model?: string;
        aspectRatio?: string;
        styleId?: string;
        duration?: string;
        withAudio?: boolean;
        startImage?: string;
        endImage?: string;
        referenceImages?: string[];
    };
}
```

### Architecture Flow

```
User clicks "Generate" in NodeItem
         ↓
NodeItem.handleImageGen() / handleVideoGen()
         ↓
onRequestGeneration(request)  ← New callback prop
         ↓
App.handleNodeGenerationRequest()
         ↓
queueService.add(task)
         ↓
RenderQueue processes task
         ↓
handleTaskExecution() → generationService
         ↓
onTaskComplete() updates node
```

### Key Features
- **Single execution path** - All generation goes through queue
- **Auto model routing** - Detects Luma vs Gemini from model name
- **Prompt resolution** - Handles @ references internally
- **Retry logic** - Exponential backoff for rate limits
- **Backward compatible** - Falls back to direct generation if callback not provided

### Files Modified
- `services/generationService.ts` - New file (~300 lines)
- `components/NodeItem.tsx` - Added `GenerationRequest` interface and `onRequestGeneration` prop
- `components/Canvas.tsx` - Pass through `onRequestGeneration` prop
- `App.tsx` - Added `handleNodeGenerationRequest()` handler

---

## Phase 3: Service Layer Separation

**Status:** ✅ Complete

### Objective
Establish a clear separation between frontend presentation and backend API logic, preparing for potential future backend extraction.

### Implemented Structure

```
services/
├── api/                          # Low-level API clients
│   ├── index.ts                  # API layer exports
│   ├── geminiClient.ts           # Gemini API wrapper (~370 lines)
│   ├── lumaClient.ts             # Luma API wrapper (~320 lines)
│   └── driveClient.ts            # Google Drive wrapper (~310 lines)
│
├── adapters/                     # React hooks
│   ├── index.ts                  # Adapter exports
│   ├── useDiscovery.ts           # Discovery hook (~190 lines)
│   ├── useGeneration.ts          # Generation hook (~230 lines)
│   └── useDrive.ts               # Drive operations hook (~210 lines)
│
├── discoveryService.ts           # Script analysis (refactored)
├── generationService.ts          # Media generation (refactored)
├── index.ts                      # Main service exports
└── ...                           # Other existing services
```

### Key Changes

1. **Extract API clients** - Move raw API calls to dedicated client files
2. **Create domain services** - Business logic independent of React
3. **Build React adapters** - Hooks that connect domain to components

### Benefits
- Testable business logic (no React dependencies)
- Swappable API implementations
- Clear dependency direction
- Easier to extract to actual backend later

### API Client Layer (`services/api/`)

**geminiClient.ts** - Singleton class wrapper around Google GenAI SDK:
- `generateText()` - Text generation with schema support
- `generateTextStream()` - Streaming text with thinking/reasoning callbacks
- `generateImages()` - Image generation (Imagen + Gemini native)
- `editImage()` - Image editing
- `generateVideo()` - Video generation (Veo)
- Built-in retry with exponential backoff for rate limits

**lumaClient.ts** - Wrapper for Luma Labs Dream Machine API:
- `generateImage()` - Luma Photon image generation
- `generateVideo()` - Luma Ray video generation with progress callbacks
- `getGenerationStatus()` - Poll generation status
- CORS proxy handling built-in

**driveClient.ts** - Google Drive and Sheets API wrapper:
- `initialize()` - GAPI initialization
- `signIn()` - OAuth flow with mock fallback
- `findOrCreateFolder()` - Folder management
- `uploadFile()` - File uploads
- `createSpreadsheet()` / `updateSpreadsheet()` - Sheets operations
- Full mock mode support for offline development

### React Adapter Hooks (`services/adapters/`)

**useDiscovery** - Script analysis state management:
```typescript
const { 
    isLoading, thinking, progressPercent, result, error,
    runFullDiscovery, runCharacterDiscovery, runLocationDiscovery,
    runSceneDiscovery, runCustomDiscovery, reset
} = useDiscovery();
```

**useGeneration** - Image/video generation state:
```typescript
const {
    currentTask, isGenerating, taskHistory,
    generateImageAsync, generateVideoAsync, editImageAsync,
    cancel, clearHistory
} = useGeneration();
```

**useDrive** - Google Drive operations:
```typescript
const {
    isAuthenticated, isMockMode, isInitializing, isOperating, error,
    initialize, signIn, enableMockMode, createProjectStructure,
    uploadFile, syncAssetFolder, updateProjectDB
} = useDrive();
```

### Migration Notes

**Completed:**
- Created `services/api/` with geminiClient, lumaClient, driveClient
- Refactored `discoveryService.ts` to use `getGeminiClient()`
- Refactored `generationService.ts` to use both `getGeminiClient()` and `getLumaClient()`
- Created React hooks in `services/adapters/`
- Created main `services/index.ts` for unified exports

**Usage Pattern:**
```typescript
// For React components (preferred)
import { useDiscovery, useGeneration, useDrive } from './services/adapters';

// For non-React code or direct service access  
import { discoverFromScript } from './services/discoveryService';
import { generateImage } from './services/generationService';

// For low-level client access (rare)
import { getGeminiClient, getLumaClient } from './services/api';
```

**Backward Compatibility:**
- Existing imports to `discoveryService` and `generationService` continue to work
- Old `googleDriveService` still works but components can migrate to `useDrive` hook
- Legacy `lumaService` functions still work but `generationService` now uses `getLumaClient()`

### Files Created
- `services/api/index.ts` - API layer exports
- `services/api/geminiClient.ts` - Gemini SDK wrapper (~370 lines)
- `services/api/lumaClient.ts` - Luma API wrapper (~320 lines)
- `services/api/driveClient.ts` - Google Drive wrapper (~310 lines)
- `services/adapters/index.ts` - Adapter exports
- `services/adapters/useDiscovery.ts` - Discovery hook (~190 lines)
- `services/adapters/useGeneration.ts` - Generation hook (~230 lines)
- `services/adapters/useDrive.ts` - Drive hook (~210 lines)
- `services/index.ts` - Main service exports with architecture docs

### Files Modified
- `services/discoveryService.ts` - Now uses `getGeminiClient()` instead of direct SDK
- `services/generationService.ts` - Now uses `getGeminiClient()` and `getLumaClient()`

---

## Phase 4: Component Decomposition

**Status:** 🔲 Not Started

### Objective
Break down `App.tsx` (2200+ lines) into logical, focused components.

### Proposed Component Structure

```
components/
├── App.tsx                       # Slim orchestrator (~300 lines)
│
├── providers/                    # Context providers
│   ├── ProjectProvider.tsx       # Project state context
│   ├── QueueProvider.tsx         # Render queue context
│   └── SettingsProvider.tsx      # App settings context
│
├── features/                     # Feature modules
│   ├── project/
│   │   ├── ProjectDashboard.tsx  # Project list view
│   │   ├── ProjectCreate.tsx     # Create project modal
│   │   └── ProjectSeed.tsx       # AI seed generation
│   │
│   ├── discovery/
│   │   ├── AnalysisModal.tsx     # Character/Location/Story analysis
│   │   └── OneShotFlow.tsx       # One Shot Discovery flow
│   │
│   ├── generation/
│   │   ├── RenderQueuePanel.tsx  # Queue UI (exists)
│   │   └── BatchGenerator.tsx    # Batch generation logic
│   │
│   └── workspace/
│       ├── WorkspaceHeader.tsx   # Top toolbar
│       ├── WorkspaceTabs.tsx     # Department tabs
│       └── WorkspaceContent.tsx  # Canvas/Gallery/Timeline
│
└── shared/                       # Shared components
    ├── UI.tsx                    # Primitives (exists)
    ├── Modal.tsx                 # Generic modal
    └── ContextMenu.tsx           # Right-click menus
```

### Extraction Priority

1. **High Priority**
   - Project creation flow (modals, seed generation)
   - Analysis/Discovery modals
   - Workspace header/toolbar

2. **Medium Priority**
   - Settings modal
   - Asset editor panel
   - Department panel

3. **Lower Priority**
   - Provider abstractions
   - Shared component library

### State Extraction

Current inline state in App.tsx to extract:

| State Group | New Location |
|-------------|--------------|
| `projects`, `currentProjectId` | `ProjectProvider` |
| `renderQueue`, `queuePaused` | `QueueProvider` |
| Modal visibility states | Local to each modal |
| `analysisThinking`, `detectedItems` | `DiscoveryProvider` |

---

## Phase 5: State Management

**Status:** 🔲 Not Started

### Objective
Implement proper state management to reduce prop drilling and improve predictability.

### Recommended Approach: Zustand

Given the app's complexity and the need for simplicity, **Zustand** is recommended over Redux:

```typescript
// stores/projectStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProjectState {
    projects: Project[];
    currentProjectId: string | null;
    
    // Actions
    createProject: (project: Project) => void;
    updateProject: (id: string, updates: Partial<Project>) => void;
    deleteProject: (id: string) => void;
    setCurrentProject: (id: string) => void;
    
    // Computed
    activeProject: () => Project | undefined;
}

export const useProjectStore = create<ProjectState>()(
    persist(
        (set, get) => ({
            projects: [],
            currentProjectId: null,
            
            createProject: (project) => set(state => ({
                projects: [...state.projects, project]
            })),
            
            // ... other actions
            
            activeProject: () => {
                const { projects, currentProjectId } = get();
                return projects.find(p => p.id === currentProjectId);
            }
        }),
        { name: 'showrunner-projects' }
    )
);
```

### Store Structure

```
stores/
├── projectStore.ts       # Projects, assets, nodes
├── queueStore.ts         # Render queue state
├── uiStore.ts            # UI state (modals, views, selections)
└── settingsStore.ts      # App and project settings
```

### Benefits
- No prop drilling through 5+ component levels
- Predictable state updates
- Easy persistence with `zustand/persist`
- DevTools integration
- Simpler than Redux, more powerful than Context

### Migration Strategy

1. Install Zustand: `npm install zustand`
2. Create `stores/projectStore.ts` first
3. Migrate project-related state from App.tsx
4. Update components to use `useProjectStore()`
5. Repeat for queue, UI, settings stores
6. Remove old useState and props

---

## Implementation Notes

### Commit Strategy

Each phase should be completed and committed before starting the next:

```
git commit -m "refactor(phase1): unify discovery service"
git commit -m "refactor(phase2): centralize generation through queue"
git commit -m "refactor(phase3): extract service layer"
git commit -m "refactor(phase4): decompose App.tsx into features"
git commit -m "refactor(phase5): implement Zustand state management"
```

### Testing Checkpoints

After each phase, verify:
- [ ] App compiles without errors
- [ ] Dev server starts successfully
- [ ] Core flows still work:
  - [ ] Project creation
  - [ ] Script writing
  - [ ] One Shot Discovery
  - [ ] Image generation (single + batch)
  - [ ] Video generation
  - [ ] Render queue processing

### Backward Compatibility

- Keep old function signatures working during migration
- Mark deprecated functions with JSDoc `@deprecated` tags
- Only remove old code after confirming new code works

### Files to Eventually Deprecate

After all phases complete:
- `geminiService.ts` - Old extraction functions (replaced by `discoveryService.ts`)
- Direct API calls in `NodeItem.tsx` - (replaced by `onRequestGeneration` callback)

---

## Progress Tracker

| Phase | Status | Start Date | Complete Date |
|-------|--------|------------|---------------|
| Phase 1: Unify Discovery | ✅ Complete | Jan 14, 2026 | Jan 14, 2026 |
| Phase 2: Centralize Generation | ✅ Complete | Jan 14, 2026 | Jan 14, 2026 |
| Phase 3: Service Layer | ✅ Complete | Jan 15, 2026 | Jan 15, 2026 |
| Phase 4: Component Decomposition | 🔲 Not Started | - | - |
| Phase 5: State Management | 🔲 Not Started | - | - |

---

## References

- [discoveryService.ts](../services/discoveryService.ts) - Unified discovery implementation
- [generationService.ts](../services/generationService.ts) - Unified generation implementation
- [services/api/](../services/api/) - Low-level API clients
- [services/adapters/](../services/adapters/) - React hooks for services
- [NodeItem.tsx](../components/NodeItem.tsx) - GenerationRequest interface
- [App.tsx](../App.tsx) - Main application file

---

*This document should be updated as each phase progresses.*
