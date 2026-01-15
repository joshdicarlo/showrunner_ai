/**
 * Luma API Client
 * 
 * Low-level wrapper around the Luma Labs Dream Machine API.
 * Handles CORS proxying, polling, and rate limiting.
 * 
 * This client is used by the generationService for Luma-based
 * image and video generation.
 */

import { BatchType, Resolution } from "../../types";

// --- Constants ---

const LUMA_API_BASE = "https://api.lumalabs.ai/dream-machine/v1";
const DEFAULT_LUMA_KEY = "luma-b73d7ee4-4d84-424d-b143-fde73d3a2e34-f25a6871-8710-46bc-bbdf-75005f5168d6";

/**
 * Prioritized list of CORS proxies.
 * corsproxy.io handles the 'Authorization' header correctly in preflight.
 */
const PROXY_GENERATORS = [
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

// --- Types ---

export interface LumaClientConfig {
    apiKey?: string;
}

export interface LumaImageOptions {
    prompt: string;
    model?: string;
    aspectRatio?: string;
    batchType?: BatchType;
    resolution?: Resolution;
}

export interface LumaVideoOptions {
    prompt: string;
    startImage?: string; // Base64 data URI or URL
    startImageUrl?: string; // Remote URL (preferred if available)
    lumaGenerationId?: string; // Use a previous Luma generation as start frame
    model?: string;
    duration?: number;
    onProgress?: (status: string, percent: number) => void;
}

export interface LumaImageResult {
    id: string;
    uri: string; // Local data URI (base64)
    remoteUri: string; // Original Luma URL
    prompt: string;
}

export interface LumaVideoResult {
    id: string;
    uri: string; // Video URL
    prompt: string;
}

// --- Helper Functions ---

/**
 * Resilient fetch wrapper with proxy fallback
 */
const proxiedFetch = async (
    url: string, 
    options: RequestInit = {}, 
    useCacheBuster = false
): Promise<Response> => {
    let finalUrl = url;
    if (useCacheBuster) {
        const separator = url.includes('?') ? '&' : '?';
        finalUrl = `${url}${separator}cb=${Date.now()}`;
    }

    // Attempt direct fetch first for CORS-friendly hosts
    if (!url.includes('lumalabs.ai')) {
        try {
            const directRes = await fetch(finalUrl, { ...options, mode: 'cors' });
            if (directRes.ok || (directRes.status >= 400 && directRes.status < 500)) {
                return directRes;
            }
        } catch {
            // Silently fall back to proxies
        }
    }

    let lastError: Error | null = null;
    
    for (const getProxyUrl of PROXY_GENERATORS) {
        const proxyUrl = getProxyUrl(finalUrl);
        try {
            const isAllOrigins = proxyUrl.includes('allorigins');
            const headers = new Headers(options.headers);
            
            if (isAllOrigins) {
                headers.delete('Cache-Control');
                headers.delete('Pragma');
                headers.delete('Expires');
                if (url.includes('lumalabs.ai')) continue;
            }

            const response = await fetch(proxyUrl, {
                ...options,
                headers
            });

            if (response.ok || (response.status >= 400 && response.status < 500)) {
                return response;
            }
            
            lastError = new Error(`Proxy ${proxyUrl} returned status ${response.status}`);
        } catch (e) {
            lastError = e as Error;
        }
    }

    throw lastError || new Error(`All proxies failed for ${url}`);
};

/**
 * Convert base64 string to Blob
 */
const base64ToBlob = (base64: string, mime = 'image/png'): Blob => {
    const parts = base64.split(',');
    const byteString = atob(parts[1] || parts[0]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mime });
};

/**
 * Upload image to temporary public host for Luma to access
 */
const uploadToPublicHost = async (base64Image: string): Promise<string> => {
    const blob = base64ToBlob(base64Image);
    const formData = new FormData();
    formData.append('file', blob, 'input_frame.png');

    const response = await proxiedFetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error(`Host upload failed: ${response.status}`);
    }

    const data = await response.json();
    const viewerUrl = data.data.url;
    
    let directUrl = viewerUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
    if (directUrl.startsWith('http://')) {
        directUrl = directUrl.replace('http://', 'https://');
    }
    
    return directUrl;
};

/**
 * Fetch remote image and convert to base64 data URI
 */
const fetchImageAsBase64 = async (url: string): Promise<string> => {
    const response = await proxiedFetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
    }
    
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

// --- Client Class ---

class LumaClient {
    private apiKey: string;

    constructor(config: LumaClientConfig = {}) {
        this.apiKey = config.apiKey || DEFAULT_LUMA_KEY;
    }

