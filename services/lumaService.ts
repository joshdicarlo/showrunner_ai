
import { Resolution, BatchType } from "../types";

const LUMA_API_BASE = "https://api.lumalabs.ai/dream-machine/v1";
const DEFAULT_LUMA_KEY = "luma-b73d7ee4-4d84-424d-b143-fde73d3a2e34-f25a6871-8710-46bc-bbdf-75005f5168d6";

/**
 * Prioritized list of CORS proxies with multiple fallbacks.
 * Each proxy has different reliability characteristics.
 */
const PROXY_GENERATORS = [
  // Primary: cors-anywhere style proxies
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  // Backup 1: thingproxy (handles auth headers well)
  (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
  // Backup 2: cors.sh (reliable for API calls)
  (url: string) => `https://proxy.cors.sh/${url}`,
  // Backup 3: allorigins (works for simple GET requests)
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

// Track proxy health to avoid repeatedly hitting dead proxies
const proxyHealthMap: Map<number, { failures: number; lastFailed: number }> = new Map();
const PROXY_COOLDOWN_MS = 30000; // 30 second cooldown after failures
const MAX_FAILURES_BEFORE_COOLDOWN = 3;

/**
 * Get healthy proxies, filtering out ones that are in cooldown
 */
const getHealthyProxyIndices = (): number[] => {
  const now = Date.now();
  const healthy: number[] = [];
  
  for (let i = 0; i < PROXY_GENERATORS.length; i++) {
    const health = proxyHealthMap.get(i);
    if (!health) {
      healthy.push(i);
    } else if (now - health.lastFailed > PROXY_COOLDOWN_MS) {
      // Cooldown expired, give it another chance
      proxyHealthMap.delete(i);
      healthy.push(i);
    } else if (health.failures < MAX_FAILURES_BEFORE_COOLDOWN) {
      healthy.push(i);
    }
  }
  
  // If all proxies are unhealthy, reset and try all
  if (healthy.length === 0) {
    proxyHealthMap.clear();
    return PROXY_GENERATORS.map((_, i) => i);
  }
  
  return healthy;
};

/**
 * Record a proxy failure
 */
const recordProxyFailure = (index: number) => {
  const existing = proxyHealthMap.get(index) || { failures: 0, lastFailed: 0 };
  proxyHealthMap.set(index, {
    failures: existing.failures + 1,
    lastFailed: Date.now()
  });
};

/**
 * Record a proxy success (reset failure count)
 */
const recordProxySuccess = (index: number) => {
  proxyHealthMap.delete(index);
};

/**
 * Resilient fetch wrapper with proxy rotation and retry logic.
 */
const proxiedFetch = async (
  url: string, 
  options: RequestInit = {}, 
  useCacheBuster = false,
  maxRetries = 2
): Promise<Response> => {
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
  const healthyIndices = getHealthyProxyIndices();
  
  for (let retry = 0; retry <= maxRetries; retry++) {
    for (const proxyIndex of healthyIndices) {
      const getProxyUrl = PROXY_GENERATORS[proxyIndex];
      const proxyUrl = getProxyUrl(finalUrl);
      
      try {
        const headers = new Headers(options.headers);
        const isAllOrigins = proxyUrl.includes('allorigins');
        const isCorssh = proxyUrl.includes('cors.sh');
        
        // allorigins doesn't handle auth headers well for POST
        if (isAllOrigins && options.method && options.method !== 'GET') {
          continue;
        }
        
        // cors.sh requires their API key for some endpoints
        if (isCorssh) {
          headers.set('x-cors-api-key', 'temp_' + Math.random().toString(36).slice(2));
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        const response = await fetch(proxyUrl, {
          ...options,
          headers,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (response.ok || (response.status >= 400 && response.status < 500)) {
          recordProxySuccess(proxyIndex);
          return response;
        }
        
        // 5xx errors or other issues - record failure
        recordProxyFailure(proxyIndex);
        lastError = new Error(`Proxy returned status ${response.status}`);
      } catch (e: any) {
        recordProxyFailure(proxyIndex);
        lastError = e;
        
        // If aborted due to timeout, continue to next proxy
        if (e.name === 'AbortError') {
          console.warn(`[Luma] Proxy ${proxyIndex} timed out, trying next...`);
          continue;
        }
      }
    }
    
    // Brief delay before retry cycle
    if (retry < maxRetries) {
      await new Promise(r => setTimeout(r, 1000 * (retry + 1)));
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
  
  console.log(`[Luma Service] Submit Image Gen:`, { prompt });

  const response = await proxiedFetch(`${LUMA_API_BASE}/generations/image`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt,
      model: "photon-1",
      aspect_ratio: "1:1"
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Luma Service] Submission Failed: ${response.status}`, errorBody);
    throw new Error(`Luma Image Error: ${response.status} - ${errorBody}`);
  }

  let generation = await response.json();
  const generationId = generation.id;
  console.log(`[Luma Service] Image Job Created: ${generationId}`);

  let attempts = 0;
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 10;
  
  while (generation.state !== 'completed' && generation.state !== 'failed' && attempts < 100) {
    await new Promise(resolve => setTimeout(resolve, 4000));
    attempts++;
    
    try {
      const pollRes = await proxiedFetch(`${LUMA_API_BASE}/generations/${generationId}`, {
        headers: { 'Authorization': `Bearer ${key}` }
      }, true);
      
      if (pollRes.ok) {
        generation = await pollRes.json();
        consecutiveFailures = 0; // Reset on success
        console.log(`[Luma Service] Polling Image ${generationId}: ${generation.state}`);
      } else {
        consecutiveFailures++;
        console.warn(`[Luma Service] Poll returned ${pollRes.status}, attempt ${attempts}`);
      }
    } catch (e) {
      consecutiveFailures++;
      console.warn(`[Luma Service] Poll failed, attempt ${attempts}:`, e);
    }
    
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      throw new Error(`Lost connection to Luma API after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
    }
  }

  if (generation.state === 'failed') throw new Error(`Luma Failed: ${generation.failure_reason}`);
  
  // Fetch and convert image to Base64 to bypass CORS
  let imageUri = generation.assets.image;
  try {
      console.log(`[Luma Service] Fetching image via proxy: ${imageUri}`);
      const imageRes = await proxiedFetch(imageUri);
      if (imageRes.ok) {
          const blob = await imageRes.blob();
          imageUri = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
          });
          console.log(`[Luma Service] Image converted to Base64 (${imageUri.length} chars)`);
      }
  } catch (error) {
      console.error("[Luma Service] Failed to proxy image, falling back to direct URL:", error);
  }

  return { 
    uri: imageUri, 
    remoteUri: generation.assets.image, 
    prompt,
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

  const payload = {
    prompt,
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
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 10;

  while (generation.state !== 'completed' && generation.state !== 'failed' && attempts < 500) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
    
    try {
      const pollRes = await proxiedFetch(`${LUMA_API_BASE}/generations/${generationId}`, {
        headers: { 'Authorization': `Bearer ${key}` }
      }, true);
      
      if (pollRes.ok) {
        generation = await pollRes.json();
        consecutiveFailures = 0; // Reset on success
        const progress = generation.progress || 0;
        const currentLog = `${generation.state}_${progress}`;
        
        if (currentLog !== lastState) {
          lastState = currentLog;
          onStatusUpdate?.(`Animating (${progress}%)`);
        }
      } else {
        consecutiveFailures++;
        console.warn(`[Luma Video] Poll returned ${pollRes.status}, attempt ${attempts}`);
        onStatusUpdate?.(`Reconnecting... (${consecutiveFailures})`);
      }
    } catch (e) {
      consecutiveFailures++;
      console.warn(`[Luma Video] Poll failed, attempt ${attempts}:`, e);
      onStatusUpdate?.(`Reconnecting... (${consecutiveFailures})`);
    }
    
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      throw new Error(`Lost connection to Luma API after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
    }
  }

  if (generation.state === 'failed') {
    throw new Error(`Luma Animation Failed: ${generation.failure_reason || "Check asset accessibility"}`);
  }

  const videoUrl = generation.assets.video;
  if (!videoUrl) throw new Error("Complete but asset URL missing.");
  
  return videoUrl;
};
