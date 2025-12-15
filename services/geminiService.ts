
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

// --- MANDATORY PROMPT TEMPLATES ---

const SHOT_PROMPT_TEMPLATE = `
### SHOT PROMPT TEMPLATE (MANDATORY STRUCTURE)

Action: [What is happening? Rule: The FIRST mention of ANY character in this shot must use @Name. Subsequent mentions of the same character must use just Name.]
Environment_Context: [Where are they? Example: At dawn, with floating islands in the background.]
Camera: [Shot type, angle, movement, style. Example: Aerial shot, cinematic style, 35mm.]
Lighting: [Mood, time of day, atmosphere. Example: Dramatic lighting, epic mood, ethereal lights.]
Audio_Cues: [Specific music or sounds. Example: Subtle squelching sounds of fruit being crushed.]
Dialogue: [Short spoken lines, max 8 seconds. Example: (KNIGHT) "The journey ends here."]
Set: [The primary @Set reference. Example: @Mist_Forest_Set]

IMPORTANT SYNTAX RULES:
1. KEYS (e.g. Action) must NEVER contain '@'.
2. CHARACTERS: 
   - Scan the scene for ALL characters present.
   - For EACH character, find their FIRST occurrence in any field (Action, Dialogue, etc).
   - Prefix ONLY that FIRST occurrence with '@'.
   - Do NOT use '@' for any subsequent mentions of that same character.
`;

