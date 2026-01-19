
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

--- IMAGE & VIDEO (Always included) ---
Visual: [Static scene composition - describe as if frozen in a painting. Character positions, poses, expressions, spatial relationships. Use @Character for FIRST mention of any known character. Example: @Knight kneels before the throne, head bowed, sword laid flat across both palms. The King looms above, one hand raised.]
Set: [Setting, atmosphere, location. Use @Set if applicable. Example: A cavernous throne room at dusk, dust motes drifting through shafts of golden light. @Throne_Room]
Lighting: [Mood, time of day, light sources. Example: Dramatic side-lighting, warm amber tones from tall windows.]
Camera: [Shot type, angle, lens. Example: Low angle, medium shot, 35mm anamorphic.]
Style: [Visual style, film reference, color palette. Example: Cinematic, Ridley Scott epic, desaturated palette.]

--- VIDEO ONLY (Stripped for image generation) ---
Action: [What happens over time - movement, changes. Example: Knight slowly rises, grips sword hilt, turns to face the approaching enemy.]
Camera_Motion: [Camera movement during shot. Example: Slow dolly in. Or: Static.]
Dialogue: [Spoken lines, max 8 seconds. Example: (KNIGHT) "I accept your charge." Leave blank if none.]
Audio: [Music, sound effects. Example: Swelling orchestral tension, armor clanking. Leave blank if none.]

IMPORTANT SYNTAX RULES:
1. KEYS (e.g. Visual, Action) must NEVER contain '@'.
2. CHARACTERS (STRICT ENFORCEMENT): 
   - Scan the scene for ALL characters present.
   - For EACH character, find their FIRST occurrence in any field (Visual, Action, Dialogue, etc).
   - You MUST prefix that FIRST occurrence with '@' (e.g., "@Zax").
   - Do NOT use '@' for any subsequent mentions of that same character in the same shot.
   - Failure to use '@' on the first mention will break the visualization pipeline.
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
            // Enhanced error checking for various error structures
            const status = error.status || error.code || error?.error?.code || error?.error?.status;
            const message = error.message || error?.error?.message || '';
            
            const isRateLimit = status === 429 || 
                                status === 'RESOURCE_EXHAUSTED' ||
                                (typeof message === 'string' && (
                                    message.includes('429') ||
                                    message.includes('quota') ||
                                    message.includes('RESOURCE_EXHAUSTED')
                                ));
            
            if (isRateLimit && i < retries - 1) {
                console.warn(`Rate limit hit (Attempt ${i + 1}/${retries}). Retrying in ${currentDelay}ms...`);
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
    return await retryWithBackoff(async () => {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction,
          },
        });
        return response.text || "No text generated.";
    });
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

        // No retry for autocomplete to keep it snappy, if it fails, it fails silently
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

        const parsed = JSON.parse(response.text || "[]");
        // Add IDs to seeds
        return parsed.map((seed: any, idx: number) => ({
            ...seed,
            id: `seed-${Date.now()}-${idx}`
        }));
    } catch (e) {
        console.error("Story Seed Gen Error", e);
        return [];
    }
}

/**
 * Refine a Story Seed based on user modification request
 */
