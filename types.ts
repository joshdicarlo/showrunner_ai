
export enum AIProvider {
  GEMINI = "gemini",
  LUMA = "luma",
}

export enum BatchType {
  STANDARD = "standard",
  PIXEL_ART = "pixel_art",
}

export type Resolution = string | number;

export enum DepartmentType {
  WRITERS_ROOM = "Writers Room",
  CASTING_WARDROBE = "Casting & Wardrobe",
  STORY = "Story",
  SET_DESIGN = "Set Design",
  PRODUCTION = "Production",
  EDITORIAL = "Editorial",
  POST_PRODUCTION = "Post Production",
}

export enum NodeType {
  TEXT_INPUT = "text_input", // Manual text
  AI_TEXT_GEN = "ai_text_gen", // Gemini Pro text
  IMAGE_UPLOAD = "image_upload", // Manual image
  AI_IMAGE_GEN = "ai_image_gen", // Imagen 4
  AI_IMAGE_EDIT = "ai_image_edit", // Nano Banana
  AI_VIDEO_GEN = "ai_video_gen", // Veo
  GROUP = "group", // Container node
}

export interface Position {
  x: number;
  y: number;
}

export interface NodeHistoryItem {
    type: 'image' | 'video' | 'text';
    content: string; // The text or URL
    prompt?: string;
    timestamp: number;
}

export interface NodeData {
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  prompt?: string;
  status?: 'pending' | 'draft' | 'generating' | 'approved' | 'review' | 'archived';
  aspectRatio?: string;
  model?: string;
  label?: string; // For groups
  collapsed?: boolean; // For groups
  driveId?: string; // Link to Google Drive file
  tag?: 'concept' | 'refinement'; // Distinguish asset types
  referenceImageUrl?: string; // Explicit reference for generation
  lastFrameImageUrl?: string; // For video generation (End frame)
  duration?: string; // Video duration in seconds
  withAudio?: boolean; // Video audio toggle
  history?: NodeHistoryItem[]; // Store previous generations
  styleId?: string; // Explicit style selection for this node
  submittedPrompt?: string; // The exact prompt used for the last generation
}

export interface FlowNode {
  id: string;
  type: NodeType;
  department: DepartmentType;
  assetId?: string; // Link to specific asset
  parentId?: string; // For grouping
  position: Position;
  data: NodeData;
  width?: number;
  height?: number;
}

export interface FlowConnection {
  id: string;
  fromNode: string;
  toNode: string;
}

export interface TimelineClip {
    id: string;
    sourceNodeId: string; // Trace back to generation node
    mediaUrl: string;
    mediaType: 'image' | 'video' | 'audio';
    start: number; // Start time in timeline (seconds)
    duration: number; // Duration in timeline (seconds)
    offset: number; // Start time in source media (trimming)
    track: number; // 0 = Video 1, 1 = Video 2, etc.
    label: string;
    thumbnail?: string;
}

export interface TimelineData {
    clips: TimelineClip[];
    duration: number; // Total timeline duration
}

export interface ProjectAsset {
  id: string;
  department: DepartmentType;
  title: string;
  description: string;
  visualStyle?: string; // Deprecated in favor of styleId, kept for legacy
  styleId?: string; // ID of the VisualStyle
  hiddenPrompt?: string; // Asset-specific hidden prompt
  overrideHiddenPrompt?: boolean; // Toggle for using asset-specific vs project default
  summary?: string;
  thumbnailUrl?: string;
  parentId?: string; // For hierarchical assets (e.g. Shots inside Sequences)
  driveId?: string; // Folder ID or File ID in Drive
  status?: 'active' | 'archived';
  timelineData?: TimelineData; // For Editorial Sequences
}

// --- New Settings Types ---

export interface VisualStyle {
    id: string;
    label: string; // e.g., "Cyberpunk"
    value: string; // e.g., "cyberpunk" (key for @style:key)
    prompt: string; // The expansion text
    isSystem?: boolean;
}

export interface AssetTypeConfig {
    hiddenPrompt: string;
    defaultStyleId?: string; // Optional override for this department
}

export interface ProjectSettings {
    defaultStyleId?: string;
    styles: VisualStyle[];
    assetConfigs: Partial<Record<DepartmentType, AssetTypeConfig>>;
    concurrentGenerations?: number;
}

export interface Project {
  id: string;
  title: string;
  summary: string;
  type: 'Series' | 'Feature' | 'Short';
  assets: ProjectAsset[];
  nodes: FlowNode[];
  connections: FlowConnection[];
  updatedAt: Date;
  driveFolderId?: string; // Root folder for this project in Drive
  driveDbId?: string; // Sheet ID
  settings: ProjectSettings; // New settings container
}

export interface StorySeed {
    id: string;
    title: string;
    logline: string;
    genre: string;
    visualStyle: string;
    parentId?: string; // For refinements - links to parent seed
    refinementPrompt?: string; // The prompt used to refine this from parent
}

export interface GeminiConfig {
    model: string;
    systemInstruction?: string;
}

export interface DriveConfig {
    clientId: string;
    scope: string;
}

// --- Render Queue Types ---
export interface RenderTask {
    id: string;
    type: 'image' | 'video';
    prompt: string;
    assetId: string;
    // Added 'waiting' status for dependency management, 'stopped' for user cancellation
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'waiting' | 'stopped';
    progress?: number; // 0-100
    result?: string;
    error?: string;
    config?: {
        model?: string;
        aspectRatio?: string;
        count?: number;
        autoApprove?: boolean;
        autoAssemble?: boolean;
        sequenceId?: string; // For auto-assemble targeting
        styleId?: string;
        replaceClipId?: string; // For "Generate Video and Replace"
        targetNodeId?: string; // ID of the existing node to update (avoids duplicates)
    };
    submittedPrompt?: string; // The resolved prompt used for generation
    startImage?: string; // Start frame for video
    
    // Batch & Dependency Fields
    batchId?: string; // Group ID
    batchLabel?: string; // Human readable group label
    waitingOnBatchId?: string; // Dependency ID
    
    onComplete?: (result: string, task: RenderTask) => void;
}

export interface OneShotItem {
    id: string;
    type: 'Character' | 'Location' | 'Scene' | 'Shot';
    name: string;
    description: string;
    summary?: string; // AI generated summary for header
    parentId?: string; // For Shots belonging to Scenes
    selected: boolean;
    autoGenerate: boolean;
    autoApprove: boolean;
    isExisting?: boolean; // If matching asset found
    children?: OneShotItem[];
    model?: string;
}