    /**
     * Generate an image using Luma Photon
     */
    async generateImage(options: LumaImageOptions): Promise<LumaImageResult> {
        console.log(`[LumaClient] Submit Image Gen:`, { prompt: options.prompt });

        const response = await proxiedFetch(`${LUMA_API_BASE}/generations/image`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: options.prompt,
                model: options.model || "photon-1",
                aspect_ratio: options.aspectRatio || "1:1"
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[LumaClient] Submission Failed: ${response.status}`, errorBody);
            throw new Error(`Luma Image Error: ${response.status} - ${errorBody}`);
        }

        let generation = await response.json();
        const generationId = generation.id;
        console.log(`[LumaClient] Image Job Created: ${generationId}`);

        // Poll for completion
        let attempts = 0;
        while (generation.state !== 'completed' && generation.state !== 'failed' && attempts < 100) {
            await new Promise(resolve => setTimeout(resolve, 4000));
            attempts++;
            
            const pollRes = await proxiedFetch(
                `${LUMA_API_BASE}/generations/${generationId}`,
                { headers: { 'Authorization': `Bearer ${this.apiKey}` } },
                true
            );
            
            if (pollRes.ok) {
                generation = await pollRes.json();
                console.log(`[LumaClient] Polling Image ${generationId}: ${generation.state}`);
            }
        }

        if (generation.state === 'failed') {
            throw new Error(`Luma Failed: ${generation.failure_reason}`);
        }

        // Fetch and convert image to Base64 to bypass CORS
        let imageUri = generation.assets.image;
        try {
            console.log(`[LumaClient] Fetching image via proxy: ${imageUri}`);
            imageUri = await fetchImageAsBase64(imageUri);
            console.log(`[LumaClient] Image converted to Base64 (${imageUri.length} chars)`);
        } catch (error) {
            console.error("[LumaClient] Failed to proxy image, falling back to direct URL:", error);
        }

        return {
            id: generationId,
            uri: imageUri,
            remoteUri: generation.assets.image,
            prompt: options.prompt
        };
    }

    /**
     * Generate a video using Luma Ray
     */
    async generateVideo(options: LumaVideoOptions): Promise<LumaVideoResult> {
        const { onProgress } = options;
        
        onProgress?.("Preparing Ingest...", 0);

        // Determine the start frame source
        let frame0: { type: string; url?: string; id?: string };
        
        if (options.startImageUrl && options.startImageUrl.startsWith('http')) {
            frame0 = { type: "image", url: options.startImageUrl };
        } else if (options.lumaGenerationId) {
            frame0 = { type: "generation", id: options.lumaGenerationId };
        } else if (options.startImage) {
            onProgress?.("Hosting Source...", 5);
            const publicUrl = await uploadToPublicHost(options.startImage);
            frame0 = { type: "image", url: publicUrl };
        } else {
            throw new Error("Video generation requires a start image");
        }

        onProgress?.("Queuing Video...", 10);

        const payload = {
            prompt: options.prompt,
            model: options.model || "ray-2",
            keyframes: { frame0 }
        };

        const response = await proxiedFetch(`${LUMA_API_BASE}/generations`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`${response.status}: ${errorBody || "Bad Request"}`);
        }

        let generation = await response.json();
        const generationId = generation.id;
        
        // Poll for completion
        let attempts = 0;
        let lastState = "";

        while (generation.state !== 'completed' && generation.state !== 'failed' && attempts < 500) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            attempts++;
            
            try {
                const pollRes = await proxiedFetch(
                    `${LUMA_API_BASE}/generations/${generationId}`,
                    { headers: { 'Authorization': `Bearer ${this.apiKey}` } },
                    true
                );
                
                if (pollRes.ok) {
                    generation = await pollRes.json();
                    const progress = generation.progress || 0;
                    const currentLog = `${generation.state}_${progress}`;
                    
                    if (currentLog !== lastState) {
                        lastState = currentLog;
                        onProgress?.(`Animating (${progress}%)`, 10 + Math.floor(progress * 0.85));
                    }
                }
            } catch {
                // Polling transient errors are normal via proxies
            }
        }

        if (generation.state === 'failed') {
            throw new Error(`Luma Animation Failed: ${generation.failure_reason || "Check asset accessibility"}`);
        }

        const videoUrl = generation.assets?.video;
        if (!videoUrl) {
            throw new Error("Complete but asset URL missing.");
        }
        
        onProgress?.("Complete", 100);

        return {
            id: generationId,
            uri: videoUrl,
            prompt: options.prompt
        };
    }

    /**
     * Check the status of a generation
     */
    async getGenerationStatus(generationId: string): Promise<{
        state: string;
        progress?: number;
        assets?: { image?: string; video?: string };
        failureReason?: string;
    }> {
        const response = await proxiedFetch(
            `${LUMA_API_BASE}/generations/${generationId}`,
            { headers: { 'Authorization': `Bearer ${this.apiKey}` } },
            true
        );
        
        if (!response.ok) {
            throw new Error(`Failed to get generation status: ${response.status}`);
        }
        
        const data = await response.json();
        return {
            state: data.state,
            progress: data.progress,
            assets: data.assets,
            failureReason: data.failure_reason
        };
    }
}

// --- Singleton Instance ---

let clientInstance: LumaClient | null = null;

/**
 * Get the singleton Luma client instance
 */
export const getLumaClient = (config?: LumaClientConfig): LumaClient => {
    if (!clientInstance) {
        clientInstance = new LumaClient(config);
    }
    return clientInstance;
};

/**
 * Create a new Luma client with custom config
 */
export const createLumaClient = (config: LumaClientConfig): LumaClient => {
    return new LumaClient(config);
};

export default LumaClient;
