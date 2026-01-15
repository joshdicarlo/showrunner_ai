/**
 * Generation Service
 * 
 * Unified service for all image and video generation.
 * Routes to appropriate providers (Gemini, Luma) based on model selection.
 * Handles prompt resolution internally.
 * 
 * This centralizes generation logic that was previously scattered across:
 * - NodeItem.tsx (handleImageGen, handleVideoGen)
 * - App.tsx (taskExecutor)
 */

import { GoogleGenAI, Modality } from "@google/genai";
import { MODELS } from "../constants";
import { ProjectAsset, ProjectSettings, BatchType } from "../types";
import { resolvePrompt, resolveReferenceImages } from "../utils/promptUtils";
import { generateLumaImage, generateLumaVideo } from "./lumaService";

// --- Types ---

export interface GenerationConfig {
    /** The prompt to use for generation */
    prompt: string;
    /** Model to use (determines provider routing) */
    model?: string;
    /** Aspect ratio for the output */
    aspectRatio?: string;
    /** Explicit reference images (overrides auto-resolution) */
    referenceImages?: string[];
    /** Style ID for prompt resolution */
    styleId?: string;
}

export interface ImageGenerationOptions extends GenerationConfig {
    /** Project assets for @ reference resolution */
    projectAssets?: ProjectAsset[];
    /** Active asset context */
    activeAsset?: ProjectAsset;
    /** Project settings for style resolution */
    projectSettings?: ProjectSettings;
    /** Map of refined images per asset */
    refinedImagesMap?: Record<string, string[]>;
    /** Map of approved images per asset */
    approvedImagesMap?: Record<string, string[]>;
    /** Asset thumbnails for reference */
    assetThumbnails?: Record<string, string>;
}

export interface VideoGenerationOptions extends GenerationConfig {
    /** Start frame image (required for most video models) */
    startImage?: string;
    /** End frame image (for supported models) */
    endImage?: string;
    /** Duration in seconds */
    duration?: number;
    /** Include audio generation */
    withAudio?: boolean;
    /** Progress callback */
    onProgress?: (message: string, percent: number) => void;
}

export interface GenerationResult {
    /** The generated media URL (data URI or remote URL) */
    url: string;
    /** The resolved prompt that was actually sent to the API */
    resolvedPrompt: string;
    /** Provider that was used */
    provider: 'gemini' | 'luma';
}

// --- Helper ---

const createAI = () => {
    if (!process.env.API_KEY) {
        console.error("API_KEY is missing from environment variables");
        throw new Error("API Key missing");
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// --- Retry Logic ---

const retryWithBackoff = async <T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelayMs = 1000
): Promise<T> => {
    let lastError: Error | null = null;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (e: any) {
            lastError = e;
            const isRetryable = e.message?.includes('429') || 
                               e.message?.includes('Too Many Requests') ||
                               e.message?.includes('Recitation');
            if (!isRetryable || i === maxRetries - 1) throw e;
            const delay = Math.pow(2, i) * baseDelayMs;
            console.warn(`[GenerationService] Retry ${i + 1}/${maxRetries} after ${delay}ms`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
};

// --- Provider Detection ---

const isLumaModel = (model: string): boolean => {
    return model.toLowerCase().includes('luma');
};

const isImagenModel = (model: string): boolean => {
    return model.toLowerCase().includes('imagen');
};

// --- Image Generation ---

/**
 * Generate an image using the appropriate provider based on model.
 * 
 * @param options - Generation configuration
 * @returns Promise<GenerationResult>
 */
export const generateImage = async (
    options: ImageGenerationOptions
): Promise<GenerationResult> => {
    const model = options.model || MODELS.IMAGE_GEN;
    
    // Resolve prompt with @ references
    const { resolved, matchedAssets } = resolvePrompt(
        options.prompt,
        options.projectAssets,
        options.activeAsset,
        options.projectSettings,
        options.styleId
    );
    
    // Get reference images
    let refImages: string[] = options.referenceImages || [];
    if (refImages.length === 0 && options.projectAssets) {
        refImages = resolveReferenceImages(
            options.prompt,
            options.projectAssets,
            options.activeAsset,
            options.refinedImagesMap || {},
            options.approvedImagesMap || {},
            options.assetThumbnails || {},
            matchedAssets
        );
    }
    
    console.log(`[GenerationService] Generating image with ${model}:`, resolved.substring(0, 50) + "...");
    
    // Route to appropriate provider
    if (isLumaModel(model)) {
        const result = await generateLumaImage(resolved, BatchType.STANDARD, "1024x1024");
        return {
            url: result.uri,
            resolvedPrompt: resolved,
            provider: 'luma'
        };
    }
    
    // Gemini/Imagen path
    const ai = createAI();
    
    return await retryWithBackoff(async () => {
        if (isImagenModel(model)) {
            // Imagen API
            const response = await ai.models.generateImages({
                model,
                prompt: resolved,
                config: {
                    numberOfImages: 1,
                    aspectRatio: options.aspectRatio || "16:9",
                    outputMimeType: 'image/jpeg'
                }
            });
            const b64 = response.generatedImages?.[0]?.image?.imageBytes;
            if (!b64) throw new Error("No image data in response");
            return {
                url: `data:image/jpeg;base64,${b64}`,
                resolvedPrompt: resolved,
                provider: 'gemini' as const
            };
        } else {
            // Gemini Image Gen
            const parts: any[] = [];
            refImages.forEach(img => {
                const match = img.match(/^data:(.+);base64,(.+)$/);
                if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
            });
            parts.push({ text: resolved });

            const response = await ai.models.generateContent({
                model,
                contents: { parts },
                config: {
                    responseModalities: [Modality.TEXT, Modality.IMAGE],
                    imageConfig: {
                        aspectRatio: options.aspectRatio || "16:9",
                        imageSize: model.includes('pro') ? "2K" : "1K"
                    }
                }
            });
            
            // Extract from parts
            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        console.log(`[GenerationService] Image generation successful`);
                        return {
                            url: `data:image/png;base64,${part.inlineData.data}`,
                            resolvedPrompt: resolved,
                            provider: 'gemini' as const
                        };
                    }
                }
            }
            throw new Error("No image data in Gemini response");
        }
    });
};

