
import { DepartmentType, ProjectSettings, VisualStyle } from "./types";

export const DEPARTMENTS = [
  { id: DepartmentType.WRITERS_ROOM, icon: "PenTool", color: "text-blue-400", assetLabel: "Script" },
  { id: DepartmentType.CASTING_WARDROBE, icon: "Users", color: "text-purple-400", assetLabel: "Actor" },
  { id: DepartmentType.SET_DESIGN, icon: "Mountain", color: "text-green-400", assetLabel: "Location" },
  { id: DepartmentType.STORY, icon: "BookOpen", color: "text-yellow-400", assetLabel: "Scene" },
  { id: DepartmentType.PRODUCTION, icon: "Camera", color: "text-red-500", assetLabel: "Shot List" },
  { id: DepartmentType.POST_PRODUCTION, icon: "Film", color: "text-pink-400", assetLabel: "Effect" },
  { id: DepartmentType.EDITORIAL, icon: "Scissors", color: "text-indigo-400", assetLabel: "Sequence" },
];

export const MODELS = {
  TEXT_FAST: "gemini-2.5-flash",
  TEXT_PRO: "gemini-3-pro-preview",
  IMAGE_GEN: "gemini-3-pro-image-preview", // Default high quality
  IMAGE_EDIT: "gemini-2.5-flash-image", // Nano Banana
  VIDEO_FAST: "veo-3.1-fast-generate-preview",
  VIDEO_HQ: "veo-3.1-generate-preview",
};

export const IMAGE_MODELS_OPTIONS = [
    { value: "gemini-3-pro-image-preview", label: "Gemini 3 Pro (High Quality)" },
    { value: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash (Fast)" },
    { value: "imagen-4.0-generate-001", label: "Imagen 4" },
];

export const VIDEO_MODELS_OPTIONS = [
    { value: "veo-3.1-fast-generate-preview", label: "Veo Fast (Preview)" },
    { value: "veo-3.1-generate-preview", label: "Veo High Quality" },
];

export const VIDEO_MODEL_CAPABILITIES: Record<string, { durations: string[], supportsAudio: boolean, supportsLastFrame: boolean }> = {
    "veo-3.1-fast-generate-preview": {
        durations: ["4", "6", "8"],
        supportsAudio: false, // Typically fast preview might not prioritize audio
        supportsLastFrame: true
    },
    "veo-3.1-generate-preview": {
        durations: ["4", "6", "8"],
        supportsAudio: true, // High quality typically supports audio
        supportsLastFrame: true
    }
};

export const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"];

// TODO: Replace with your actual Google Cloud Console Client ID
export const GOOGLE_CLIENT_ID = "306389866844-g9eb91opf4rk3fvlc1b7uooklto6cng4.apps.googleusercontent.com"; 

export const CHAT_SYSTEM_INSTRUCTION = `You are the expert AI assistant embedded within "ShowrunnerAI", a professional node-based creative workflow app.

### APP USAGE & CONTEXT
- **Goal**: Help users build stories, create assets, and manage production workflows.
- **Reference System**: Explain that users can reference characters using \`@CharacterName\` (e.g., \`@Zax\`) in prompts to auto-inject their visual descriptions.
- **Visual Styles**: Explain that users can use \`@style:key\` to apply consistent looks (e.g. \`@style:cinematic\`).
- **Shot Creation**: To create shots, users should go to the **Production** department, select a Sequence/Scene (or create one), and click "Add Child" or "Find Shots" to generate a shot list.
- **Navigation**: The sidebar creates different contexts (Writers Room, Casting, Story, Production).
- **Google Drive**: The app autosaves to Drive if connected.

### SCRIPT CONTEXT
You have access to the current script and story outlines (provided in the prompt context). Use this to answer questions like "What is Zax doing in this scene?" or "Describe the location."

### TONE
Professional, creative, and helpful. Use film industry terminology (e.g., "blocking," "coverage," "beat sheet," "concept art").
`;

export const DEFAULT_STYLES: VisualStyle[] = [
    { 
        id: 'style-cinematic', 
        label: 'Cinematic', 
        value: 'cinematic', 
        prompt: 'high budget film aesthetic, arri alexa, anamorphic lens, shallow depth of field, dramatic lighting, color graded, 8k, highly detailed texture', 
        isSystem: true 
    },
    { 
        id: 'style-cyberpunk', 
        label: 'Cyberpunk', 
        value: 'cyberpunk', 
        prompt: 'high-contrast realism with cool desaturated tones, green-teal color bias, deep shadows, sharp minimalist geometry, neon accents, dramatic rim lighting, atmospheric haze', 
        isSystem: true 
    },
    { 
        id: 'style-pixar', 
        label: '3D Animation', 
        value: 'pixar', 
        prompt: 'high-end 3D rendering, soft global illumination, warm cinematic lighting, vibrant but controlled color palette, clean silhouettes, subsurface scattering, physically based rendering', 
        isSystem: true 
    },
    { 
        id: 'style-anime', 
        label: 'Anime', 
        value: 'anime', 
        prompt: 'high fidelity cel-shaded aesthetic, detailed backgrounds, vibrant colors, clean lines, atmospheric lighting, makoto shinkai style lighting', 
        isSystem: true 
    },
    { 
        id: 'style-noir', 
        label: 'Film Noir', 
        value: 'noir', 
        prompt: 'black and white photography, high contrast, chiaroscuro lighting, film grain, vintage lens artifacts, mysterious atmosphere, low key lighting', 
        isSystem: true 
    }
];

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
    defaultStyleId: 'style-cinematic',
    styles: DEFAULT_STYLES,
    assetConfigs: {
        [DepartmentType.CASTING_WARDROBE]: { hiddenPrompt: "full body shot, neutral background, consistent lighting" },
        [DepartmentType.SET_DESIGN]: { hiddenPrompt: "wide shot, establishing shot, detailed environment, architectural visualization" },
        [DepartmentType.PRODUCTION]: { hiddenPrompt: "" }
    }
};
