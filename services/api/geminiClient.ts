/**
 * Gemini API Client
 * 
 * Low-level wrapper around the Google GenAI SDK.
 * Handles API initialization, retry logic, and raw API calls.
 * 
 * This client is used by domain services (discoveryService, generationService)
 * and provides a clean abstraction over the underlying SDK.
 */

import { GoogleGenAI, Modality, Type } from "@google/genai";
import { MODELS } from "../../constants";

// --- Types ---

export interface GeminiClientConfig {
    apiKey?: string;
    defaultModel?: string;
}

export interface TextGenerationOptions {
    model?: string;
    systemInstruction?: string;
    maxOutputTokens?: number;
    temperature?: number;
    stopSequences?: string[];
    responseMimeType?: 'text/plain' | 'application/json';
    responseSchema?: any;
}

export interface ImageGenerationOptions {
    model?: string;
    aspectRatio?: string;
    numberOfImages?: number;
    outputMimeType?: 'image/jpeg' | 'image/png';
    referenceImages?: Array<{ mimeType: string; data: string }>;
    imageSize?: '1K' | '2K';
}

export interface VideoGenerationOptions {
    model?: string;
    aspectRatio?: string;
    numberOfVideos?: number;
    startImage?: { mimeType: string; data: string };
    endImage?: { mimeType: string; data: string };
}

export interface StreamingOptions extends TextGenerationOptions {
    thinkingBudget?: number;
    includeThoughts?: boolean;
    onThought?: (thought: string) => void;
    onText?: (text: string) => void;
}

export interface TextGenerationResult {
    text: string;
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
    };
}

export interface ImageGenerationResult {
    images: Array<{
        data: string;
        mimeType: string;
    }>;
}

export interface VideoGenerationResult {
    videoUri: string;
    duration?: number;
}

// --- Client Class ---

class GeminiClient {
    private ai: GoogleGenAI | null = null;
    private config: GeminiClientConfig;

    constructor(config: GeminiClientConfig = {}) {
        this.config = config;
    }

    /**
     * Initialize the client with API key
     */
    private getClient(): GoogleGenAI {
        if (this.ai) return this.ai;
        
        const apiKey = this.config.apiKey || process.env.API_KEY;
        if (!apiKey) {
            throw new Error("API Key missing. Please set the API_KEY environment variable.");
        }
        
        this.ai = new GoogleGenAI({ apiKey });
        return this.ai;
    }