export const refineSeed = async (
    parentSeed: StorySeed, 
    refinementPrompt: string
): Promise<StorySeed | null> => {
    const ai = createAI();
    try {
        const prompt = `You are refining an existing story concept based on user feedback.

ORIGINAL CONCEPT:
Title: ${parentSeed.title}
Genre: ${parentSeed.genre}
Logline: ${parentSeed.logline}
Visual Style: ${parentSeed.visualStyle}

USER MODIFICATION REQUEST: "${refinementPrompt}"

Create a refined version of this concept that incorporates the user's request while maintaining coherence.
The refinement should feel like a natural evolution of the original idea.
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
                            title: { type: Type.STRING },
                            logline: { type: Type.STRING },
                            genre: { type: Type.STRING },
                            visualStyle: { type: Type.STRING }
                        }
                    }
                }
            });
        });

        const parsed = JSON.parse(response.text || "{}");
        return {
            ...parsed,
            id: `seed-${Date.now()}-refined`,
            parentId: parentSeed.id,
            refinementPrompt
        };
    } catch (e) {
        console.error("Seed Refinement Error", e);
        return null;
    }
};

/**
 * Enhance a project description into multiple detailed options
 */
export const enhanceProjectDescription = async (description: string): Promise<string[]> => {
    const ai = createAI();
    try {
        const prompt = `Take this brief project description and expand it into 4 different compelling, detailed logline/pitch variations.
        
        Each variation should:
        - Be 2-3 sentences max
        - Add specific details, stakes, and hook
        - Take a slightly different creative angle
        - Be suitable as a movie/TV pitch
        
        Brief Description: "${description}"
        `;

        const response = await retryWithBackoff(async () => {
            return await ai.models.generateContent({
                model: MODELS.TEXT_FAST,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    }
                }
            });
        });

        return JSON.parse(response.text || "[]");
    } catch (e) {
        console.error("Enhance Description Error", e);
        return [];
    }
};

/**
 * Generate Beat Sheet from story concept
 */
export const generateBeatSheet = async (
    title: string,
    genre: string,
    logline: string
): Promise<string> => {
    const ai = createAI();
    try {
        const prompt = `Write a detailed beat sheet for a ${genre} film/series called "${title}".

Logline: ${logline}

Use the Save The Cat! beat sheet structure:
1. Opening Image
2. Theme Stated
3. Set-Up
4. Catalyst
5. Debate
6. Break into Two
7. B Story
8. Fun and Games
9. Midpoint
10. Bad Guys Close In
11. All Is Lost
12. Dark Night of the Soul
13. Break into Three
14. Finale
15. Final Image

For each beat, provide:
- The beat name
- 2-3 sentences describing what happens
- Key emotional moments or reveals

Make it compelling and specific to this story.

IMPORTANT: Output ONLY the beat sheet content. Do NOT include any preamble, introduction, or meta-commentary like "Here is a beat sheet..." or "I've created...". Start directly with the first beat.
`;

        return await retryWithBackoff(async () => {
            const response = await ai.models.generateContent({
                model: MODELS.TEXT_PRO,
                contents: prompt,
                config: {
                    systemInstruction: "You are an expert screenwriter and story structure consultant."
                }
            });
            return response.text || "Failed to generate beat sheet.";
        });
    } catch (e) {
        console.error("Beat Sheet Generation Error", e);
        throw e;
    }
};

/**
 * Generate Outline from Beat Sheet
 * Converts high-level Save The Cat! beats into a detailed scene-by-scene outline
 */
export const generateOutlineFromBeatSheet = async (
    title: string,
    genre: string,
    beatSheet: string
): Promise<string> => {
    const ai = createAI();
    try {
        const prompt = `You are a professional story consultant. Your task is to convert a high-level beat sheet into a detailed scene-by-scene outline for a ${genre} titled "${title}".

BEAT SHEET:
${beatSheet}

IMPORTANT: A beat sheet is NOT a scene-by-scene outline. It's a high-level structural framework. Your job is to expand it.

Create a detailed outline with the following:

1. **Act Structure**: Clearly divide into Act 1, Act 2A, Act 2B, and Act 3
2. **Sequences**: Group related scenes into sequences (5-8 sequences total)
3. **Scene Breakdown**: For each sequence, list 3-8 specific scenes with:
   - Scene number and heading (INT./EXT. LOCATION - TIME)
   - 2-3 sentences describing the action and character beats
   - Key emotional moments or reveals
   - Page count estimate

Format Example:
---
**ACT 1 (Pages 1-25)**

**Sequence 1: The Ordinary World (Pages 1-10)**

1. INT. APARTMENT - MORNING (Pages 1-3)
   Description of what happens, character introductions, establishing the status quo.
   
2. EXT. CITY STREET - DAY (Pages 3-5)
   Next scene description...

---

Make this outline detailed enough that a screenwriter could write the actual script from it. Include character names, key dialogue moments (paraphrased, not full dialogue), and emotional arcs.

The outline should cover the full story, approximately 90-120 pages of eventual script.

IMPORTANT: Output ONLY the scene outline content. Do NOT include any preamble, introduction, or meta-commentary like "Here is an outline..." or "I've created...". Start directly with ACT 1.
`;

        return await retryWithBackoff(async () => {
            const response = await ai.models.generateContent({
                model: MODELS.TEXT_PRO,
                contents: prompt,
                config: {
                    systemInstruction: "You are an expert story structure consultant who creates detailed scene-by-scene outlines from beat sheets."
                }
            });
            return response.text || "Failed to generate outline.";
        });
    } catch (e) {
        console.error("Outline Generation Error", e);
        throw e;
    }
};

/**
 * Generate Script from Outline
 * Takes a detailed scene-by-scene outline and writes actual screenplay pages
 */
export const generateScriptFromOutline = async (
    title: string,
    genre: string,
    outline: string,
    section: 'opening' | 'act2' | 'climax' | 'ending' = 'opening'
): Promise<string> => {
    const ai = createAI();
    try {
        const sectionDescriptions = {
            opening: { name: "Act 1 / Opening Sequence", pages: "the first 10-15 pages", focus: "Introduce the protagonist, establish the ordinary world, and present the inciting incident" },
            act2: { name: "Act 2A / Rising Action", pages: "pages 15-45", focus: "The protagonist pursues their goal, faces obstacles, and develops relationships" },
            climax: { name: "Midpoint / Climax", pages: "pages 45-75", focus: "Major revelation or setback, raising the stakes" },
            ending: { name: "Act 3 / Resolution", pages: "the final 15-25 pages", focus: "Final confrontation, resolution, and character transformation" }
        };

        const sectionInfo = sectionDescriptions[section];

        const prompt = `You are an award-winning screenwriter. Write ${sectionInfo.pages} of a screenplay for "${title}" (${genre}).

DETAILED OUTLINE:
${outline}

INSTRUCTIONS:
- Write **${sectionInfo.name}** based on the outline above
- Focus on: ${sectionInfo.focus}
- Use PROPER SCREENPLAY FORMAT:
  • Scene headings: INT./EXT. LOCATION - TIME (all caps, left-aligned)
  • Action lines: Present tense, concise, visual descriptions (left-aligned)
  • Character names: ALL CAPS above dialogue (centered)
  • Dialogue: Natural, character-driven (centered, under character name)
  • Parentheticals: Minimal, only when essential (centered in parentheses)
  • Transitions: Only when necessary (CUT TO:, FADE TO:, etc.)

- CRITICAL SCREENPLAY RULES:
  • Show, don't tell - write only what we SEE and HEAR
  • Keep action lines punchy (3-4 lines max per paragraph)
  • White space is your friend - don't write dense blocks
  • Each scene should have a clear purpose
  • Character introductions should be in CAPS first time only

- STORYTELLING FOCUS:
  • Visual storytelling - every line should be filmable
  • Strong character voices in dialogue
  • Proper pacing and rhythm
  • Emotional beats land clearly
  • Genre conventions respected

Write professional, shootable screenplay pages. This should read like a script ready for production.

CRITICAL: Output ONLY the screenplay content in proper format. Do NOT include any preamble, introduction, or meta-commentary like "Here is the script..." or "I've written...". Start directly with the first scene heading or FADE IN.
`;

        return await retryWithBackoff(async () => {
            const response = await ai.models.generateContent({
                model: MODELS.TEXT_PRO,
                contents: prompt,
                config: {
                    systemInstruction: "You are a professional screenwriter with multiple produced credits. Write only in proper screenplay format. Every line must be visual and filmable. Never write prose or novel-style descriptions."
                }
            });
            return response.text || "Failed to generate script.";
        });
    } catch (e) {
        console.error("Script Generation Error", e);
        throw e;
    }
};

/**
 * Legacy function for backwards compatibility
 * Now internally uses the outline step
 */
export const generateScriptFromBeatSheet = async (
    title: string,
    genre: string,
    beatSheet: string,
    sceneType: 'opening' | 'climax' | 'ending' = 'opening'
): Promise<string> => {
    // First generate outline from beat sheet
    const outline = await generateOutlineFromBeatSheet(title, genre, beatSheet);
    
    // Map old sceneType to new section parameter
    const sectionMap: Record<typeof sceneType, 'opening' | 'act2' | 'climax' | 'ending'> = {
        opening: 'opening',
        climax: 'climax',
        ending: 'ending'
    };
    
    // Then generate script from outline
    return await generateScriptFromOutline(title, genre, outline, sectionMap[sceneType]);
};

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
 * ONE SHOT BREAKDOWN: Extracts Everything (with streaming thinking output)
 */
export const extractOneShotBreakdown = async (
    scriptText: string,
    onThinkingUpdate?: (thinking: string) => void
): Promise<{ characters: any[], locations: LocationProfile[], scenes: StoryElement[] }> => {
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
           - GROUPING STRATEGY: Consolidate the script into substantial Sequences. Do NOT create tiny scenes with only 2-4 shots. A typical Sequence should be comprehensive and contain many shots (aim for 10+ shots per sequence unless the location changes drastically).
           - Scene Description: Detailed action using @CharacterName.
           - Shot Description MUST use this MANDATORY YAML Structure:
           ${SHOT_PROMPT_TEMPLATE}
           - Best Practices: Specificity, Framing, 100-150 words.
           - RULE: Do not use @CharacterName in YAML KEYS. Use it only in VALUES.
           - RULE: For EVERY character in a shot, use @Name for the FIRST mention, and just Name for subsequent mentions.
        
        Input Script:
        "${scriptText.slice(0, 200000)}"
        `;

        // Use streaming to capture thinking/progress
        const stream = await ai.models.generateContentStream({
            model: MODELS.TEXT_FAST,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                thinkingConfig: {
                    thinkingBudget: 8000,
                    includeThoughts: true
                },
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

        let fullText = '';
        let thinkingText = '';
        
        for await (const chunk of stream) {
            // Debug log to see chunk structure
            console.log('[OneShot Stream] Chunk:', JSON.stringify(chunk, null, 2));
            
            // Check for thinking content in the chunk
            if (chunk.candidates?.[0]?.content?.parts) {
                for (const part of chunk.candidates[0].content.parts) {
                    console.log('[OneShot Stream] Part:', JSON.stringify(part, null, 2));
                    if (!part.text) continue;
                    
                    if (part.thought) {
                        // part.thought is a boolean, content is in part.text
                        // Prepend new content so latest appears at top
                        thinkingText = part.text + thinkingText;
                        onThinkingUpdate?.(thinkingText);
                    } else {
                        fullText += part.text;
                    }
                }
            }
        }

        return JSON.parse(fullText || "{}");
    } catch (e) {
        console.error("One Shot Extraction Error", e);
        return { characters: [], locations: [], scenes: [] };
    }
}

/**
 * Image Generation (Imagen / Gemini)
 */
export const generateImage = async (
    prompt: string,
    aspectRatio: string = "16:9",
    model: string = MODELS.IMAGE_GEN,
    referenceImages: string[] = []
): Promise<string> => {
    const ai = createAI();
    console.log(`[Gemini Service] Generating Image (${model}):`, prompt.substring(0, 50));
    try {
        return await retryWithBackoff(async () => {
            if (model.includes('imagen')) {
                 const response = await ai.models.generateImages({
                    model,
                    prompt,
                    config: {
                        numberOfImages: 1,
                        aspectRatio: aspectRatio,
                        outputMimeType: 'image/jpeg'
                    }
                });
                const b64 = response.generatedImages?.[0]?.image?.imageBytes;
                return b64 ? `data:image/jpeg;base64,${b64}` : "";
            } else {
                // Gemini Image Gen
                const parts: any[] = [];
                referenceImages.forEach(img => {
                    const match = img.match(/^data:(.+);base64,(.+)$/);
                    if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
                });
                parts.push({ text: prompt });

                const response = await ai.models.generateContent({
                    model,
                    contents: { parts },
                    config: {
                        imageConfig: {
                             aspectRatio: aspectRatio,
                             imageSize: model.includes('pro') ? "2K" : "1K"
                         }
                    }
                });
                
                // Extract from parts
                if (response.candidates?.[0]?.content?.parts) {
                    for (const part of response.candidates[0].content.parts) {
                        if (part.inlineData) {
                            console.log(`[Gemini Service] Image Generation Successful`);
                            return `data:image/png;base64,${part.inlineData.data}`;
                        }
                    }
                }
                console.warn(`[Gemini Service] No Inline Data found in response`);
                return "";
            }
        });
    } catch (e) {
        console.error("Image Gen Error", e);
        throw e;
    }
}

/**
 * Image Editing (Nano Banana)
 */
export const editImage = async (imageBase64: string, prompt: string): Promise<string> => {
    const ai = createAI();
    try {
        const match = imageBase64.match(/^data:(.+);base64,(.+)$/);
        if (!match) throw new Error("Invalid Image Data");

        return await retryWithBackoff(async () => {
            const response = await ai.models.generateContent({
                model: MODELS.IMAGE_EDIT,
                contents: {
                    parts: [
                        { inlineData: { mimeType: match[1], data: match[2] } },
                        { text: prompt }
                    ]
                }
            });
            
            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        return `data:image/png;base64,${part.inlineData.data}`;
                    }
                }
            }
            return "";
        });
    } catch (e) {
        console.error("Image Edit Error", e);
        throw e;
    }
}

