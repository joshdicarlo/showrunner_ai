
import { Resolution, BatchType } from "../types";

const LUMA_API_BASE = "https://api.lumalabs.ai/dream-machine/v1";
const DEFAULT_LUMA_KEY = "luma-b73d7ee4-4d84-424d-b143-fde73d3a2e34-f25a6871-8710-46bc-bbdf-75005f5168d6";

/**
 * Prioritized list of proxies. 
 * corsproxy.io is chosen as primary because it handles the 'Authorization' header correctly in preflight.
 */
const PROXY_GENERATORS = [
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

/**
 * Resilient fetch wrapper with strict header management.
 */
const proxiedFetch = async (url: string, options: RequestInit = {}, useCacheBuster = false) => {
  let finalUrl = url;
  if (useCacheBuster) {
    const separator = url.includes('?') ? '&' : '?';
    finalUrl = `${url}${separator}cb=${Date.now()}`;
  }

  // Attempt direct fetch first for CORS-friendly hosts like tmpfiles.org
  if (!url.includes('lumalabs.ai')) {
    try {
      const directRes = await fetch(finalUrl, { ...options, mode: 'cors' });
      if (directRes.ok || (directRes.status >= 400 && directRes.status < 500)) return directRes;
    } catch (e) {
      // Silently fall back to proxies
    }
  }

  let lastError: any = null;
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
      lastError = e;
    }
  }

  throw lastError || new Error(`All proxies failed for ${url}`);
};

const base64ToBlob = (base64: string, mime: string = 'image/png') => {
  const parts = base64.split(',');
  const byteString = atob(parts[1] || parts[0]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mime });
};

const uploadToPublicHost = async (base64Image: string): Promise<string> => {
  const blob = base64ToBlob(base64Image);
  const formData = new FormData();
  formData.append('file', blob, 'input_frame.png');

  const response = await proxiedFetch('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) throw new Error(`Host upload failed: ${response.status}`);

  const data = await response.json();
  const viewerUrl = data.data.url;
  
  let directUrl = viewerUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
  if (directUrl.startsWith('http://')) {
    directUrl = directUrl.replace('http://', 'https://');
  }
  
  return directUrl;
};

export const generateLumaImage = async (
  prompt: string,
  type: BatchType,
  resolution: Resolution,
  apiKey?: string
): Promise<{ uri: string; remoteUri: string; prompt: string; id: string }> => {
  const key = apiKey || DEFAULT_LUMA_KEY;
  
  let fullPrompt = '';
  if (type === BatchType.PIXEL_ART) {
    fullPrompt = `Professional pixel art, ${resolution}x${resolution}, ${prompt}. Sharp square pixels, vibrant 8-bit color palette, retro game aesthetic.`;
  } else {
    fullPrompt = `${prompt}. Master-piece hyper-realistic, High-end professional surrealist photography. The head must be entirely made of produce material, features formed from skin rind and pulp. Cinematic lighting, 8k detail. Strictly photographic style.`;
  }

  const response = await proxiedFetch(`${LUMA_API_BASE}/generations/image`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: fullPrompt,
      model: "photon-1",
      aspect_ratio: "1:1"
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Luma Image Error: ${response.status} - ${errorBody}`);
  }

  let generation = await response.json();
  const generationId = generation.id;

  let attempts = 0;
  while (generation.state !== 'completed' && generation.state !== 'failed' && attempts < 100) {
    await new Promise(resolve => setTimeout(resolve, 4000));
    attempts++;
    const pollRes = await proxiedFetch(`${LUMA_API_BASE}/generations/${generationId}`, {
      headers: { 'Authorization': `Bearer ${key}` }
    }, true);
    if (pollRes.ok) generation = await pollRes.json();
  }

  if (generation.state === 'failed') throw new Error(`Luma Failed: ${generation.failure_reason}`);
  return { 
    uri: generation.assets.image, 
    remoteUri: generation.assets.image, 
    prompt: fullPrompt,
    id: generationId
  };
};

export const generateLumaVideo = async (
  base64Image: string,
  prompt: string,
  batchType: BatchType,
  apiKey?: string,
  duration: number = 4,
  remoteUri?: string,
  onStatusUpdate?: (status: string) => void,
  lumaGenerationId?: string
): Promise<string> => {
  const key = apiKey || DEFAULT_LUMA_KEY;

  onStatusUpdate?.("Preparing Ingest...");

  let frame0: any;
  if (remoteUri && remoteUri.startsWith('http')) {
    frame0 = { type: "image", url: remoteUri };
  } else if (lumaGenerationId) {
    frame0 = { type: "generation", id: lumaGenerationId };
  } else {
    onStatusUpdate?.("Hosting Source...");
    const publicUrl = await uploadToPublicHost(base64Image);
    frame0 = { type: "image", url: publicUrl };
  }

  onStatusUpdate?.("Queuing Video...");

  /**
   * PIXEL ART MOTION ENFORCEMENT LAYER
   * We wrap the original prompt with movement-specific instructions 
   * that encourage "sprite-like" behavior and discourage Gaussian blur interpolation.
   */
  let animationStyle = "";
  if (batchType === BatchType.PIXEL_ART) {
    animationStyle = "Retro 8-bit video game sprite animation. Crisp frame-by-frame movement. Sharp square pixels. Static camera, high shutter speed, zero motion blur, pixel-perfect textures.";
  } else {
    animationStyle = "Cinematic character animation. Sharp focus, vivid organic textures, high shutter speed, clear fluid motion, professional studio lighting.";
  }

  const finalVideoPrompt = `${animationStyle} Character action: ${prompt}`.substring(0, 500);

  const payload = {
    prompt: finalVideoPrompt,
    model: "ray-2",
    keyframes: { 
      frame0
    }
  };

  const response = await proxiedFetch(`${LUMA_API_BASE}/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
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
  
  let attempts = 0;
  let lastState = "";

  while (generation.state !== 'completed' && generation.state !== 'failed' && attempts < 500) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
    
    try {
      const pollRes = await proxiedFetch(`${LUMA_API_BASE}/generations/${generationId}`, {
        headers: { 'Authorization': `Bearer ${key}` }
      }, true);
      
      if (pollRes.ok) {
        generation = await pollRes.json();
        const progress = generation.progress || 0;
        const currentLog = `${generation.state}_${progress}`;
        
        if (currentLog !== lastState) {
          lastState = currentLog;
          onStatusUpdate?.(`Animating (${progress}%)`);
        }
      }
    } catch (e) {
      // Polling transient errors are normal via proxies
    }
  }

  if (generation.state === 'failed') {
    throw new Error(`Luma Animation Failed: ${generation.failure_reason || "Check asset accessibility"}`);
  }

  const videoUrl = generation.assets.video;
  if (!videoUrl) throw new Error("Complete but asset URL missing.");
  
  return videoUrl;
};
