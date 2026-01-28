# Showrunner AI - Copilot Instructions

## Project Overview
Showrunner AI is a node-based creative workflow app for film/TV pre-production. It uses Gemini and Luma AI for generating images, videos, and text. Built with React 19 + TypeScript + Vite, uses Zustand for state.

## Architecture

### Service Layer Pattern (3-tier)
```
services/api/          → Low-level API clients (geminiClient.ts, lumaClient.ts)
services/              → Domain services (generationService.ts, discoveryService.ts)
services/adapters/     → React hooks wrapping services (useGeneration.ts, useDrive.ts)
```
- **API clients** handle SDK initialization, retries, raw calls
- **Domain services** handle business logic, prompt resolution, provider routing
- **Adapters** provide React state management for UI components

### State Management
- `stores/projectStore.ts` - Zustand store with persist + immer middleware for projects/assets/nodes
- `stores/queueStore.ts` - Render queue state
- `stores/settingsStore.ts` - User preferences
- App.tsx still contains significant UI state (legacy, see REFACTOR_PLAN.md Phase 5)

### Key Data Flow
1. User prompts use `@CharacterName` references → resolved by `utils/promptUtils.ts`
2. `@style:key` tags inject visual style definitions from project settings
3. All generation routes through `generationService.ts` → routes to Gemini or Luma based on model
4. Render queue manages concurrent jobs with rate limiting

## Development

```bash
npm install && npm run dev   # Requires GEMINI_API_KEY in .env.local
```

## Conventions

### Prompt Reference System
- `@CharacterName` → injects character's visual description from Casting department
- `@LocationName` → injects set description from Set Design department  
- `@style:cinematic` → appends style prompt from `ProjectSettings.styles`
- Shot prompts follow a structured template (Visual/Set/Lighting/Camera/Style + video fields)

### Model Routing
Check model string to determine provider:
```typescript
const isLumaModel = (model: string) => model.toLowerCase().includes('luma');
```
Models defined in `constants.ts`: `MODELS`, `IMAGE_MODELS_OPTIONS`, `VIDEO_MODELS_OPTIONS`

### Asset Hierarchy
- **Departments** organize assets: Writers Room → Casting → Set Design → Story → Production → Editorial
- Assets can have `parentId` for nesting (e.g., Shots under Sequences)
- Each asset belongs to one department (`DepartmentType` enum)

### Node Types
`NodeType` enum defines canvas elements: `TEXT_INPUT`, `AI_TEXT_GEN`, `IMAGE_UPLOAD`, `AI_IMAGE_GEN`, `AI_VIDEO_GEN`, `GROUP`

### API Retry Pattern
All API calls use `retryWithBackoff()` for 429/RESOURCE_EXHAUSTED errors. Each GenAI provider (Gemini, Luma, future: Kling) has unique rate limits and polling intervals—check the respective client in `services/api/`.

### Discovery Service
Use `discoveryService.ts` for script analysis (extracts characters, locations, scenes). Supports streaming thinking via `onThinkingUpdate` callback. Currently operates on script nodes; will expand to support uploaded PDFs and other documents.

### Storage Layer
The storage system (`services/storage/`) is designed for provider abstraction:
- `StorageManager.ts` - Coordinator that switches between providers
- `GoogleDriveStorage.ts` - Current implementation (temporary, suits lower-tier users)
- Future: S3, Azure Blob, or similar for production-grade storage
- When extending, implement `IStorageProvider` interface from `types.ts`

## File Patterns

| Pattern | Purpose |
|---------|---------|
| `components/*.tsx` | UI components, some are large (refactor targets) |
| `services/api/*.ts` | SDK wrappers, singleton clients |
| `services/adapters/use*.ts` | React hooks for services |
| `stores/*Store.ts` | Zustand stores with TypeScript |
| `types.ts` | All shared interfaces and enums |
| `constants.ts` | Model configs, department definitions, default settings |

## Known Tech Debt
See [docs/plans/REFACTOR_PLAN.md](docs/plans/REFACTOR_PLAN.md) - Phase 5 (State Management) is pending. App.tsx is 3400+ lines and needs decomposition.

## Planned Features
When implementing these, follow existing patterns:

- **CLI/Console interface** - Command-line tool for headless workflow automation
- **Python API** - Python SDK for programmatic access to Showrunner workflows
- **Node connections** - Chain node outputs to inputs (e.g., beat sheet → outline generator via `{input}` placeholder)
- **Reusable commands** - Consolidate common workflows into callable functions like `create_outline()`, `propose_outline()` with distinct behaviors (reverse analysis vs. writing companion)
- **Agentic chat** - Conversational assistant that asks clarifying questions before generation (e.g., "analyze selected beat sheet and propose outline")
- **Inline text editing** - Versioning on text nodes, possibly via embedded Google Docs integration
- **User content uploads** - Video/image uploads to style via Kling, Luma Modify, etc.
- **PDF/document parsing** - Extend discovery to extract characters/locations from uploaded scripts
- **Enhanced shotlists** - Versioning, re-rolling, per-shot modification instructions before generation
- **Multi-provider generation** - Abstract GenAI routing to easily add new providers (Kling, Runway, etc.)
