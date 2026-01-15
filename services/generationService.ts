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
 * 
 * Uses API clients from the api layer for all provider interactions.
 */

import { getGeminiClient, getLumaClient } from "./api";
import { MODELS } from "../constants";
import { ProjectAsset, ProjectSettings } from "../types";
import { resolvePrompt, resolveReferenceImages } from "../utils/promptUtils";

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
        const lumaClient = getLumaClient();
        const result = await lumaClient.generateImage({
            prompt: resolved,
            aspectRatio: options.aspectRatio || "1:1"
        });
        return {
            url: result.uri,
            resolvedPrompt: resolved,
            provider: 'luma'
        };
    }
    
    // Gemini/Imagen path
    const geminiClient = getGeminiClient();
    
    // Parse reference images for Gemini
    const referenceImages = refImages
        .map(img => {
            const match = img.match(/^data:(.+);base64,(.+)$/);
            if (match) return { mimeType: match[1], data: match[2] };
            return null;
        })
        .filter((ref): ref is { mimeType: string; data: string } => ref !== null);

    const result = await geminiClient.generateImages(resolved, {
        model,
        aspectRatio: options.aspectRatio || "16:9",
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        imageSize: model.includes('pro') ? "2K" : "1K"
    });

    if (result.images.length === 0) {
        throw new Error("No image data in response");
    }

    const image = result.images[0];
    console.log(`[GenerationService] Image generation successful`);
    
    return {
        url: `data:${image.mimeType};base64,${image.data}`,
        resolvedPrompt: resolved,
        provider: 'gemini'
    };
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
    
    console.log(`[GenerationService] Generating video with ${model}:`, options.prompt.substring(0, 50) + "...");
    
    // Route to appropriate provider
    if (isLumaModel(model)) {
        const lumaClient = getLumaClient();
        const result = await lumaClient.generateVideo({
            prompt: options.prompt,
            startImage: options.startImage,
            duration: options.duration,
            onProgress: options.onProgress
        });
        return {
            url: result.uri,
            resolvedPrompt: options.prompt,
            provider: 'luma'
        };
    }
    
    // Veo/Gemini Video path
    const geminiClient = getGeminiClient();
    
    const result = await geminiClient.generateVideo(
        options.prompt,
        {
            model,
            aspectRatio: options.aspectRatio
        },
        (percent, status) => options.onProgress?.(status, percent)
    );

    console.log(`[GenerationService] Video generation successful`);
    
    // Fetch and convert to data URI for consistency
    const response = await fetch(result.videoUri);
    const blob = await response.blob();
    const reader = new FileReader();
    const dataUri = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
    
    return {
        url: dataUri,
        resolvedPrompt: options.prompt,
        provider: 'gemini'
    };
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
    const geminiClient = getGeminiClient();
    
    // Resolve prompt
    const { resolved } = resolvePrompt(
        prompt,
        options?.projectAssets,
        options?.activeAsset,
        options?.projectSettings
    );
    
    console.log(`[GenerationService] Editing image:`, resolved.substring(0, 50) + "...");
    
    // Extract base64 from data URI
    const match = imageUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) throw new Error("Invalid image data URI");
    
    const result = await geminiClient.editImage(
        { mimeType: match[1], data: match[2] },
        resolved
    );

    if (result.images.length === 0) {
        throw new Error("No image data in edit response");
    }

    const image = result.images[0];
    return {
        url: `data:${image.mimeType};base64,${image.data}`,
        resolvedPrompt: resolved,
        provider: 'gemini'
    };
};