/**
 * Video Generation (Veo)
 */
export const generateVideo = async (
    prompt: string,
    aspectRatio: "16:9" | "9:16",
    imageBase64: string | undefined,
    model: string,
    duration: string = "5",
    withAudio: boolean = false,
    lastFrameImageBase64?: string,
    onProgress?: (msg: string, percent: number) => void
): Promise<string> => {
    const ai = createAI();
    
    const req: any = {
        model,
        prompt,
        config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio
        }
    };

    if (imageBase64) {
        const match = imageBase64.match(/^data:(.+);base64,(.+)$/);
        if (match) req.image = { mimeType: match[1], imageBytes: match[2] };
    }
    
    if (lastFrameImageBase64) {
        const match = lastFrameImageBase64.match(/^data:(.+);base64,(.+)$/);
        if (match) req.config.lastFrame = { mimeType: match[1], imageBytes: match[2] };
    }

    try {
        if (onProgress) onProgress("Submitting...", 5);
        let operation: any;
        
        // Wrap the submission part with retry logic
        await retryWithBackoff(async () => {
            operation = await ai.models.generateVideos(req);
        });
        
        if (onProgress) onProgress("Processing...", 10);
        let checks = 0;
        
        // Polling logic typically doesn't rate limit in the same way, but fetching the operation could.
        // We wrap the polling operation call too just in case.
        while (!operation.done) {
            await new Promise(r => setTimeout(r, 5000)); // Poll every 5s
            checks++;
            const percent = Math.min(10 + (checks * 5), 95); 
            if (onProgress) onProgress("Processing...", percent);
            
            await retryWithBackoff(async () => {
                operation = await ai.operations.getVideosOperation({ operation });
            });
        }
        
        if (onProgress) onProgress("Finalizing...", 100);
        const video = operation.response?.generatedVideos?.[0]?.video;
        if (video?.uri) {
            const separator = video.uri.includes('?') ? '&' : '?';
            return `${video.uri}${separator}key=${process.env.API_KEY}`;
        }
        return "";
    } catch (e) {
        console.error("Video Gen Error", e);
        throw e;
    }
}

/**
 * Chat Bot Message
 */
export const sendChatMessage = async (history: {role: string, parts: {text: string}[]}[], message: string): Promise<string> => {
    const ai = createAI();
    const chat = ai.chats.create({
        model: MODELS.TEXT_FAST,
        config: { systemInstruction: CHAT_SYSTEM_INSTRUCTION },
        history
    });
    
    // Wrap message sending
    const result = await retryWithBackoff(async () => {
        return await chat.sendMessage({ message });
    });
    return result.text || "";
}

/**
 * Shot Discovery from Text
 */
export const extractShotsFromScene = async (text: string, knownCharacters: string[] = []): Promise<any[]> => {
    const ai = createAI();
    const prompt = `Analyze the scene and break it down into shots.
    Characters: ${knownCharacters.join(', ')}
    
    Input: "${text.slice(0, 50000)}"`;
    
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
                            description: { type: Type.STRING }
                        }
                    }
                }
            }
        });
    });
    return JSON.parse(response.text || "[]");
}
