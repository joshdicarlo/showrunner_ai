/**
 * React Adapter Hooks
 * 
 * These hooks provide React-friendly interfaces to the domain services.
 * They handle state management, loading states, and error handling.
 * 
 * Usage:
 * ```tsx
 * import { useDiscovery, useGeneration, useDrive } from './services/adapters';
 * 
 * function MyComponent() {
 *     const { isLoading, thinking, runFullDiscovery } = useDiscovery();
 *     const { isGenerating, generateImageAsync } = useGeneration();
 *     const { isMockMode, signIn } = useDrive();
 *     // ...
 * }
 * ```
 */

// Discovery Hook - Script analysis
export { useDiscovery } from './useDiscovery';
export type {
    UseDiscoveryState,
    UseDiscoveryActions,
    UseDiscoveryReturn
} from './useDiscovery';

// Generation Hook - Image/Video generation
export { useGeneration } from './useGeneration';
export type {
    GenerationTask,
    UseGenerationState,
    GenerationContext,
    UseGenerationActions,
    UseGenerationReturn
} from './useGeneration';

// Drive Hook - Google Drive operations
export { useDrive } from './useDrive';
export type {
    UseDriveState,
    ProjectStructure,
    UseDriveActions,
    UseDriveReturn
} from './useDrive';
