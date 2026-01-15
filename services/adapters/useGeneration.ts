/**
 * useGeneration Hook
 * 
 * React hook for image and video generation operations.
 * Provides state management and progress tracking for generation UI components.
 */

import { useState, useCallback, useRef } from 'react';
import {
    generateImage,
    generateVideo,
    editImage,
    ImageGenerationOptions,
    VideoGenerationOptions,
    GenerationResult
} from '../generationService';
import { ProjectAsset, ProjectSettings } from '../../types';

// --- Types ---

export interface GenerationTask {
    id: string;
    type: 'image' | 'video' | 'edit';
    prompt: string;
    status: 'pending' | 'generating' | 'complete' | 'error';
    progress: number;
    progressMessage: string;
    result?: GenerationResult;
    error?: string;
    startedAt?: number;
    completedAt?: number;
}

export interface UseGenerationState {
    /** Current active task */
    currentTask: GenerationTask | null;
    /** Whether a generation is in progress */
    isGenerating: boolean;
    /** History of completed tasks */
    taskHistory: GenerationTask[];
}

export interface GenerationContext {
    projectAssets?: ProjectAsset[];
    activeAsset?: ProjectAsset;
    projectSettings?: ProjectSettings;
    refinedImagesMap?: Record<string, string[]>;
    approvedImagesMap?: Record<string, string[]>;
    assetThumbnails?: Record<string, string>;
}

export interface UseGenerationActions {
    /** Generate an image */
    generateImageAsync: (
        prompt: string,
        options?: Partial<ImageGenerationOptions>,
        context?: GenerationContext
    ) => Promise<GenerationResult>;
    
    /** Generate a video */
    generateVideoAsync: (
        prompt: string,
        startImage: string,
        options?: Partial<VideoGenerationOptions>
    ) => Promise<GenerationResult>;
    
    /** Edit an existing image */
    editImageAsync: (
        imageUrl: string,
        prompt: string,
        context?: GenerationContext
    ) => Promise<GenerationResult>;
    
    /** Cancel current generation (if supported) */
    cancel: () => void;
    
    /** Clear task history */
    clearHistory: () => void;
}

export interface UseGenerationReturn extends UseGenerationState, UseGenerationActions {}

// --- Hook ---

export const useGeneration = (): UseGenerationReturn => {
    const [currentTask, setCurrentTask] = useState<GenerationTask | null>(null);
    const [taskHistory, setTaskHistory] = useState<GenerationTask[]>([]);
    const cancelledRef = useRef(false);
    const taskIdRef = useRef(0);

    const createTask = useCallback((type: 'image' | 'video' | 'edit', prompt: string): GenerationTask => {
        taskIdRef.current += 1;
        return {
            id: `task-${taskIdRef.current}-${Date.now()}`,
            type,
            prompt,
            status: 'pending',
            progress: 0,
            progressMessage: 'Starting...',
            startedAt: Date.now()
        };
    }, []);

    const updateTask = useCallback((updates: Partial<GenerationTask>) => {
        setCurrentTask(prev => prev ? { ...prev, ...updates } : null);
    }, []);

    const completeTask = useCallback((result: GenerationResult) => {
        setCurrentTask(prev => {
            if (!prev) return null;
            const completed: GenerationTask = {
                ...prev,
                status: 'complete',
                progress: 100,
                progressMessage: 'Complete',
                result,
                completedAt: Date.now()
            };
            setTaskHistory(history => [completed, ...history].slice(0, 50)); // Keep last 50
            return null;
        });
    }, []);

    const failTask = useCallback((error: string) => {
        setCurrentTask(prev => {
            if (!prev) return null;
            const failed: GenerationTask = {
                ...prev,
                status: 'error',
                error,
                completedAt: Date.now()
            };
            setTaskHistory(history => [failed, ...history].slice(0, 50));
            return null;
        });
    }, []);

    const generateImageAsync = useCallback(async (
        prompt: string,
        options?: Partial<ImageGenerationOptions>,
        context?: GenerationContext
    ): Promise<GenerationResult> => {
        cancelledRef.current = false;
        const task = createTask('image', prompt);
        setCurrentTask({ ...task, status: 'generating' });

        try {
            updateTask({ progressMessage: 'Generating image...' });
            
            const result = await generateImage({
                prompt,
                ...options,
                projectAssets: context?.projectAssets,
                activeAsset: context?.activeAsset,
                projectSettings: context?.projectSettings,
                refinedImagesMap: context?.refinedImagesMap,
                approvedImagesMap: context?.approvedImagesMap,
                assetThumbnails: context?.assetThumbnails
            });

            if (cancelledRef.current) {
                throw new Error('Generation cancelled');
            }

            completeTask(result);
            return result;
        } catch (e: any) {
            const errorMsg = e.message || 'Image generation failed';
            failTask(errorMsg);
            throw e;
        }
    }, [createTask, updateTask, completeTask, failTask]);

    const generateVideoAsync = useCallback(async (
        prompt: string,
        startImage: string,
        options?: Partial<VideoGenerationOptions>
    ): Promise<GenerationResult> => {
        cancelledRef.current = false;
        const task = createTask('video', prompt);
        setCurrentTask({ ...task, status: 'generating' });

        try {
            const result = await generateVideo({
                prompt,
                startImage,
                ...options,
                onProgress: (message, percent) => {
                    if (!cancelledRef.current) {
                        updateTask({
                            progress: percent,
                            progressMessage: message
                        });
                    }
                }
            });

            if (cancelledRef.current) {
                throw new Error('Generation cancelled');
            }

            completeTask(result);
            return result;
        } catch (e: any) {
            const errorMsg = e.message || 'Video generation failed';
            failTask(errorMsg);
            throw e;
        }
    }, [createTask, updateTask, completeTask, failTask]);

    const editImageAsync = useCallback(async (
        imageUrl: string,
        prompt: string,
        context?: GenerationContext
    ): Promise<GenerationResult> => {
        cancelledRef.current = false;
        const task = createTask('edit', prompt);
        setCurrentTask({ ...task, status: 'generating' });

        try {
            updateTask({ progressMessage: 'Editing image...' });
            
            const result = await editImage(imageUrl, prompt, {
                projectAssets: context?.projectAssets,
                activeAsset: context?.activeAsset,
                projectSettings: context?.projectSettings
            });

            if (cancelledRef.current) {
                throw new Error('Edit cancelled');
            }

            completeTask(result);
            return result;
        } catch (e: any) {
            const errorMsg = e.message || 'Image edit failed';
            failTask(errorMsg);
            throw e;
        }
    }, [createTask, updateTask, completeTask, failTask]);

    const cancel = useCallback(() => {
        cancelledRef.current = true;
        setCurrentTask(null);
    }, []);

    const clearHistory = useCallback(() => {
        setTaskHistory([]);
    }, []);

    return {
        // State
        currentTask,
        isGenerating: currentTask?.status === 'generating',
        taskHistory,
        // Actions
        generateImageAsync,
        generateVideoAsync,
        editImageAsync,
        cancel,
        clearHistory
    };
};

export default useGeneration;
