/**
 * useDiscovery Hook
 * 
 * React hook for script discovery/analysis operations.
 * Provides state management and callbacks for discovery UI components.
 */

import { useState, useCallback } from 'react';
import {
    discoverFromScript,
    discoverCharacters,
    discoverLocations,
    discoverScenes,
    discoverAll,
    DiscoveryResult,
    DiscoveryOptions,
    CharacterResult,
    LocationResult,
    SceneResult
} from '../discoveryService';

// --- Types ---

export interface UseDiscoveryState {
    /** Whether a discovery operation is in progress */
    isLoading: boolean;
    /** Current thinking/reasoning text from AI */
    thinking: string;
    /** Current progress stage */
    progressStage: string;
    /** Current progress percentage (0-100) */
    progressPercent: number;
    /** Error message if discovery failed */
    error: string | null;
    /** Discovery results */
    result: DiscoveryResult | null;
}

export interface UseDiscoveryActions {
    /** Run full discovery (characters, locations, scenes with shots) */
    runFullDiscovery: (scriptText: string) => Promise<DiscoveryResult>;
    /** Discover only characters */
    runCharacterDiscovery: (scriptText: string) => Promise<CharacterResult[]>;
    /** Discover only locations */
    runLocationDiscovery: (scriptText: string) => Promise<LocationResult[]>;
    /** Discover only scenes */
    runSceneDiscovery: (scriptText: string, includeShots?: boolean, knownCharacters?: string[]) => Promise<SceneResult[]>;
    /** Custom discovery with specific options */
    runCustomDiscovery: (scriptText: string, options: DiscoveryOptions) => Promise<DiscoveryResult>;
    /** Clear current results and state */
    reset: () => void;
}

export interface UseDiscoveryReturn extends UseDiscoveryState, UseDiscoveryActions {}

// --- Hook ---

export const useDiscovery = (): UseDiscoveryReturn => {
    const [isLoading, setIsLoading] = useState(false);
    const [thinking, setThinking] = useState('');
    const [progressStage, setProgressStage] = useState('');
    const [progressPercent, setProgressPercent] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<DiscoveryResult | null>(null);

    const handleThinkingUpdate = useCallback((text: string) => {
        setThinking(text);
    }, []);

    const handleProgressUpdate = useCallback((stage: string, percent: number) => {
        setProgressStage(stage);
        setProgressPercent(percent);
    }, []);

    const reset = useCallback(() => {
        setIsLoading(false);
        setThinking('');
        setProgressStage('');
        setProgressPercent(0);
        setError(null);
        setResult(null);
    }, []);

    const runFullDiscovery = useCallback(async (scriptText: string): Promise<DiscoveryResult> => {
        setIsLoading(true);
        setError(null);
        setThinking('');
        
        try {
            const discoveryResult = await discoverAll(scriptText, {
                onThinking: handleThinkingUpdate
            });
            setResult(discoveryResult);
            return discoveryResult;
        } catch (e: any) {
            const errorMsg = e.message || 'Discovery failed';
            setError(errorMsg);
            throw e;
        } finally {
            setIsLoading(false);
        }
    }, [handleThinkingUpdate]);

    const runCharacterDiscovery = useCallback(async (scriptText: string): Promise<CharacterResult[]> => {
        setIsLoading(true);
        setError(null);
        setThinking('');
        
        try {
            const characters = await discoverCharacters(scriptText, handleThinkingUpdate);
            setResult({ characters, locations: [], scenes: [] });
            return characters;
        } catch (e: any) {
            const errorMsg = e.message || 'Character discovery failed';
            setError(errorMsg);
            throw e;
        } finally {
            setIsLoading(false);
        }
    }, [handleThinkingUpdate]);

    const runLocationDiscovery = useCallback(async (scriptText: string): Promise<LocationResult[]> => {
        setIsLoading(true);
        setError(null);
        setThinking('');
        
        try {
            const locations = await discoverLocations(scriptText, handleThinkingUpdate);
            setResult({ characters: [], locations, scenes: [] });
            return locations;
        } catch (e: any) {
            const errorMsg = e.message || 'Location discovery failed';
            setError(errorMsg);
            throw e;
        } finally {
            setIsLoading(false);
        }
    }, [handleThinkingUpdate]);

    const runSceneDiscovery = useCallback(async (
        scriptText: string,
        includeShots = false,
        knownCharacters?: string[]
    ): Promise<SceneResult[]> => {
        setIsLoading(true);
        setError(null);
        setThinking('');
        
        try {
            const scenes = await discoverScenes(scriptText, includeShots, knownCharacters, handleThinkingUpdate);
            setResult({ characters: [], locations: [], scenes });
            return scenes;
        } catch (e: any) {
            const errorMsg = e.message || 'Scene discovery failed';
            setError(errorMsg);
            throw e;
        } finally {
            setIsLoading(false);
        }
    }, [handleThinkingUpdate]);

    const runCustomDiscovery = useCallback(async (
        scriptText: string,
        options: DiscoveryOptions
    ): Promise<DiscoveryResult> => {
        setIsLoading(true);
        setError(null);
        setThinking('');
        
        try {
            const discoveryResult = await discoverFromScript(scriptText, {
                ...options,
                onThinkingUpdate: handleThinkingUpdate,
                onProgress: handleProgressUpdate
            });
            setResult(discoveryResult);
            return discoveryResult;
        } catch (e: any) {
            const errorMsg = e.message || 'Discovery failed';
            setError(errorMsg);
            throw e;
        } finally {
            setIsLoading(false);
        }
    }, [handleThinkingUpdate, handleProgressUpdate]);

    return {
        // State
        isLoading,
        thinking,
        progressStage,
        progressPercent,
        error,
        result,
        // Actions
        runFullDiscovery,
        runCharacterDiscovery,
        runLocationDiscovery,
        runSceneDiscovery,
        runCustomDiscovery,
        reset
    };
};

export default useDiscovery;
