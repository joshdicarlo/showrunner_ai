
import { DepartmentType } from "./types";

export const DEPARTMENTS = [
  { id: DepartmentType.WRITERS_ROOM, icon: "PenTool", color: "text-blue-400", assetLabel: "Script" },
  { id: DepartmentType.CASTING_WARDROBE, icon: "Users", color: "text-purple-400", assetLabel: "Actor" },
  { id: DepartmentType.STORY, icon: "BookOpen", color: "text-yellow-400", assetLabel: "Scene" },
  { id: DepartmentType.SET_DESIGN, icon: "Layout", color: "text-green-400", assetLabel: "Location" },
  { id: DepartmentType.PRODUCTION, icon: "Camera", color: "text-red-500", assetLabel: "Shot List" },
  { id: DepartmentType.EDITORIAL, icon: "Scissors", color: "text-indigo-400", assetLabel: "Sequence" },
  { id: DepartmentType.POST_PRODUCTION, icon: "Film", color: "text-pink-400", assetLabel: "Effect" },
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

### APPLICATION CONTEXT
- **Google Drive Integration**: The app now supports saving projects to Google Drive. It creates a "Showrunner-AI" folder with subfolders for Project, Scripts, Cast, Sets, Story, and Production. A Google Sheet is used as a database.
- **Scaling Fix**: Node text now scales crisply when zooming out.
`;