    /**
     * Retry with exponential backoff for rate limits
     */
    async retryWithBackoff<T>(
        fn: () => Promise<T>,
        maxRetries = 3,
        baseDelayMs = 1000
    ): Promise<T> {
        let lastError: Error | null = null;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error: any) {
                lastError = error;
                
                // Check if error is retryable
                const status = error.status || error.code || error?.error?.code;
                const message = error.message || error?.error?.message || '';
                
                const isRetryable = 
                    status === 429 ||
                    status === 'RESOURCE_EXHAUSTED' ||
                    message.includes('429') ||
                    message.includes('quota') ||
                    message.includes('RESOURCE_EXHAUSTED') ||
                    message.includes('Too Many Requests') ||
                    message.includes('Recitation');
                
                if (!isRetryable || attempt === maxRetries - 1) {
                    throw error;
                }
                
                const delay = Math.pow(2, attempt) * baseDelayMs;
                console.warn(`[GeminiClient] Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw lastError;
    }

    // --- Text Generation ---

    /**
     * Generate text content
     */
    async generateText(
        prompt: string,
        options: TextGenerationOptions = {}
    ): Promise<TextGenerationResult> {
        const ai = this.getClient();
        const model = options.model || this.config.defaultModel || MODELS.TEXT_FAST;
        
        return this.retryWithBackoff(async () => {
            const response = await ai.models.generateContent({
                model,
                contents: prompt,
                config: {
                    systemInstruction: options.systemInstruction,
                    maxOutputTokens: options.maxOutputTokens,
                    temperature: options.temperature,
                    stopSequences: options.stopSequences,
                    responseMimeType: options.responseMimeType,
                    responseSchema: options.responseSchema
                }
            });
            
            return {
                text: response.text || "",
                usage: response.usageMetadata ? {
                    inputTokens: response.usageMetadata.promptTokenCount,
                    outputTokens: response.usageMetadata.candidatesTokenCount
                } : undefined
            };
        });
    }

    /**
     * Generate text with streaming (supports thinking/reasoning)
     */
    async generateTextStream(
        prompt: string,
        options: StreamingOptions = {}
    ): Promise<TextGenerationResult> {
        const ai = this.getClient();
        const model = options.model || this.config.defaultModel || MODELS.TEXT_FAST;
        
        try {
            const stream = await ai.models.generateContentStream({
                model,
                contents: prompt,
                config: {
                    systemInstruction: options.systemInstruction,
                    maxOutputTokens: options.maxOutputTokens,
                    temperature: options.temperature,
                    stopSequences: options.stopSequences,
                    responseMimeType: options.responseMimeType,
                    responseSchema: options.responseSchema,
                    thinkingConfig: options.thinkingBudget ? {
                        thinkingBudget: options.thinkingBudget,
                        includeThoughts: options.includeThoughts ?? true
                    } : undefined
                }
            });

            let fullText = '';
            let thinkingText = '';
            
            try {
                for await (const chunk of stream) {
                    if (chunk.candidates?.[0]?.content?.parts) {
                        for (const part of chunk.candidates[0].content.parts) {
                            if (!part.text) continue;
                            
                            if (part.thought) {
                                thinkingText += part.text;
                                options.onThought?.(thinkingText);
                            } else {
                                fullText += part.text;
                                options.onText?.(fullText);
                            }
                        }
                    }
                }
            } catch (streamError) {
                console.error('[GeminiClient] Stream processing error:', streamError);
                // Return whatever we have so far
                if (fullText) {
                    return { text: fullText };
                }
                throw streamError;
            }

            return { text: fullText };
        } catch (error) {
            console.error('[GeminiClient] generateTextStream error:', error);
            throw error;
        }
    }

    // --- Image Generation ---

    /**
     * Generate images using Imagen
     */
    async generateImages(
        prompt: string,
        options: ImageGenerationOptions = {}
    ): Promise<ImageGenerationResult> {
        const ai = this.getClient();
        const model = options.model || MODELS.IMAGE_GEN;
        
        return this.retryWithBackoff(async () => {
            // Check if this is an Imagen model
            if (model.includes('imagen')) {
                const response = await ai.models.generateImages({
                    model,
                    prompt,
                    config: {
                        numberOfImages: options.numberOfImages || 1,
                        aspectRatio: options.aspectRatio || "16:9",
                        outputMimeType: options.outputMimeType || 'image/jpeg'
                    }
                });
                
                const images = (response.generatedImages || []).map(img => ({
                    data: img.image?.imageBytes || '',
                    mimeType: options.outputMimeType || 'image/jpeg'
                })).filter(img => img.data);
                
                return { images };
            }
            
            // Gemini native image generation
            const parts: any[] = [];
            
            // Add reference images if provided
            if (options.referenceImages) {
                for (const ref of options.referenceImages) {
                    parts.push({ inlineData: ref });
                }
            }
            
            parts.push({ text: prompt });
            
            const response = await ai.models.generateContent({
                model,
                contents: { parts },
                config: {
                    responseModalities: [Modality.TEXT, Modality.IMAGE],
                    imageConfig: {
                        aspectRatio: options.aspectRatio || "16:9",
                        imageSize: options.imageSize || (model.includes('pro') ? "2K" : "1K")
                    }
                }
            });
            
            const images: Array<{ data: string; mimeType: string }> = [];
            
            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        images.push({
                            data: part.inlineData.data || '',
                            mimeType: part.inlineData.mimeType || 'image/png'
                        });
                    }
                }
            }
            
            return { images };
        });
    }

    /**
     * Edit an image with a prompt
     */
    async editImage(
        imageData: { mimeType: string; data: string },
        prompt: string,
        options: ImageGenerationOptions = {}
    ): Promise<ImageGenerationResult> {
        const ai = this.getClient();
        const model = options.model || MODELS.IMAGE_EDIT;
        
        return this.retryWithBackoff(async () => {
            const response = await ai.models.generateContent({
                model,
                contents: {
                    parts: [
                        { inlineData: imageData },
                        { text: prompt }
                    ]
                },
                config: {
                    responseModalities: [Modality.TEXT, Modality.IMAGE]
                }
            });
            
            const images: Array<{ data: string; mimeType: string }> = [];
            
            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        images.push({
                            data: part.inlineData.data || '',
                            mimeType: part.inlineData.mimeType || 'image/png'
                        });
                    }
                }
            }
            
            return { images };
        });
    }

    // --- Video Generation ---

    /**
     * Generate video using Veo
     */
    async generateVideo(
        prompt: string,
        options: VideoGenerationOptions = {},
        onProgress?: (percent: number, status: string) => void
    ): Promise<VideoGenerationResult> {
        const ai = this.getClient();
        const model = options.model || MODELS.VIDEO_FAST;
        
        return this.retryWithBackoff(async () => {
            onProgress?.(0, "Initializing video generation...");
            
            let operation = await ai.models.generateVideos({
                model,
                prompt,
                config: {
                    aspectRatio: options.aspectRatio as any || "16:9",
                    numberOfVideos: options.numberOfVideos || 1
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
                
                // Estimate progress
                const elapsed = Date.now() - startTime;
                const estimatedProgress = Math.min(90, Math.floor((elapsed / 120000) * 100));
                onProgress?.(estimatedProgress, "Generating video...");
            }

            onProgress?.(95, "Finalizing...");

            const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
            if (!videoUri) {
                throw new Error("No video data in response");
            }
            
            onProgress?.(100, "Complete");
            
            return { videoUri };
        });
    }
}

// --- Singleton Instance ---

let clientInstance: GeminiClient | null = null;

/**
 * Get the singleton Gemini client instance
 */
export const getGeminiClient = (config?: GeminiClientConfig): GeminiClient => {
    if (!clientInstance) {
        clientInstance = new GeminiClient(config);
    }
    return clientInstance;
};

/**
 * Create a new Gemini client with custom config
 */
export const createGeminiClient = (config: GeminiClientConfig): GeminiClient => {
    return new GeminiClient(config);
};

// --- Type Exports for Schema Building ---

export { Type, Modality };

export default GeminiClient;