// --- Video Generation ---

/**
 * Generate a video using the appropriate provider based on model.
 * 
 * @param options - Generation configuration
 * @returns Promise<GenerationResult>
 */
export const generateVideo = async (
    options: VideoGenerationOptions
): Promise<GenerationResult> => {
    const model = options.model || MODELS.VIDEO_FAST;
    const duration = options.duration || 5;
    
    console.log(`[GenerationService] Generating video with ${model}:`, options.prompt.substring(0, 50) + "...");
    
    // Route to appropriate provider
    if (isLumaModel(model)) {
        const result = await generateLumaVideo(
            options.startImage || "",
            options.prompt,
            BatchType.STANDARD,
            undefined,
            duration,
            undefined,
            (status) => {
                const match = status.match(/\((\d+)%\)/);
                const percent = match ? parseInt(match[1]) : 0;
                options.onProgress?.(status, percent);
            }
        );
        return {
            url: result,
            resolvedPrompt: options.prompt,
            provider: 'luma'
        };
    }
    
    // Veo/Gemini Video path
    const ai = createAI();
    
    return await retryWithBackoff(async () => {
        options.onProgress?.("Initializing video generation...", 0);
        
        // Build request parts
        const parts: any[] = [];
        
        // Add start frame if provided
        if (options.startImage) {
            const match = options.startImage.match(/^data:(.+);base64,(.+)$/);
            if (match) {
                parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
            }
        }
        
        // Add prompt
        parts.push({ text: options.prompt });
        
        // Add end frame if provided
        if (options.endImage) {
            const match = options.endImage.match(/^data:(.+);base64,(.+)$/);
            if (match) {
                parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
            }
        }

        // Start generation
        let operation = await ai.models.generateVideos({
            model,
            prompt: options.prompt,
            // Note: Image inputs for Veo would need different handling
            config: {
                aspectRatio: options.aspectRatio as any || "16:9",
                numberOfVideos: 1,
            }
        });

        // Poll for completion
        const startTime = Date.now();
        const maxWaitMs = 10 * 60 * 1000; // 10 minutes max
        
        while (!operation.done) {
            if (Date.now() - startTime > maxWaitMs) {
                throw new Error("Video generation timed out");
            }
            
            await new Promise(r => setTimeout(r, 5000));
            operation = await ai.operations.getVideosOperation({ operation });
            
            // Estimate progress based on time (Veo doesn't give real progress)
            const elapsed = Date.now() - startTime;
            const estimatedProgress = Math.min(90, Math.floor((elapsed / 120000) * 100));
            options.onProgress?.(`Generating video...`, estimatedProgress);
        }

        options.onProgress?.("Finalizing...", 95);

        // Extract result
        if (operation.response?.generatedVideos?.[0]?.video?.uri) {
            const videoUri = operation.response.generatedVideos[0].video.uri;
            console.log(`[GenerationService] Video generation successful`);
            
            // Fetch and convert to data URI for consistency
            const response = await fetch(videoUri);
            const blob = await response.blob();
            const reader = new FileReader();
            const dataUri = await new Promise<string>((resolve, reject) => {
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            
            options.onProgress?.("Complete", 100);
            
            return {
                url: dataUri,
                resolvedPrompt: options.prompt,
                provider: 'gemini'
            };
        }
        
        throw new Error("No video data in response");
    });
};

// --- Image Editing ---

/**
 * Edit an existing image with a text prompt
 */
export const editImage = async (
    imageUrl: string,
    prompt: string,
    options?: {
        projectAssets?: ProjectAsset[];
        activeAsset?: ProjectAsset;
        projectSettings?: ProjectSettings;
    }
): Promise<GenerationResult> => {
    const ai = createAI();
    
    // Resolve prompt
    const { resolved } = resolvePrompt(
        prompt,
        options?.projectAssets,
        options?.activeAsset,
        options?.projectSettings
    );
    
    console.log(`[GenerationService] Editing image:`, resolved.substring(0, 50) + "...");
    
    return await retryWithBackoff(async () => {
        // Extract base64 from data URI
        const match = imageUrl.match(/^data:(.+);base64,(.+)$/);
        if (!match) throw new Error("Invalid image data URI");
        
        const response = await ai.models.generateContent({
            model: MODELS.IMAGE_EDIT,
            contents: {
                parts: [
                    { inlineData: { mimeType: match[1], data: match[2] } },
                    { text: resolved }
                ]
            },
            config: {
                responseModalities: [Modality.TEXT, Modality.IMAGE]
            }
        });
        
        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    return {
                        url: `data:image/png;base64,${part.inlineData.data}`,
                        resolvedPrompt: resolved,
                        provider: 'gemini'
                    };
                }
            }
        }
        throw new Error("No image data in edit response");
    });
};
