/**
 * Settings Store
 * 
 * Zustand store for managing application settings:
 * - API keys and credentials
 * - User preferences
 * - Generation defaults
 * 
 * Uses persist middleware for localStorage persistence.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AIProvider, ModelDefaults } from '../types';

// ============================================================================
// Types
// ============================================================================

interface ApiKeys {
    geminiApiKey: string;
    lumaApiKey: string;
}

interface GenerationDefaults {
    defaultProvider: AIProvider;
    defaultImageModel: string;
    defaultVideoModel: string;
    defaultAspectRatio: string;
    concurrentGenerations: number;
    autoApprove: boolean;
    modelDefaults: ModelDefaults; // Default models for different generation types
}

interface UserPreferences {
    theme: 'light' | 'dark' | 'system';
    showTutorialHints: boolean;
    autoSave: boolean;
    autoSaveInterval: number; // seconds
    confirmBeforeDelete: boolean;
}

interface DriveSettings {
    isConnected: boolean;
    userEmail: string | null;
    accessToken: string | null;
    tokenExpiry: number | null;
}

interface SettingsState {
    // State
    apiKeys: ApiKeys;
    generationDefaults: GenerationDefaults;
    preferences: UserPreferences;
    driveSettings: DriveSettings;
    
    // API Key actions
    setApiKey: (provider: keyof ApiKeys, key: string) => void;
    setApiKeys: (keys: Partial<ApiKeys>) => void;
    hasApiKey: (provider: keyof ApiKeys) => boolean;
    
    // Generation defaults actions
    setGenerationDefault: <K extends keyof GenerationDefaults>(
        key: K, 
        value: GenerationDefaults[K]
    ) => void;
    setGenerationDefaults: (defaults: Partial<GenerationDefaults>) => void;
    
    // Preference actions
    setPreference: <K extends keyof UserPreferences>(
        key: K, 
        value: UserPreferences[K]
    ) => void;
    setPreferences: (prefs: Partial<UserPreferences>) => void;
    
    // Drive settings actions
    setDriveConnected: (
        isConnected: boolean, 
        userEmail?: string | null,
        accessToken?: string | null,
        tokenExpiry?: number | null
    ) => void;
    clearDriveConnection: () => void;
    isDriveTokenValid: () => boolean;
    
    // Bulk operations
    resetToDefaults: () => void;
    exportSettings: () => string;
    importSettings: (json: string) => boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_API_KEYS: ApiKeys = {
    geminiApiKey: '',
    lumaApiKey: '',
};

const DEFAULT_GENERATION_DEFAULTS: GenerationDefaults = {
    defaultProvider: AIProvider.GEMINI,
    defaultImageModel: 'imagen-4.0-generate-preview-05-20',
    defaultVideoModel: 'veo-2.0-generate-001',
    defaultAspectRatio: '16:9',
    concurrentGenerations: 3,
    autoApprove: false,
    modelDefaults: {
        image: 'luma-photon-1', // Luma
        video: 'luma-ray-2', // Luma Ray 3 (using ray-2 as latest available)
        refineCharacter: 'gemini-3-pro-image-preview', // Gemini 3 Pro
        turntable: 'luma-ray-2', // Luma Ray 3
        editImage: 'gemini-3-pro-image-preview', // Gemini 3 Pro (Nano Banana)
    },
};

const DEFAULT_PREFERENCES: UserPreferences = {
    theme: 'dark',
    showTutorialHints: true,
    autoSave: true,
    autoSaveInterval: 30,
    confirmBeforeDelete: true,
};

const DEFAULT_DRIVE_SETTINGS: DriveSettings = {
    isConnected: false,
    userEmail: null,
    accessToken: null,
    tokenExpiry: null,
};

// ============================================================================
// Store
// ============================================================================

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set, get) => ({
            // Initial state
            apiKeys: DEFAULT_API_KEYS,
            generationDefaults: DEFAULT_GENERATION_DEFAULTS,
            preferences: DEFAULT_PREFERENCES,
            driveSettings: DEFAULT_DRIVE_SETTINGS,
            
            // ================================================================
            // API Key Actions
            // ================================================================
            
            setApiKey: (provider, key) => set(state => ({
                apiKeys: { ...state.apiKeys, [provider]: key }
            })),
            
            setApiKeys: (keys) => set(state => ({
                apiKeys: { ...state.apiKeys, ...keys }
            })),
            
            hasApiKey: (provider) => {
                const { apiKeys } = get();
                return !!apiKeys[provider] && apiKeys[provider].length > 0;
            },
            
            // ================================================================
            // Generation Defaults Actions
            // ================================================================
            
            setGenerationDefault: (key, value) => set(state => ({
                generationDefaults: { ...state.generationDefaults, [key]: value }
            })),
            
            setGenerationDefaults: (defaults) => set(state => ({
                generationDefaults: { ...state.generationDefaults, ...defaults }
            })),
            
            // ================================================================
            // Preference Actions
            // ================================================================
            
            setPreference: (key, value) => set(state => ({
                preferences: { ...state.preferences, [key]: value }
            })),
            
            setPreferences: (prefs) => set(state => ({
                preferences: { ...state.preferences, ...prefs }
            })),
            
            // ================================================================
            // Drive Settings Actions
            // ================================================================
            
            setDriveConnected: (isConnected, userEmail = null, accessToken = null, tokenExpiry = null) => 
                set({ 
                    driveSettings: { 
                        isConnected, 
                        userEmail, 
                        accessToken,
                        tokenExpiry 
                    } 
                }),
            
            clearDriveConnection: () => set({ 
                driveSettings: DEFAULT_DRIVE_SETTINGS 
            }),
            
            isDriveTokenValid: () => {
                const { driveSettings } = get();
                if (!driveSettings.isConnected || !driveSettings.tokenExpiry) {
                    return false;
                }
                return Date.now() < driveSettings.tokenExpiry;
            },
            
            // ================================================================
            // Bulk Operations
            // ================================================================
            
            resetToDefaults: () => set({
                apiKeys: DEFAULT_API_KEYS,
                generationDefaults: DEFAULT_GENERATION_DEFAULTS,
                preferences: DEFAULT_PREFERENCES,
                // Note: Not resetting drive settings as that requires re-auth
            }),
            
            exportSettings: () => {
                const { apiKeys, generationDefaults, preferences } = get();
                return JSON.stringify({
                    apiKeys,
                    generationDefaults,
                    preferences,
                }, null, 2);
            },
            
            importSettings: (json) => {
                try {
                    const parsed = JSON.parse(json);
                    set(state => ({
                        apiKeys: { ...state.apiKeys, ...parsed.apiKeys },
                        generationDefaults: { ...state.generationDefaults, ...parsed.generationDefaults },
                        preferences: { ...state.preferences, ...parsed.preferences },
                    }));
                    return true;
                } catch (e) {
                    console.error('Failed to import settings:', e);
                    return false;
                }
            },
        }),
        {
            name: 'showrunner-settings',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                apiKeys: state.apiKeys,
                generationDefaults: state.generationDefaults,
                preferences: state.preferences,
                driveSettings: state.driveSettings,
            }),
        }
    )
);

// ============================================================================
// Selector Hooks
// ============================================================================

export const useApiKeys = () => useSettingsStore(state => state.apiKeys);
export const useGenerationDefaults = () => useSettingsStore(state => state.generationDefaults);
export const usePreferences = () => useSettingsStore(state => state.preferences);
export const useDriveSettings = () => useSettingsStore(state => state.driveSettings);

// Individual selectors
export const useGeminiApiKey = () => useSettingsStore(state => state.apiKeys.geminiApiKey);
export const useLumaApiKey = () => useSettingsStore(state => state.apiKeys.lumaApiKey);
export const useTheme = () => useSettingsStore(state => state.preferences.theme);
export const useConcurrentGenerations = () => 
    useSettingsStore(state => state.generationDefaults.concurrentGenerations);

// Drive status
export const useIsDriveConnected = () => 
    useSettingsStore(state => state.driveSettings.isConnected);
export const useDriveUserEmail = () => 
    useSettingsStore(state => state.driveSettings.userEmail);

export default useSettingsStore;
