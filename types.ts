

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
  status?: 'draft' | 'generating' | 'approved' | 'review' | 'archived';
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
    title: string;
    logline: string;
    genre: string;
    visualStyle: string;
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
    status: 'pending' | 'processing' | 'completed' | 'failed';
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
    };
    submittedPrompt?: string; // The resolved prompt used for generation
    onComplete?: (result: string, task: RenderTask) => void;
}

export interface OneShotItem {
    id: string;
    type: 'Character' | 'Location' | 'Scene' | 'Shot';
    name: string;
    description: string;
    parentId?: string; // For Shots belonging to Scenes
    selected: boolean;
    autoGenerate: boolean;
    autoApprove: boolean;
    isExisting?: boolean; // If matching asset found
    children?: OneShotItem[];
}
