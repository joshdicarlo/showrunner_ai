
import React, { useState } from 'react';
import { ProjectSettings, DepartmentType, VisualStyle, ModelDefaults } from '../types';
import { DEPARTMENTS, IMAGE_MODELS_OPTIONS, VIDEO_MODELS_OPTIONS } from '../constants';
import { Modal, Button, Select } from './UI';
import { Plus, Trash2, Save, Search, Settings, Palette, FileJson, Check, Cpu } from 'lucide-react';

interface SettingsModalProps {
    settings: ProjectSettings;
    onSave: (settings: ProjectSettings) => void;
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onSave, onClose }) => {
    const [activeTab, setActiveTab] = useState<'general' | 'styles' | 'assets' | 'models'>('general');
    const [localSettings, setLocalSettings] = useState<ProjectSettings>(JSON.parse(JSON.stringify(settings)));
    const [searchQuery, setSearchQuery] = useState('');

    const handleSave = () => {
        onSave(localSettings);
        onClose();
    };

    // --- Style Handlers ---
    const addStyle = () => {
        const newStyle: VisualStyle = {
            id: `style-custom-${Date.now()}`,
            label: 'New Style',
            value: 'custom_style',
            prompt: 'Describe the visual style here...',
            isSystem: false
        };
        setLocalSettings(prev => ({ ...prev, styles: [...prev.styles, newStyle] }));
        // Auto switch to styles tab if added
        setActiveTab('styles');
    };

    const updateStyle = (id: string, updates: Partial<VisualStyle>) => {
        setLocalSettings(prev => ({
            ...prev,
            styles: prev.styles.map(s => s.id === id ? { ...s, ...updates } : s)
        }));
    };

    const deleteStyle = (id: string) => {
        setLocalSettings(prev => ({
            ...prev,
            styles: prev.styles.filter(s => s.id !== id)
        }));
    };

    // --- Asset Config Handlers ---
    const updateAssetConfig = (dept: DepartmentType, field: string, value: any) => {
        setLocalSettings(prev => ({
            ...prev,
            assetConfigs: {
                ...prev.assetConfigs,
                [dept]: {
                    ...prev.assetConfigs[dept],
                    [field]: value
                }
            }
        }));
    };

    // VS Code-like Input Style
    const inputClass = "w-full bg-[#3c3c3c] border border-transparent focus:border-[#007fd4] text-zinc-200 text-sm px-2 py-1 outline-none rounded-none";
    const labelClass = "block text-sm font-medium text-zinc-300 mb-1";
    const descClass = "text-xs text-zinc-500 mb-2 leading-relaxed";

    return (
        <Modal title="Settings" onClose={onClose} maxWidth="max-w-6xl" noPadding>
            <div className="flex h-[75vh] bg-[#1e1e1e] text-zinc-300 font-sans">
                
                {/* SIDEBAR */}
                <div className="w-64 flex flex-col border-r border-[#2b2b2b] bg-[#252526]">
                    <div className="p-2 border-b border-[#2b2b2b]">
                        <div className="relative">
                            <Search size={14} className="absolute left-2 top-1.5 text-zinc-500" />
                            <input 
                                className="w-full bg-[#3c3c3c] text-zinc-200 text-xs pl-7 pr-2 py-1.5 outline-none border border-transparent focus:border-[#007fd4]"
                                placeholder="Search settings..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto py-2">
                        <button 
                            onClick={() => setActiveTab('general')} 
                            className={`w-full text-left px-4 py-1.5 text-xs hover:bg-[#2a2d2e] flex items-center gap-2 ${activeTab === 'general' ? 'bg-[#37373d] text-white border-l-2 border-[#007fd4]' : 'text-zinc-400 border-l-2 border-transparent'}`}
                        >
                            <Settings size={14} /> Commonly Used
                        </button>
                        <button 
                            onClick={() => setActiveTab('styles')} 
                            className={`w-full text-left px-4 py-1.5 text-xs hover:bg-[#2a2d2e] flex items-center gap-2 ${activeTab === 'styles' ? 'bg-[#37373d] text-white border-l-2 border-[#007fd4]' : 'text-zinc-400 border-l-2 border-transparent'}`}
                        >
                            <Palette size={14} /> Visual Styles
                        </button>
                        <button 
                            onClick={() => setActiveTab('assets')} 
                            className={`w-full text-left px-4 py-1.5 text-xs hover:bg-[#2a2d2e] flex items-center gap-2 ${activeTab === 'assets' ? 'bg-[#37373d] text-white border-l-2 border-[#007fd4]' : 'text-zinc-400 border-l-2 border-transparent'}`}
                        >
                            <FileJson size={14} /> Asset Defaults
                        </button>
                        <button 
                            onClick={() => setActiveTab('models')} 
                            className={`w-full text-left px-4 py-1.5 text-xs hover:bg-[#2a2d2e] flex items-center gap-2 ${activeTab === 'models' ? 'bg-[#37373d] text-white border-l-2 border-[#007fd4]' : 'text-zinc-400 border-l-2 border-transparent'}`}
                        >
                            <Cpu size={14} /> Default Models
                        </button>
                    </div>
                    <div className="p-2 border-t border-[#2b2b2b]">
                        <Button size="sm" onClick={addStyle} variant="secondary" className="w-full justify-start text-xs h-8 bg-[#3c3c3c] hover:bg-[#4c4c4c] border-none text-zinc-300">
                            <Plus size={14} /> Add New Style
                        </Button>
                    </div>
                </div>

                {/* CONTENT AREA */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Header / Breadcrumb */}
                    <div className="h-10 flex items-center px-6 border-b border-[#2b2b2b] shrink-0 bg-[#1e1e1e]">
                        <span className="text-xs text-zinc-500">
                            {activeTab === 'general' && "User > Commonly Used"}
                            {activeTab === 'styles' && "User > Visual Styles"}
                            {activeTab === 'assets' && "User > Asset Defaults"}
                            {activeTab === 'models' && "User > Default Models"}
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        
                        {/* --- GENERAL --- */}
                        {activeTab === 'general' && (
                            <div className="max-w-3xl">
                                <div className="mb-8">
                                    <h2 className="text-lg font-medium text-zinc-100 mb-1">Project: Default Style</h2>
                                    <p className={descClass}>
                                        Sets the visual style applied to all new assets unless overridden. This acts as the fallback style for the entire project.
                                    </p>
                                    <div className="mt-2 w-full max-w-md">
                                        <Select 
                                            value={localSettings.defaultStyleId || ''} 
                                            onChange={(e) => setLocalSettings({...localSettings, defaultStyleId: e.target.value})}
                                            className="bg-[#3c3c3c] border-transparent focus:border-[#007fd4] rounded-none text-sm py-1.5"
                                        >
                                            <option value="">None (Use Model Default)</option>
                                            {localSettings.styles.map(s => (
                                                <option key={s.id} value={s.id}>{s.label}</option>
                                            ))}
                                        </Select>
                                    </div>
                                </div>

                                <div className="mb-8">
                                    <h2 className="text-lg font-medium text-zinc-100 mb-1">Concurrent Tasks</h2>
                                    <p className={descClass}>
                                        Max parallel generation tasks (default: 10). Reduce if you hit rate limits.
                                    </p>
                                    <div className="mt-2 w-full max-w-md">
                                         <input 
                                             type="number" 
                                             min="1" 
                                             max="50"
                                             value={localSettings.concurrentGenerations || 10} 
                                             onChange={(e) => setLocalSettings({...localSettings, concurrentGenerations: parseInt(e.target.value)})}
                                             className="w-full bg-[#3c3c3c] rounded-none border border-transparent focus:border-[#007fd4] text-zinc-200 px-3 py-1.5 text-sm"
                                         />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* --- STYLES --- */}
                        {activeTab === 'styles' && (
                            <div className="max-w-4xl">
                                <h2 className="text-lg font-medium text-zinc-100 mb-1">Visual Styles</h2>
                                <p className={descClass}>
                                    Define reusable styles referenced via <code>@style:key</code> in prompts.
                                </p>

                                <div className="mt-6 space-y-6">
                                    {localSettings.styles.map(style => (
                                        <div key={style.id} className="group relative pl-3 border-l-2 border-[#2b2b2b] hover:border-zinc-500 transition-colors">
                                            <div className="flex gap-4 mb-2">
                                                <div className="flex-1">
                                                    <label className="text-xs text-zinc-500 mb-0.5 block">Label</label>
                                                    <input 
                                                        value={style.label}
                                                        onChange={(e) => updateStyle(style.id, { label: e.target.value })}
                                                        className={inputClass}
                                                    />
                                                </div>
                                                <div className="w-1/3">
                                                    <label className="text-xs text-zinc-500 mb-0.5 block">Key (e.g. @style:key)</label>
                                                    <input 
                                                        value={style.value}
                                                        onChange={(e) => updateStyle(style.id, { value: e.target.value.replace(/\s+/g, '_').toLowerCase() })}
                                                        className={`${inputClass} font-mono text-blue-400`}
                                                    />
                                                </div>
                                                {!style.isSystem && (
                                                    <div className="pt-5">
                                                        <button 
                                                            onClick={() => deleteStyle(style.id)}
                                                            className="p-1.5 hover:bg-[#3c3c3c] text-zinc-500 hover:text-zinc-200 rounded"
                                                            title="Delete Style"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <label className="text-xs text-zinc-500 mb-0.5 block">Prompt Expansion</label>
                                                <textarea 
                                                    value={style.prompt}
                                                    onChange={(e) => updateStyle(style.id, { prompt: e.target.value })}
                                                    className={`${inputClass} h-20 font-mono text-xs leading-relaxed resize-none py-2`}
                                                    placeholder="Enter full prompt description..."
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* --- ASSETS --- */}
                        {activeTab === 'assets' && (
                            <div className="max-w-4xl">
                                <h2 className="text-lg font-medium text-zinc-100 mb-1">Asset Defaults</h2>
                                <p className={descClass}>
                                    Configure default behaviors and hidden prompts for specific asset types.
                                </p>

                                <div className="mt-6 space-y-8">
                                    {DEPARTMENTS.map(dept => {
                                        const config = localSettings.assetConfigs[dept.id] || { hiddenPrompt: '' };
                                        return (
                                            <div key={dept.id} className="pl-3 border-l-2 border-[#2b2b2b]">
                                                <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2 mb-3">
                                                    <span className={`w-2 h-2 rounded-full ${dept.color.replace('text-', 'bg-')}`}/>
                                                    {dept.id}
                                                </h3>
                                                
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div>
                                                        <label className={labelClass}>Hidden Prompt Suffix</label>
                                                        <p className={descClass}>Injected automatically at the end of prompts for this type.</p>
                                                        <textarea 
                                                            value={config.hiddenPrompt || ''}
                                                            onChange={(e) => updateAssetConfig(dept.id, 'hiddenPrompt', e.target.value)}
                                                            className={`${inputClass} h-20 font-mono text-xs`}
                                                            placeholder="e.g. cinematic lighting, detailed texture..."
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className={labelClass}>Default Style Override</label>
                                                        <p className={descClass}>Override the project global style for this specific department.</p>
                                                        <Select 
                                                            value={config.defaultStyleId || ''}
                                                            onChange={(e) => updateAssetConfig(dept.id, 'defaultStyleId', e.target.value)}
                                                            className="bg-[#3c3c3c] border-transparent focus:border-[#007fd4] rounded-none text-sm py-1.5"
                                                        >
                                                            <option value="">Inherit Project Default</option>
                                                            {localSettings.styles.map(s => (
                                                                <option key={s.id} value={s.id}>{s.label}</option>
                                                            ))}
                                                        </Select>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* --- MODELS --- */}
                        {activeTab === 'models' && (
                            <div className="max-w-4xl">
                                <h2 className="text-lg font-medium text-zinc-100 mb-1">Default Models</h2>
                                <p className={descClass}>
                                    Configure which AI models to use by default for different generation types.
                                </p>

                                <div className="mt-6 space-y-6">
                                    {/* Images */}
                                    <div className="pl-3 border-l-2 border-[#2b2b2b]">
                                        <h3 className="text-sm font-bold text-zinc-200 mb-3">Image Generation</h3>
                                        <div className="grid grid-cols-1 gap-4">
                                            <div>
                                                <label className={labelClass}>Default Image Model</label>
                                                <p className={descClass}>Used for general image generation and concept art.</p>
                                                <Select 
                                                    value={localSettings.modelDefaults?.image || 'luma-photon-1'}
                                                    onChange={(e) => setLocalSettings({
                                                        ...localSettings,
                                                        modelDefaults: {
                                                            ...localSettings.modelDefaults,
                                                            image: e.target.value,
                                                            video: localSettings.modelDefaults?.video || 'luma-ray-2',
                                                            refineCharacter: localSettings.modelDefaults?.refineCharacter || 'gemini-3-pro-image-preview',
                                                            turntable: localSettings.modelDefaults?.turntable || 'luma-ray-2',
                                                            editImage: localSettings.modelDefaults?.editImage || 'gemini-3-pro-image-preview',
                                                        }
                                                    })}
                                                    className="bg-[#3c3c3c] border-transparent focus:border-[#007fd4] rounded-none text-sm py-1.5 w-full"
                                                >
                                                    {IMAGE_MODELS_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Videos */}
                                    <div className="pl-3 border-l-2 border-[#2b2b2b]">
                                        <h3 className="text-sm font-bold text-zinc-200 mb-3">Video Generation</h3>
                                        <div className="grid grid-cols-1 gap-4">
                                            <div>
                                                <label className={labelClass}>Default Video Model</label>
                                                <p className={descClass}>Used for standard video generation.</p>
                                                <Select 
                                                    value={localSettings.modelDefaults?.video || 'luma-ray-2'}
                                                    onChange={(e) => setLocalSettings({
                                                        ...localSettings,
                                                        modelDefaults: {
                                                            ...localSettings.modelDefaults,
                                                            image: localSettings.modelDefaults?.image || 'luma-photon-1',
                                                            video: e.target.value,
                                                            refineCharacter: localSettings.modelDefaults?.refineCharacter || 'gemini-3-pro-image-preview',
                                                            turntable: localSettings.modelDefaults?.turntable || 'luma-ray-2',
                                                            editImage: localSettings.modelDefaults?.editImage || 'gemini-3-pro-image-preview',
                                                        }
                                                    })}
                                                    className="bg-[#3c3c3c] border-transparent focus:border-[#007fd4] rounded-none text-sm py-1.5 w-full"
                                                >
                                                    {VIDEO_MODELS_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Custom Functions */}
                                    <div className="pl-3 border-l-2 border-[#2b2b2b]">
                                        <h3 className="text-sm font-bold text-zinc-200 mb-3">Custom Functions</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className={labelClass}>Refine Character</label>
                                                <p className={descClass}>Model for character refinement and dataset generation.</p>
                                                <Select 
                                                    value={localSettings.modelDefaults?.refineCharacter || 'gemini-3-pro-image-preview'}
                                                    onChange={(e) => setLocalSettings({
                                                        ...localSettings,
                                                        modelDefaults: {
                                                            ...localSettings.modelDefaults,
                                                            image: localSettings.modelDefaults?.image || 'luma-photon-1',
                                                            video: localSettings.modelDefaults?.video || 'luma-ray-2',
                                                            refineCharacter: e.target.value,
                                                            turntable: localSettings.modelDefaults?.turntable || 'luma-ray-2',
                                                            editImage: localSettings.modelDefaults?.editImage || 'gemini-3-pro-image-preview',
                                                        }
                                                    })}
                                                    className="bg-[#3c3c3c] border-transparent focus:border-[#007fd4] rounded-none text-sm py-1.5 w-full"
                                                >
                                                    {IMAGE_MODELS_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                            
                                            <div>
                                                <label className={labelClass}>Turntable</label>
                                                <p className={descClass}>Model for generating turntable/360° views.</p>
                                                <Select 
                                                    value={localSettings.modelDefaults?.turntable || 'luma-ray-2'}
                                                    onChange={(e) => setLocalSettings({
                                                        ...localSettings,
                                                        modelDefaults: {
                                                            ...localSettings.modelDefaults,
                                                            image: localSettings.modelDefaults?.image || 'luma-photon-1',
                                                            video: localSettings.modelDefaults?.video || 'luma-ray-2',
                                                            refineCharacter: localSettings.modelDefaults?.refineCharacter || 'gemini-3-pro-image-preview',
                                                            turntable: e.target.value,
                                                            editImage: localSettings.modelDefaults?.editImage || 'gemini-3-pro-image-preview',
                                                        }
                                                    })}
                                                    className="bg-[#3c3c3c] border-transparent focus:border-[#007fd4] rounded-none text-sm py-1.5 w-full"
                                                >
                                                    {VIDEO_MODELS_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                            
                                            <div>
                                                <label className={labelClass}>Edit Image</label>
                                                <p className={descClass}>Model for image editing operations (Nano Banana).</p>
                                                <Select 
                                                    value={localSettings.modelDefaults?.editImage || 'gemini-3-pro-image-preview'}
                                                    onChange={(e) => setLocalSettings({
                                                        ...localSettings,
                                                        modelDefaults: {
                                                            ...localSettings.modelDefaults,
                                                            image: localSettings.modelDefaults?.image || 'luma-photon-1',
                                                            video: localSettings.modelDefaults?.video || 'luma-ray-2',
                                                            refineCharacter: localSettings.modelDefaults?.refineCharacter || 'gemini-3-pro-image-preview',
                                                            turntable: localSettings.modelDefaults?.turntable || 'luma-ray-2',
                                                            editImage: e.target.value,
                                                        }
                                                    })}
                                                    className="bg-[#3c3c3c] border-transparent focus:border-[#007fd4] rounded-none text-sm py-1.5 w-full"
                                                >
                                                    {IMAGE_MODELS_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 bg-[#252526] border-t border-[#2b2b2b] flex justify-end gap-2 shrink-0">
                        <Button variant="ghost" onClick={onClose} className="h-8 text-xs">Cancel</Button>
                        <Button onClick={handleSave} className="h-8 text-xs bg-[#007fd4] hover:bg-[#0069b4]">
                            <Check size={14} className="mr-1"/> Save Settings
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};
