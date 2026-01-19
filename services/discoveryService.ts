/**
 * Discovery Service
 * 
 * Unified service for extracting characters, locations, and scenes from scripts.
 * Supports streaming thinking output for all discovery modes.
 * 
 * This replaces the fragmented extraction functions:
 * - extractCharactersFromScript
 * - extractLocationsFromScript  
 * - extractStoryElementsFromScript
 * - extractOneShotBreakdown
 * 
 * Uses the geminiClient from the API layer for all AI operations.
 */

import { getGeminiClient, Type } from "./api";
import { MODELS } from "../constants";

// --- Types ---

export interface CharacterResult {
    name: string;
    description: string;
    summary: string;
    role: string;
}

export interface LocationResult {
    name: string;
    description: string;
    type: string;
}

export interface ShotResult {
    title: string;
    description: string;
    type: string;
}

export interface SceneResult {
    title: string;
    description: string;
    type: string;
    shots?: ShotResult[];
}

export interface DiscoveryResult {
    characters: CharacterResult[];
    locations: LocationResult[];
    scenes: SceneResult[];
}

export interface DiscoveryOptions {
    /** Extract character profiles */
    extractCharacters?: boolean;
    /** Extract location/set profiles */
    extractLocations?: boolean;
    /** Extract scene breakdowns */
    extractScenes?: boolean;
    /** Include shot breakdowns within scenes (only applies if extractScenes is true) */
    includeShots?: boolean;
    /** Known character names to reference in scene extraction */
    knownCharacters?: string[];
    /** Callback for streaming thinking/reasoning output */
    onThinkingUpdate?: (thinking: string) => void;
    /** Callback for progress updates */
    onProgress?: (stage: string, percent: number) => void;
}

// --- Prompt Templates ---

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

// --- Schema Builders ---

const buildCharacterSchema = () => ({
    type: Type.OBJECT,
    properties: {
        name: { type: Type.STRING },
        description: { type: Type.STRING, description: "Natural Language Paragraph Prompt" },
        summary: { type: Type.STRING, description: "One concise sentence summary max" },
        role: { type: Type.STRING }
    }
});

const buildLocationSchema = () => ({
    type: Type.OBJECT,
    properties: {
        name: { type: Type.STRING },
        description: { type: Type.STRING },
        type: { type: Type.STRING }
    }
});

const buildShotSchema = () => ({
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING, description: "Structured YAML Prompt" },
        type: { type: Type.STRING }
    }
});

const buildSceneSchema = (includeShots: boolean) => ({
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        type: { type: Type.STRING },
        ...(includeShots ? {
            shots: {
                type: Type.ARRAY,
                items: buildShotSchema()
            }
        } : {})
    }
});

const buildResponseSchema = (options: DiscoveryOptions) => {
    const properties: any = {};
    
    if (options.extractCharacters) {
        properties.characters = {
            type: Type.ARRAY,
            items: buildCharacterSchema()
        };
    }
    
    if (options.extractLocations) {
        properties.locations = {
            type: Type.ARRAY,
            items: buildLocationSchema()
        };
    }
    
    if (options.extractScenes) {
        properties.scenes = {
            type: Type.ARRAY,
            items: buildSceneSchema(options.includeShots ?? false)
        };
    }
    
    return {
        type: Type.OBJECT,
        properties
    };
};

// --- Prompt Builder ---

const buildPrompt = (scriptText: string, options: DiscoveryOptions): string => {
    const sections: string[] = [];
    
    sections.push("You are a professional breakdown artist. Analyze the following script/story text and extract the requested elements.");
    sections.push("");
    sections.push("REQUIREMENTS:");
    sections.push("");
    
    if (options.extractCharacters) {
        sections.push(`1. CHARACTERS:
   - Extract main characters only (ignore minor background characters)
   - Description MUST use this MANDATORY NATURAL LANGUAGE PARAGRAPH format:
   ${CHARACTER_PROMPT_TEMPLATE}
   - Provide a 'summary' field (1 short sentence) for the character header.
   - Include a 'role' field (protagonist, antagonist, supporting, etc.)
`);
    }
    
    if (options.extractLocations) {
        sections.push(`2. LOCATIONS:
   - Extract unique locations/sets from the script
   - Merge similar locations (e.g. "Kitchen" and "John's Kitchen" if they are the same)
   - Description MUST be a visual generative prompt (Architecture, Lighting, Era, Atmosphere)
   - Include a 'type' field (interior, exterior, both)
`);
    }
    
    if (options.extractScenes) {
        const knownCharsNote = options.knownCharacters?.length 
            ? `\n   - Known characters to reference: ${options.knownCharacters.join(', ')}`
            : '';
            
        sections.push(`3. SCENES${options.includeShots ? ' & SHOTS' : ''}:
   - GROUPING STRATEGY: Consolidate the script into substantial Sequences. Do NOT create tiny scenes with only 2-4 shots. A typical Sequence should be comprehensive and contain many shots (aim for 10+ shots per sequence unless the location changes drastically).
   - Scene Description: Detailed action summary${knownCharsNote}
   - Include a 'type' field for each scene (action, dialogue, montage, etc.)${options.includeShots ? `
   - Shot Description MUST use this MANDATORY YAML Structure:
   ${SHOT_PROMPT_TEMPLATE}
   - Best Practices: Specificity, Framing, 100-150 words per shot.
   - RULE: Do not use @CharacterName in YAML KEYS. Use it only in VALUES.
   - RULE: For EVERY character in a shot, use @Name for the FIRST mention, and just Name for subsequent mentions.` : ''}
`);
    }
    
    sections.push(`Input Script:
"${scriptText.slice(0, 200000)}"
`);
    
    return sections.join('\n');
};

