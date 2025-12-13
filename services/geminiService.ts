
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { MODELS, CHAT_SYSTEM_INSTRUCTION } from "../constants";
import { StorySeed } from "../types";

// Define local interface to avoid global conflict with existing AIStudio types
interface AIStudioWindow {
  aistudio?: {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  };
}

const createAI = () => {
  if (!process.env.API_KEY) {
    console.error("API_KEY is missing from environment variables");
    throw new Error("API Key missing");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export interface CharacterProfile {
  name: string;
  description: string;
  role: string;
}

export interface LocationProfile {
    name: string;
    description: string;
    type: string; // INT / EXT
}

export interface StoryElement {
    title: string;
    description: string;
    type: string; // Plot Point, Theme, Key Event
}

/**
 * Helper: Retry with Exponential Backoff
 * Handles 429 RESOURCE_EXHAUSTED errors
 */
const retryWithBackoff = async <T>(fn: () => Promise<T>, retries = 3, initialDelay = 1000): Promise<T> => {
    let currentDelay = initialDelay;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            const isRateLimit = error.status === 429 || 
                                error.code === 429 || 
                                error.status === 'RESOURCE_EXHAUSTED' ||
                                (error.message && error.message.includes('429')) ||
                                (error.message && error.message.includes('quota'));
            
            if (isRateLimit && i < retries - 1) {
                console.warn(`Rate limit hit. Retrying in ${currentDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, currentDelay));
                currentDelay *= 2;
                continue;
            }
            throw error;
        }
    }
    throw new Error("Max retries exceeded");
};

/**
 * Text Generation (Writers Room)
 */
export const generateCreativeText = async (
  prompt: string,
  model: string = MODELS.TEXT_PRO,
  systemInstruction: string = "You are a professional screenwriter and creative director."
): Promise<string> => {
  const ai = createAI();
  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
      },
    });
    return response.text || "No text generated.";
  } catch (e) {
    console.error("Text Gen Error", e);
    throw e;
  }
};

/**
 * Co-Pilot Text Completion
 */
export const generateTextCompletion = async (currentText: string): Promise<string> => {
    // Lower threshold to allow early suggestions like "INT" -> ". OFFICE - DAY"
    if (!currentText || currentText.length < 2) return "";
    
    const ai = createAI();
    try {
        // Use last 1000 chars for context to keep it fast and focused
        const context = currentText.slice(-1000);
        
        const prompt = `You are a professional Hollywood script doctor and writing assistant.
        Your job is to auto-complete the user's screenplay text with the most likely next words.
        
        Context:
        The user is writing a screenplay.
        
        Formatting Rules:
        - If the line starts with "INT" or "EXT", suggest a Location and Time (e.g. ". SPACE STATION - DAY").
        - If a character name is typed (usually capitalized), suggest dialogue.
        - If inside an action paragraph, complete the action vividly and concisely.
        - Use standard screenplay format (all caps for slugs/characters).
        
        Input Text:
        "${context}"
        
        Task:
        Provide ONLY the completion text (suffix). Do not repeat the input. Do not wrap in quotes.
        Keep it short (fragment or single sentence).
        
        Completion:`;

        const response = await ai.models.generateContent({
            model: MODELS.TEXT_FAST, 
            contents: prompt,
            config: {
                maxOutputTokens: 40, // Keep it very short for autocomplete
                stopSequences: ["\n\n"], // Stop at paragraph breaks
                temperature: 0.3, // Low temp for predictable formatting
            }
        });

        return response.text || "";
    } catch (e) {
        // Silent fail for auto-complete
        return "";
    }
}

/**
 * Generate Concise Summary
 */
export const generateSummary = async (text: string): Promise<string> => {
    const ai = createAI();
    try {
        const prompt = `Summarize the following description into a concise 1-2 sentence overview for a production asset header.
        Input: "${text}"`;

        const response = await retryWithBackoff(async () => {
            return await ai.models.generateContent({
                model: MODELS.TEXT_FAST,
                contents: prompt,
            });
        });

        return response.text || text.substring(0, 100) + "...";
    } catch (e) {
        console.error("Summary Gen Error", e);
        // Fallback to simple truncation
        return text.length > 100 ? text.substring(0, 100) + "..." : text;
    }
}

/**
 * Enhance Description for Assets - Returns 3 Options
 */
export const generateEnhancementOptions = async (currentText: string, type: string): Promise<string[]> => {
    const ai = createAI();
    try {
        const prompt = `Generate 3 distinct, enhanced versions of the following description for a film production asset of type "${type}". 
        
        1. A concise, punchy version.
        2. A highly detailed, visual version suitable for image generation.
        3. A creative, moody version that captures the atmosphere.

        Input: "${currentText}"`;

        const response = await retryWithBackoff(async () => {
             return await ai.models.generateContent({
                model: MODELS.TEXT_FAST,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.STRING
                        }
                    }
                }
            });
        });

        const json = JSON.parse(response.text || "[]");
        if (Array.isArray(json) && json.length > 0) {
            return json;
        }
        return [currentText];
    } catch (e) {
        console.error("Enhance Error", e);
        return [currentText]; // Fallback to original
    }
}

// Keep backward compatibility for other calls if necessary, though we switch to options now.
export const enhanceDescription = async (currentText: string, type: string): Promise<string> => {
    const options = await generateEnhancementOptions(currentText, type);
    return options[0] || currentText;
}

/**
 * Generate Project Seeds (Ideas)
 */
export const generateStorySeeds = async (userPrompt: string): Promise<StorySeed[]> => {
    const ai = createAI();
    try {
        const prompt = `Generate 4 distinct, creative, and pitch-ready story concepts for a movie or tv series.
        
        ${userPrompt ? `Theme/Constraint: "${userPrompt}"` : 'Theme: Surprise me with diverse genres (Sci-Fi, Drama, Comedy, Thriller).'}

        For each concept provide:
        1. Title: Catchy and professional.
        2. Logline: A compelling one-sentence summary.
        3. Genre: The primary genre.
        4. Visual Style: A description of the aesthetic (e.g., "Neon Noir", "Gritty Realism 70s").
        `;

        const response = await retryWithBackoff(async () => {
            return await ai.models.generateContent({
                model: MODELS.TEXT_FAST, // Fast model for quick brainstorming
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                title: { type: Type.STRING },
                                logline: { type: Type.STRING },
                                genre: { type: Type.STRING },
                                visualStyle: { type: Type.STRING }
                            }
                        }
                    }
                }
            });
        });

        return JSON.parse(response.text || "[]");
    } catch (e) {
        console.error("Story Seed Gen Error", e);
        return [];
    }
}

/**
 * Extract Characters from Script
 */
export const extractCharactersFromScript = async (scriptText: string): Promise<CharacterProfile[]> => {
    const ai = createAI();
    try {
        const prompt = `Analyze the following script/story text and extract a list of main characters.
        Ignore minor background characters with no lines or significant presence.
        For each character, provide:
        1. Name
        2. Description (Physical appearance, age, vibe, personality key traits)
        3. Role (e.g., Protagonist, Antagonist, Supporting, Mentor)

        Input Text:
        "${scriptText.slice(0, 200000)}" 
        `; // Slice to be safe, though Flash supports 1M

        const response = await retryWithBackoff(async () => {
            return await ai.models.generateContent({
                model: MODELS.TEXT_FAST,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                name: { type: Type.STRING },
                                description: { type: Type.STRING },
                                role: { type: Type.STRING }
                            }
                        }
                    }
                }
            });
        });

        const json = JSON.parse(response.text || "[]");
        return json;
    } catch (e) {
        console.error("Character Extraction Error", e);
        return [];
    }
}

/**
 * Extract Locations/Sets from Script
 */
export const extractLocationsFromScript = async (scriptText: string): Promise<LocationProfile[]> => {
    const ai = createAI();
    try {
        const prompt = `Analyze the following script/story text and extract a list of unique locations/sets.
        Merge similar locations (e.g. "Kitchen" and "John's Kitchen" if they are the same).
        
        Input Text:
        "${scriptText.slice(0, 200000)}" 
        `; 

        const response = await retryWithBackoff(async () => {
            return await ai.models.generateContent({
                model: MODELS.TEXT_FAST,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                name: { type: Type.STRING },
                                description: { type: Type.STRING, description: "Visual description of the environment, lighting, and mood." },
                                type: { type: Type.STRING, description: "INT or EXT" }
                            }
                        }
                    }
                }
            });
        });

        return JSON.parse(response.text || "[]");
    } catch (e) {
        console.error("Location Extraction Error", e);
        return [];
    }
}

/**
 * Extract Story Elements (Scenes/Beats) from Script
 */
export const extractStoryElementsFromScript = async (scriptText: string, knownCharacters?: string[]): Promise<StoryElement[]> => {
    const ai = createAI();
    try {
        let prompt = `Analyze the following script/story text and extract key story beats or scenes.
        
        Detailed Requirements:
        1. Flush out the scene description significantly. Include action, location, mood, and key interactions.
        2. If you identify characters from this list: [${knownCharacters?.join(', ')}], you MUST reference them using the format @CharacterName (e.g. "@Zax walks in").
        3. Identify the type: "Scene", "Sequence", or "Plot Point".

        Input Text:
        "${scriptText.slice(0, 200000)}" 
        `; 

        const response = await retryWithBackoff(async () => {
            return await ai.models.generateContent({
                model: MODELS.TEXT_FAST,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                title: { type: Type.STRING, description: "Scene Heading or Beat Title" },
                                description: { type: Type.STRING, description: "Detailed description with @Character references" },
                                type: { type: Type.STRING, description: "Scene, Plot Point, or Theme" }
                            }
                        }
                    }
                }
            });
        });

        return JSON.parse(response.text || "[]");
    } catch (e) {
        console.error("Story Extraction Error", e);
        return [];
    }
}

/**
 * Extract Shots from a Scene
 */
export const extractShotsFromScene = async (sceneText: string, knownCharacters?: string[]): Promise<StoryElement[]> => {
    const ai = createAI();
    try {
        const prompt = `Act as a Cinematographer. Break down the following scene description into a shot list.
        
        Detailed Requirements:
        1. For each shot, provide a Title MUST start with the shot number (e.g., "Shot 1: Wide Establish").
        2. Do NOT use the '@' symbol in the Title (e.g. use "Shot 1: Zax's Revenge", NOT "Shot 1: @Zax's Revenge").
        3. If you identify characters from this list: [${knownCharacters?.join(', ')}], you MUST reference them in the description using the format @CharacterName (e.g. "@Zax looks up").
        4. Type should be "Shot".

        Input Scene:
        "${sceneText}"
        `;

        const response = await retryWithBackoff(async () => {
            return await ai.models.generateContent({
                model: MODELS.TEXT_FAST,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                title: { type: Type.STRING },
                                description: { type: Type.STRING },
                                type: { type: Type.STRING }
                            }
                        }
                    }
                }
            });
        });

        return JSON.parse(response.text || "[]");
    } catch (e) {
        console.error("Shot Extraction Error", e);
        return [];
    }
}


/**
 * Image Generation (Supports Gemini 3 Pro, Flash, and Imagen)
 */
export const generateImage = async (
  prompt: string,
  aspectRatio: string = "16:9",
  model: string = MODELS.IMAGE_GEN,
  referenceImages?: string[] // Optional Array of Base64 or URL
): Promise<string> => {
  
  const win = window as unknown as AIStudioWindow;
  
  // Initial API Key Check
  if (win.aistudio) {
     const hasKey = await win.aistudio.hasSelectedApiKey();
     if (!hasKey) {
         await win.aistudio.openSelectKey();
     }
  }

  const makeRequest = async () => {
      const ai = createAI();
      
      // IMAGEN 4 Routing
      if (model.includes('imagen')) {
           // Imagen doesn't support 'referenceImages' in the same way as Gemini multimodal
           // So we ignore it here or could implement a different endpoint if available.
           const response = await ai.models.generateImages({
                model: model,
                prompt: prompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/jpeg',
                    aspectRatio: aspectRatio,
                }
           });
           const base64EncodeString = response.generatedImages?.[0]?.image?.imageBytes;
           if (base64EncodeString) {
               return `data:image/jpeg;base64,${base64EncodeString}`;
           }
           throw new Error("No image generated from Imagen");
      } 
      
      // GEMINI Routing
      else {
          // Construct config based on model capabilities
          const imageConfig: any = {
              aspectRatio: aspectRatio,
          };
          
          const config: any = {
              imageConfig: imageConfig
          };

          // Only add imageSize for the Pro model (Nano Banana does not support it)
          if (model === 'gemini-3-pro-image-preview') {
              imageConfig.imageSize = "1K";
          }
          
          // Force IMAGE modality for Flash Image to prevent chatty responses
          if (model === 'gemini-2.5-flash-image') {
              config.responseModalities = [Modality.IMAGE];
          }

          // Build Parts
          const parts: any[] = [];
          
          // Add Reference Images if provided (and valid)
          if (referenceImages && referenceImages.length > 0) {
              referenceImages.forEach(img => {
                  const cleanBase64 = img.includes(',') ? img.split(',')[1] : img;
                  // Detect MIME or default to png
                  let mimeType = "image/png";
                  if (img.startsWith("data:image/jpeg")) mimeType = "image/jpeg";
                  if (img.startsWith("data:image/webp")) mimeType = "image/webp";

                  parts.push({
                      inlineData: {
                          mimeType: mimeType,
                          data: cleanBase64
                      }
                  });
              });
          }

          parts.push({ text: prompt });

          const response = await ai.models.generateContent({
            model: model,
            contents: {
              parts: parts
            },
            config: config
          });

          const responseParts = response.candidates?.[0]?.content?.parts;
          if (responseParts) {
              for (const part of responseParts) {
                  if (part.inlineData && part.inlineData.data) {
                       return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
                  }
              }
              
              // Fallback: Look for refusal text to provide better error info
              const textPart = responseParts.find(p => p.text);
              if (textPart?.text) {
                  // Clean up error message for UI
                  let msg = textPart.text;
                  if (msg.length < 200 && (msg.toLowerCase().includes("here is") || msg.toLowerCase().includes("updated image"))) {
                       msg = `Model generated text instead of image: "${msg}". Retrying...`;
                  }
                  throw new Error(`Generation Error: ${msg}`);
              }
          }
          throw new Error("No image generated from Gemini (Empty response)");
      }
  };

  try {
    return await makeRequest();
  } catch (e: any) {
    console.error("Image Gen Error", e);
    // Retry on Permission Denied (403) or Not Found (404) by prompting for key
    if ((e.status === 403 || e.status === 404 || e.message?.includes('PERMISSION_DENIED')) && win.aistudio) {
        console.log("Permission denied. Re-prompting for API Key...");
        await win.aistudio.openSelectKey();
        return await makeRequest();
    }
    throw e;
  }
};

/**
 * Image Editing (Nano Banana / Gemini 2.5 Flash Image)
 */
export const editImage = async (
  imageBase64: string,
  prompt: string
): Promise<string> => {
  const ai = createAI();
  // Strip header if present for the API call
  const cleanBase64 = imageBase64.split(",")[1] || imageBase64;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.IMAGE_EDIT, // Nano Banana
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: "image/png", // Assuming PNG/JPEG compatibility
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (part && part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("No edited image returned");
  } catch (e) {
    console.error("Image Edit Error", e);
    throw e;
  }
};

/**
 * Video Generation (Veo 3.1)
 */
export const generateVideo = async (
  prompt: string,
  aspectRatio: "16:9" | "9:16" = "16:9",
  imageInput?: string, // Start Frame
  model: string = MODELS.VIDEO_FAST,
  duration?: string | number,
  withAudio?: boolean,
  lastFrameInput?: string, // End Frame (optional)
  onProgress?: (msg: string) => void
): Promise<string> => {
    
  const win = window as unknown as AIStudioWindow;
  if (win.aistudio) {
     const hasKey = await win.aistudio.hasSelectedApiKey();
     if (!hasKey) {
         await win.aistudio.openSelectKey();
     }
  }

  const makeRequest = async () => {
      const ai = createAI(); 
      let operation;

      // Determine Resolution based on Duration rules
      // Veo typically requires 8s for 1080p, otherwise 720p is safer for shorter clips
      let resolution = '1080p';
      const durationVal = duration ? (typeof duration === 'string' ? parseInt(duration) : duration) : undefined;
      
      if (durationVal && durationVal < 8) {
          resolution = '720p';
      }
      
      const commonConfig: any = {
          numberOfVideos: 1,
          resolution: resolution,
          aspectRatio: aspectRatio
      };

      // Map prompt/config based on user input for duration/audio
      if (duration) {
          commonConfig.durationSeconds = durationVal;
      }
      
      // Handle Last Frame (Seamless loop capability)
      if (lastFrameInput) {
          const cleanLast = lastFrameInput.split(",")[1] || lastFrameInput;
          commonConfig.lastFrame = {
              imageBytes: cleanLast,
              mimeType: 'image/png'
          };
      }

      if (imageInput) {
          const cleanBase64 = imageInput.split(",")[1] || imageInput;
          operation = await ai.models.generateVideos({
              model: model,
              prompt: prompt || "Animate this image",
              image: {
                  imageBytes: cleanBase64,
                  mimeType: 'image/png' 
              },
              config: commonConfig
          });
      } else {
          operation = await ai.models.generateVideos({
              model: model,
              prompt: prompt,
              config: commonConfig
          });
      }
      
      if (onProgress) onProgress("Generation started...");

      // Polling
      let attempts = 0;
      while (!operation.done) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          operation = await ai.operations.getVideosOperation({ operation });
          
          attempts++;
          if (onProgress) {
             // Check metadata if available, otherwise just count dots
             const dots = ".".repeat((attempts % 4) + 1);
             const status = operation.metadata?.state || "PROCESSING";
             onProgress(`${status}${dots}`);
          }
      }
      
      if (onProgress) onProgress("Finalizing...");

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!downloadLink) throw new Error("No video URI returned");

      // Fetch actual bytes
      const res = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
      const blob = await res.blob();
      return URL.createObjectURL(blob);
  };

  try {
      return await makeRequest();
  } catch (e: any) {
    console.error("Video Gen Error", e);
    if ((e.status === 403 || e.status === 404 || e.message?.includes('PERMISSION_DENIED')) && win.aistudio) {
        console.log("Permission denied. Re-prompting for API Key...");
        await win.aistudio.openSelectKey();
        return await makeRequest();
    }
    throw e;
  }
};

/**
 * Chat Bot Helper
 */
export const sendChatMessage = async (history: {role: string, parts: {text: string}[]}[], newMessage: string) => {
    const ai = createAI();
    const chat = ai.chats.create({
        model: MODELS.TEXT_PRO,
        history: history,
        config: {
            systemInstruction: CHAT_SYSTEM_INSTRUCTION
        }
    });
    
    const result = await chat.sendMessage({ message: newMessage });
    return result.text;
}