const CHARACTER_PROMPT_TEMPLATE = `
### CHARACTER PROMPT TEMPLATE (MANDATORY NATURAL LANGUAGE PARAGRAPH)

[Name/Archetype], [Visual Description Paragraph]

Instructions:
- Start with the Name or Archetype.
- Follow with a rich, descriptive paragraph focusing on core visuals, attire, key gear, and unique features.
- Do not use technical camera terms or style constraints here.
- Keep it flowing and natural.
- CRITICAL: Do NOT include the character's name in the description paragraph. We might rename them later. Focus only on their visual appearance.

Example:
ELYSIA, A young female mercenary appearing in her late twenties. She has a gaunt but strong build, notable for the sharp, synthetic silver tattoo covering her left eye. She wears a deep indigo, high-collared trench coat layered over dark leather armor, with a rusted pocket watch chained to her waist. Her most defining feature is a glowing, crystalline staff that emits soft purple smoke, which she carries always.
`;

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
    shots?: StoryElement[]; // Nested shots
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
        const prompt = `Summarize the following description into a single, concise sentence (max 20 words) suitable for a UI header.
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
        Ignore minor background characters.

        IMPORTANT: The 'description' field MUST use the following MANDATORY NATURAL LANGUAGE PARAGRAPH format.
        Fill in specific details based on the script content.

        ${CHARACTER_PROMPT_TEMPLATE}
        
        Best Practices for Description:
        - Specificity: Avoid generic details; focus on unique identifiers.
        - Consistency: The prompt must define the character consistently.
        - Visual Priority: Focus on elements that are immediately visible.

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
                                description: { type: Type.STRING, description: "Natural Language Paragraph Prompt" },
                                summary: { type: Type.STRING, description: "One concise sentence summary max" },
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
        The description must be a visual generative prompt (Lighting, Architecture, Atmosphere, Era).
        
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
                                summary: { type: Type.STRING, description: "One concise sentence summary max" },
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
export const extractStoryElementsFromScript = async (scriptText: string, knownCharacters?: string[], includeShots: boolean = false): Promise<StoryElement[]> => {
    const ai = createAI();
    try {
        let prompt = `Analyze the following script/story text and extract key story beats or scenes.
        
        Detailed Requirements:
        1. Flush out the scene description significantly. Include action, location, mood, and key interactions.
        2. If you identify characters from this list: [${knownCharacters?.join(', ')}], you MUST reference them using the format @CharacterName (e.g. "@Zax walks in") in the description.
        3. Identify the type: "Scene", "Sequence", or "Plot Point".
        4. The Title MUST NOT contain '@' symbols (e.g. use "Zax enters", NOT "@Zax enters").
        ${includeShots ? `5. For each Scene, also identify a list of "Shots". 
           Shot Descriptions MUST use the following MANDATORY YAML structure:
           
           ${SHOT_PROMPT_TEMPLATE}
           
           Best Practices for Shots:
           - Specificity: Use detailed adjectives.
           - Framing: Describe only elements visible within the frame.
           - Positive Language: Favor "include" instructions.
           - Length Constraint: Aim for 100–150 words total.` : ''}

        Input Text:
        "${scriptText.slice(0, 200000)}" 
        `; 

        const schemaProperties: any = {
            title: { type: Type.STRING, description: "Scene Heading or Beat Title (No @ symbols)" },
            description: { type: Type.STRING, description: "Detailed description with @Character references" },
            type: { type: Type.STRING, description: "Scene, Plot Point, or Theme" }
        };

        if (includeShots) {
            schemaProperties.shots = {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: "Must start with Shot X (where X is a number)" },
                        description: { type: Type.STRING, description: "Structured YAML Prompt" },
                        type: { type: Type.STRING }
                    }
                }
            };
        }

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
                            properties: schemaProperties
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
 * ONE SHOT BREAKDOWN: Extracts Everything
 */
export const extractOneShotBreakdown = async (scriptText: string): Promise<{ characters: any[], locations: LocationProfile[], scenes: StoryElement[] }> => {
    const ai = createAI();
    try {
        const prompt = `You are a breakdown artist. Analyze the script and extract Characters, Locations, and Scenes with their shots in one pass.
        
        REQUIREMENTS:
        
        1. CHARACTERS: 
           - Description MUST use this MANDATORY NATURAL LANGUAGE PARAGRAPH format:
           ${CHARACTER_PROMPT_TEMPLATE}
           - Provide a 'summary' field (1 short sentence) for the character header.
           
        2. LOCATIONS:
           - Description MUST be a visual prompt (Architecture, Lighting, Era).
           
        3. SCENES & SHOTS:
           - Scene Description: Detailed action using @CharacterName.
           - Shot Description MUST use this MANDATORY YAML Structure:
           ${SHOT_PROMPT_TEMPLATE}
           - Best Practices: Specificity, Framing, 100-150 words.
           - RULE: Do not use @CharacterName in YAML KEYS. Use it only in VALUES.
           - RULE: For EVERY character in a shot, use @Name for the FIRST mention, and just Name for subsequent mentions.
        
        Input Script:
        "${scriptText.slice(0, 200000)}"
        `;

        const response = await retryWithBackoff(async () => {
            return await ai.models.generateContent({
                model: MODELS.TEXT_FAST,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            characters: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        name: { type: Type.STRING },
                                        description: { type: Type.STRING, description: "Natural Language Paragraph Prompt" },
                                        summary: { type: Type.STRING, description: "One concise sentence summary max" },
                                        role: { type: Type.STRING }
                                    }
                                }
                            },
                            locations: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        name: { type: Type.STRING },
                                        description: { type: Type.STRING },
                                        type: { type: Type.STRING }
                                    }
                                }
                            },
                            scenes: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        title: { type: Type.STRING },
                                        description: { type: Type.STRING },
                                        type: { type: Type.STRING },
                                        shots: {
                                            type: Type.ARRAY,
                                            items: {
                                                type: Type.OBJECT,
                                                properties: {
                                                    title: { type: Type.STRING },
                                                    description: { type: Type.STRING, description: "Structured YAML Prompt" },
                                                    type: { type: Type.STRING }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
        });

        return JSON.parse(response.text || "{}");
    } catch (e) {
        console.error("One Shot Extraction Error", e);
        return { characters: [], locations: [], scenes: [] };
    }
}

/**
 * Extract Shots from Scene Text
 */
export const extractShotsFromScene = async (sceneText: string, knownCharacters: string[] = []): Promise<any[]> => {
    const ai = createAI();
    try {
        const prompt = `Analyze the following scene text and break it down into a list of individual camera shots.
        
        For each shot, provide:
        1. Title: "Shot 1", "Shot 2", etc.
        2. Description: A detailed visual description for image generation. Include camera angle, lighting, and action.
        3. Characters: List characters present.
        
        If known characters (${knownCharacters.join(', ')}) are present, refer to them as @Name.
        
        Input Scene:
        "${sceneText.slice(0, 10000)}..."`;
        
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
                                characters: { type: Type.ARRAY, items: { type: Type.STRING } }
                            }
                        }
                    }
                }
            });
        });
        
        return JSON.parse(response.text || "[]");
    } catch (e) {
        console.error("Extract Shots Error", e);
        return [];
    }
}

/**
 * Generate Image
 */
export const generateImage = async (
  prompt: string,
  aspectRatio: string = "16:9",
  model: string = MODELS.IMAGE_GEN,
  referenceImages: string[] = []
): Promise<string> => {
    const ai = createAI();

    // Imagen Models
    if (model.includes('imagen')) {
         const response = await ai.models.generateImages({
            model,
            prompt,
            config: {
                numberOfImages: 1,
                aspectRatio: aspectRatio as any,
                outputMimeType: 'image/jpeg'
            }
        });
        if (response.generatedImages?.[0]?.image?.imageBytes) {
            return `data:image/jpeg;base64,${response.generatedImages[0].image.imageBytes}`;
        }
        throw new Error("No image generated");
    }

    // Gemini Models (Nano Banana / 3 Pro Image)
    const parts: any[] = [];
    
    // Add reference images
    for (const refImg of referenceImages) {
        if (refImg.startsWith('data:')) {
             const base64Data = refImg.split(',')[1];
             const mimeType = refImg.split(';')[0].split(':')[1];
             parts.push({
                 inlineData: {
                     data: base64Data,
                     mimeType: mimeType
                 }
             });
        }
    }
    
    parts.push({ text: prompt });
    
    const imageConfig: any = {
        aspectRatio: aspectRatio as any
    };
    
    const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: {
            imageConfig
        }
    });
    
    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
        }
    }
    
    throw new Error("No image generated");
}

/**
 * Edit Image
 */
export const editImage = async (imageUrl: string, prompt: string): Promise<string> => {
    const ai = createAI();
    // Assuming base64 data uri
    const base64Data = imageUrl.split(',')[1];
    const mimeType = imageUrl.split(';')[0].split(':')[1];

    const response = await ai.models.generateContent({
        model: MODELS.IMAGE_EDIT, // gemini-2.5-flash-image
        contents: {
            parts: [
                {
                    inlineData: {
                        data: base64Data,
                        mimeType: mimeType
                    }
                },
                { text: prompt }
            ]
        }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No edited image returned");
}

/**
 * Generate Video
 */
export const generateVideo = async (
    prompt: string, 
    aspectRatio: string = "16:9", 
    image?: string, 
    model: string = MODELS.VIDEO_FAST, 
    duration?: string, 
    withAudio?: boolean,
    lastFrameImage?: string,
    onProgress?: (msg: string) => void
): Promise<string> => {
    
    // Check if user selected API key for Veo
    if ((window as any).aistudio && !await (window as any).aistudio.hasSelectedApiKey()) {
        await (window as any).aistudio.openSelectKey();
    }
    
    // Re-create AI instance to be safe as per guidelines
    const freshAI = createAI(); 

    const config: any = {
        numberOfVideos: 1,
        aspectRatio: aspectRatio as any,
    };
    
    // Resolution logic
    if (model === "veo-3.1-generate-preview") {
        config.resolution = '1080p';
    } else {
        config.resolution = '720p';
    }

    const request: any = {
        model,
        prompt,
        config
    };

    if (image) {
        const base64Data = image.split(',')[1];
        const mimeType = image.split(';')[0].split(':')[1];
        request.image = {
            imageBytes: base64Data,
            mimeType
        };
    }

    if (lastFrameImage) {
        const base64Data = lastFrameImage.split(',')[1];
        const mimeType = lastFrameImage.split(';')[0].split(':')[1];
        config.lastFrame = {
             imageBytes: base64Data,
             mimeType
        };
    }
    
    let operation = await freshAI.models.generateVideos(request);
    
    if (onProgress) onProgress("Generating video...");
    
    // Polling
    while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        if (onProgress) onProgress("Processing...");
        operation = await freshAI.operations.getVideosOperation({ operation });
    }
    
    const video = operation.response?.generatedVideos?.[0]?.video;
    if (video?.uri) {
        // Must append API key
        return `${video.uri}&key=${process.env.API_KEY}`;
    }
    
    throw new Error("Video generation failed");
}

/**
 * Send Chat Message
 */
export const sendChatMessage = async (history: {role: string, parts: {text: string}[]}[], newMessage: string): Promise<string> => {
    const ai = createAI();
    // Filter history to conform to Content type (role, parts)
    const chatHistory = history.map(h => ({
        role: h.role,
        parts: h.parts
    }));

    const chat = ai.chats.create({
        model: MODELS.TEXT_FAST,
        history: chatHistory,
        config: {
            systemInstruction: CHAT_SYSTEM_INSTRUCTION
        }
    });
    
    const result = await chat.sendMessage({ message: newMessage });
    return result.text || "";
}