// --- Main Discovery Function ---

/**
 * Unified discovery function for extracting elements from scripts.
 * 
 * @param scriptText - The script/story text to analyze
 * @param options - Configuration for what to extract and callbacks
 * @returns Promise<DiscoveryResult> - Extracted elements
 * 
 * @example
 * // Extract only characters with streaming thinking
 * const result = await discoverFromScript(script, {
 *   extractCharacters: true,
 *   onThinkingUpdate: (thinking) => setThinkingText(thinking)
 * });
 * 
 * @example
 * // Full breakdown (One Shot mode)
 * const result = await discoverFromScript(script, {
 *   extractCharacters: true,
 *   extractLocations: true,
 *   extractScenes: true,
 *   includeShots: true,
 *   onThinkingUpdate: (thinking) => setThinkingText(thinking)
 * });
 */
export const discoverFromScript = async (
    scriptText: string,
    options: DiscoveryOptions = {}
): Promise<DiscoveryResult> => {
    const client = getGeminiClient();
    
    // Default to extracting everything if nothing specified
    const opts: DiscoveryOptions = {
        extractCharacters: options.extractCharacters ?? false,
        extractLocations: options.extractLocations ?? false,
        extractScenes: options.extractScenes ?? false,
        includeShots: options.includeShots ?? false,
        knownCharacters: options.knownCharacters,
        onThinkingUpdate: options.onThinkingUpdate,
        onProgress: options.onProgress
    };
    
    // Validate at least one extraction type is requested
    if (!opts.extractCharacters && !opts.extractLocations && !opts.extractScenes) {
        console.warn("[DiscoveryService] No extraction types specified, defaulting to all");
        opts.extractCharacters = true;
        opts.extractLocations = true;
        opts.extractScenes = true;
    }
    
    const prompt = buildPrompt(scriptText, opts);
    const schema = buildResponseSchema(opts);
    
    console.log("[DiscoveryService] Starting discovery with options:", {
        characters: opts.extractCharacters,
        locations: opts.extractLocations,
        scenes: opts.extractScenes,
        shots: opts.includeShots,
        hasThinkingCallback: !!opts.onThinkingUpdate
    });
    
    try {
        opts.onProgress?.("Initializing AI analysis...", 0);
        
        // Use streaming with the new client API
        const result = await client.generateTextStream(prompt, {
            model: MODELS.TEXT_FAST,
            responseMimeType: "application/json",
            responseSchema: schema,
            thinkingBudget: 8000,
            includeThoughts: true,
            onThought: (thinking) => {
                opts.onThinkingUpdate?.(thinking);
            }
        });

        opts.onProgress?.("Processing results...", 90);
        
        const parsed = JSON.parse(result.text || "{}");
        
        opts.onProgress?.("Complete", 100);
        
        console.log("[DiscoveryService] Discovery complete:", {
            characters: parsed.characters?.length ?? 0,
            locations: parsed.locations?.length ?? 0,
            scenes: parsed.scenes?.length ?? 0
        });
        
        return {
            characters: parsed.characters ?? [],
            locations: parsed.locations ?? [],
            scenes: parsed.scenes ?? []
        };
        
    } catch (e) {
        console.error("[DiscoveryService] Discovery Error:", e);
        return {
            characters: [],
            locations: [],
            scenes: []
        };
    }
};

// --- Convenience Wrappers ---

/**
 * Extract only characters from a script
 * Returns just the characters array for convenience
 */
export const discoverCharacters = async (
    scriptText: string,
    onThinkingUpdate?: (thinking: string) => void
): Promise<CharacterResult[]> => {
    const result = await discoverFromScript(scriptText, {
        extractCharacters: true,
        onThinkingUpdate
    });
    return result.characters;
};

/**
 * Extract only locations from a script
 * Returns just the locations array for convenience
 */
export const discoverLocations = async (
    scriptText: string,
    onThinkingUpdate?: (thinking: string) => void
): Promise<LocationResult[]> => {
    const result = await discoverFromScript(scriptText, {
        extractLocations: true,
        onThinkingUpdate
    });
    return result.locations;
};

/**
 * Extract only scenes (with optional shots) from a script
 * Returns just the scenes array for convenience
 */
export const discoverScenes = async (
    scriptText: string,
    includeShots: boolean = false,
    knownCharacters?: string[],
    onThinkingUpdate?: (thinking: string) => void
): Promise<SceneResult[]> => {
    const result = await discoverFromScript(scriptText, {
        extractScenes: true,
        includeShots,
        knownCharacters,
        onThinkingUpdate
    });
    return result.scenes;
};

/**
 * Full breakdown - characters, locations, scenes with shots
 * (Equivalent to One Shot Discovery)
 */
export const discoverAll = async (
    scriptText: string,
    options?: {
        onThinking?: (thinking: string) => void;
    }
): Promise<DiscoveryResult> => {
    return discoverFromScript(scriptText, {
        extractCharacters: true,
        extractLocations: true,
        extractScenes: true,
        includeShots: true,
        onThinkingUpdate: options?.onThinking
    });
};
