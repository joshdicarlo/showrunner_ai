
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

export interface ProjectAsset {
  id: string;
  department: DepartmentType;
  title: string;
  description: string;
  visualStyle?: string;
  summary?: string;
  thumbnailUrl?: string;
  parentId?: string; // For hierarchical assets (e.g. Shots inside Sequences)
  driveId?: string; // Folder ID or File ID in Drive
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
