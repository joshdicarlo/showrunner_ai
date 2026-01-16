/**
 * SettingsProvider.tsx
 * 
 * Manages application-level settings:
 * - Concurrency limits
 * - Default models
 * - User preferences
 * 
 * This is separate from ProjectSettings which are per-project.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { MODELS } from '../constants';

// ============================================================================
// Types
// ============================================================================

interface AppSettings {
    // Queue settings
    concurrencyLimit: number;
    
    // Default generation settings
    defaultImageModel: string;
    defaultVideoModel: string;
    
    // UI preferences
    autoFindShots: boolean;
    showThinkingText: boolean;
    
    // Drive settings
    preferOfflineMode: boolean;
}

const DEFAULT_APP_SETTINGS: AppSettings = {
    concurrencyLimit: 2,
    defaultImageModel: MODELS.IMAGE_GEN,
    defaultVideoModel: MODELS.VIDEO_LUMA,
    autoFindShots: true,
    showThinkingText: true,
    preferOfflineMode: false,
};

interface SettingsContextType {
    settings: AppSettings;
    updateSettings: (updates: Partial<AppSettings>) => void;
    resetSettings: () => void;
    
    // Convenience getters
    getConcurrencyLimit: () => number;
}

// ============================================================================
// Local Storage
// ============================================================================

const STORAGE_KEY = 'showrunner_app_settings';

const loadSettings = (): AppSettings => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return { ...DEFAULT_APP_SETTINGS, ...JSON.parse(stored) };
        }
    } catch (e) {
        console.warn('Failed to load settings from localStorage:', e);
    }
    return DEFAULT_APP_SETTINGS;
};

const saveSettings = (settings: AppSettings) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.warn('Failed to save settings to localStorage:', e);
    }
};

// ============================================================================
// Context
// ============================================================================

const SettingsContext = createContext<SettingsContextType | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface SettingsProviderProps {
    children: React.ReactNode;
    initialSettings?: Partial<AppSettings>;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ 
    children,
    initialSettings 
}) => {
    const [settings, setSettings] = useState<AppSettings>(() => ({
        ...loadSettings(),
        ...initialSettings
    }));
    
    // Persist settings changes
    useEffect(() => {
        saveSettings(settings);
    }, [settings]);
    
    const updateSettings = useCallback((updates: Partial<AppSettings>) => {
        setSettings(prev => ({ ...prev, ...updates }));
    }, []);
    
    const resetSettings = useCallback(() => {
        setSettings(DEFAULT_APP_SETTINGS);
    }, []);
    
    const getConcurrencyLimit = useCallback(() => {
        return settings.concurrencyLimit;
    }, [settings.concurrencyLimit]);
    
    const value: SettingsContextType = useMemo(() => ({
        settings,
        updateSettings,
        resetSettings,
        getConcurrencyLimit,
    }), [settings, updateSettings, resetSettings, getConcurrencyLimit]);
    
    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
};

// ============================================================================
// Hook
// ============================================================================

export const useSettings = (): SettingsContextType => {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};

// Convenience hooks
export const useAppSettings = () => {
    const { settings, updateSettings } = useSettings();
    return { settings, updateSettings };
};

export const useConcurrency = () => {
    const { settings, updateSettings, getConcurrencyLimit } = useSettings();
    return {
        limit: settings.concurrencyLimit,
        setLimit: (limit: number) => updateSettings({ concurrencyLimit: limit }),
        getConcurrencyLimit,
    };
};

export default SettingsProvider;
