/**
 * API Client Layer
 * 
 * Low-level API wrappers that provide clean abstractions over external services.
 * These clients handle authentication, retry logic, and raw API calls.
 * 
 * Domain services (discoveryService, generationService) should use these clients
 * rather than directly importing SDKs.
 */

// Gemini (Google AI) Client
export { 
    getGeminiClient, 
    createGeminiClient,
    Type,
    Modality
} from './geminiClient';
export type {
    GeminiClientConfig,
    TextGenerationOptions,
    ImageGenerationOptions as GeminiImageOptions,
    VideoGenerationOptions as GeminiVideoOptions,
    StreamingOptions,
    TextGenerationResult,
    ImageGenerationResult,
    VideoGenerationResult
} from './geminiClient';

// Luma (Dream Machine) Client
export { 
    getLumaClient, 
    createLumaClient 
} from './lumaClient';
export type {
    LumaClientConfig,
    LumaImageOptions,
    LumaVideoOptions,
    LumaImageResult,
    LumaVideoResult
} from './lumaClient';

// Google Drive Client
export { 
    getDriveClient, 
    createDriveClient 
} from './driveClient';
export type {
    DriveClientConfig,
    FolderInfo,
    FileUploadResult
} from './driveClient';
