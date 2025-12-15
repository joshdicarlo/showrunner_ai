
import React, { useState, useMemo } from 'react';
import { Modal, Button, Select } from './UI';
import { OneShotItem } from '../types';
import { Wand2, Check, User, MapPin, Layout, Clapperboard, Plus, ChevronRight, ChevronDown, CheckCircle, Circle, Play, Layers, Loader2, Search } from 'lucide-react';

interface OneShotModalProps {
    items: OneShotItem[];
    setItems: React.Dispatch<React.SetStateAction<OneShotItem[]>>;
    onClose: () => void;
    onExecute: (config: { count: number, autoAssemble: boolean }) => void;
    onDiscover: () => void;
    isLoading: boolean;
}

export const OneShotModal: React.FC<OneShotModalProps> = ({ items, setItems, onClose, onExecute, onDiscover, isLoading }) => {
    const [genCount, setGenCount] = useState(1);
    const [autoAssemble, setAutoAssemble] = useState(true);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // Initialize all scenes as expanded by default
    React.useEffect(() => {
        const sceneIds = items.filter(i => i.type === 'Scene').map(i => i.id);
        setExpandedIds(new Set(sceneIds));
    }, [items]); 

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if(next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    const updateItem = (id: string, updates: Partial<OneShotItem>) => {
        setItems(prev => {
            const newItems = [...prev];
            
            const updateRecursive = (list: OneShotItem[]): OneShotItem[] => {
                return list.map(item => {
                    if (item.id === id) {
                        const updated = { ...item, ...updates };
                        return updated;
                    }
                    if (item.children) {
                        return { ...item, children: updateRecursive(item.children) };
                    }
                    return item;
                });
            };
            return updateRecursive(newItems);
        });
    };

    const toggleSection = (type: string, field: 'selected' | 'autoGenerate' | 'autoApprove', value: boolean) => {
        setItems(prev => {
            const newItems = [...prev];
            const updateRecursive = (list: OneShotItem[]): OneShotItem[] => {
                return list.map(item => {
                    let newItem = item;
                    if (item.type === type || (type === 'Scene' && item.type === 'Shot')) {
                        newItem = { ...item, [field]: value };
                    }
                    if (item.children) {
                        newItem = { ...newItem, children: updateRecursive(item.children) };
                    }
                    return newItem;
                });
            };
            return updateRecursive(newItems);
        });
    };

    const renderIcon = (type: string) => {
        switch(type) {
            case 'Character': return <User size={14} className="text-purple-400"/>;
            case 'Location': return <MapPin size={14} className="text-green-400"/>;
            case 'Scene': return <Layout size={14} className="text-yellow-400"/>;
            case 'Shot': return <Clapperboard size={14} className="text-blue-400"/>;
            default: return <Wand2 size={14}/>;
        }
    }

    const renderRow = (item: OneShotItem, depth = 0) => {
        const isParent = item.children && item.children.length > 0;
        const isExpanded = expandedIds.has(item.id);
        const isShot = item.type === 'Shot';

        return (
            <React.Fragment key={item.id}>
                <div 
                    className={`flex items-center gap-3 p-2 border-b border-zinc-800/50 hover:bg-zinc-800/50 transition-colors ${item.selected ? 'bg-zinc-900/30' : 'opacity-50'}`}
                    style={{ paddingLeft: `${(depth * 20) + 12}px` }}
                >
                    {/* Expand / Icon Column */}
                    <div className="flex items-center gap-2 w-8 shrink-0">
                        {isParent ? (
                            <button onClick={() => toggleExpand(item.id)} className="text-zinc-500 hover:text-white p-1">
                                {isExpanded ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                            </button>
                        ) : (
                            <div className="w-5" />
                        )}
                    </div>

                    {/* Import Checkbox */}
                    <div className="w-8 flex justify-center shrink-0">
                        <input 
                            type="checkbox" 
                            checked={item.selected} 
                            onChange={(e) => updateItem(item.id, { selected: e.target.checked })}
                            className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 focus:ring-blue-500 cursor-pointer"
                            title="Import this item"
                        />
                    </div>

                    {/* Name & Desc */}
                    <div className="flex-1 min-w-0 flex items-center gap-3">
                        <div className="p-1.5 rounded bg-zinc-900 border border-zinc-800 shrink-0">
                            {renderIcon(item.type)}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-medium truncate ${item.selected ? 'text-zinc-200' : 'text-zinc-500'}`}>{item.name}</span>
                                {item.isExisting && <span className="text-[9px] bg-zinc-800 text-zinc-500 px-1.5 rounded border border-zinc-700">Existing</span>}
                            </div>
                            <div className="text-[10px] text-zinc-500 truncate max-w-[300px]">
                                {item.summary || item.description}
                            </div>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-1 pr-4">
                        
                        {/* Auto Generate Toggle */}
                        <button 
                            onClick={() => updateItem(item.id, { autoGenerate: !item.autoGenerate })}
                            disabled={!item.selected}
                            className={`p-1.5 rounded flex items-center gap-1.5 border transition-all text-[10px] w-24 justify-center
                                ${!item.selected ? 'opacity-20 cursor-not-allowed border-transparent' : 
                                  item.autoGenerate ? 'bg-blue-900/30 text-blue-300 border-blue-800 shadow-[0_0_10px_rgba(59,130,246,0.2)]' : 'bg-zinc-900 text-zinc-500 border-zinc-700 hover:border-zinc-500'}
                            `}
                            title="Auto-Generate Image"
                        >
                            <Wand2 size={12} />
                            {item.autoGenerate ? "Auto-Gen" : "Manual"}
                        </button>

                        {/* Auto Approve Toggle */}
                        <button 
                            onClick={() => updateItem(item.id, { autoApprove: !item.autoApprove })}
                            disabled={!item.selected || !item.autoGenerate}
                            className={`p-1.5 rounded flex items-center gap-1.5 border transition-all text-[10px] w-24 justify-center
                                ${!item.selected || !item.autoGenerate ? 'opacity-20 cursor-not-allowed border-transparent' : 
                                  item.autoApprove ? 'bg-green-900/30 text-green-300 border-green-800' : 'bg-zinc-900 text-zinc-500 border-zinc-700 hover:border-zinc-500'}
                            `}
                            title="Auto-Approve First Result"
                        >
                            {item.autoApprove ? <CheckCircle size={12} /> : <Circle size={12} />}
                            {item.autoApprove ? "Approved" : "Review"}
                        </button>

                    </div>
                </div>
                {isParent && isExpanded && item.children?.map(child => renderRow(child, depth + 1))}
            </React.Fragment>
        );
    }

    const renderSectionHeader = (title: string, type: string) => (
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-950 border-y border-zinc-800 sticky top-0 z-10">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                {title}
            </h4>
            <div className="flex items-center gap-2">
                <button onClick={() => toggleSection(type, 'selected', true)} className="text-[10px] text-zinc-500 hover:text-white px-1">All</button>
                <button onClick={() => toggleSection(type, 'selected', false)} className="text-[10px] text-zinc-500 hover:text-white px-1">None</button>
                <div className="w-[1px] h-3 bg-zinc-800 mx-1"/>
                <button onClick={() => toggleSection(type, 'autoGenerate', true)} className="text-[10px] text-blue-500 hover:text-blue-400 px-1">Auto-Gen All</button>
            </div>
        </div>
    );

    const castItems = items.filter(i => i.type === 'Character');
    const locationItems = items.filter(i => i.type === 'Location');
    const sceneItems = items.filter(i => i.type === 'Scene');

    return (
        <Modal title="Production Breakdown & Discovery" onClose={onClose} maxWidth="max-w-5xl">
            <div className="flex flex-col h-[80vh] bg-zinc-950">
                {/* Header Config */}
                <div className="p-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between gap-6 shrink-0">
                    <div>
                        <h3 className="text-sm font-bold text-white">One Shot Discovery</h3>
                        <p className="text-xs text-zinc-500 mt-1">Review discovered assets and configure auto-generation.</p>
                    </div>
                    
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3 bg-zinc-950 p-2 rounded-lg border border-zinc-800">
                            <label className="text-[10px] uppercase font-bold text-zinc-500">Variations</label>
                            <Select value={genCount} onChange={(e) => setGenCount(parseInt(e.target.value))} className="w-20 text-xs py-1">
                                <option value="1">1</option>
                                <option value="2">2</option>
                                <option value="4">4</option>
                                <option value="8">8</option>
                            </Select>
                        </div>

                        <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer bg-zinc-950 p-2 rounded-lg border border-zinc-800 hover:border-zinc-600 transition-colors">
                            <input type="checkbox" checked={autoAssemble} onChange={e => setAutoAssemble(e.target.checked)} className="rounded border-zinc-700 bg-zinc-900"/>
                            <Layers size={14} className={autoAssemble ? "text-blue-400" : "text-zinc-600"}/>
                            <span>Auto-Assemble Timeline</span>
                        </label>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto bg-zinc-900/50">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4">
                             <Loader2 size={48} className="animate-spin text-blue-500" />
                             <p className="text-zinc-400 animate-pulse">Analyzing script content...</p>
                        </div>
                    ) : items.length > 0 ? (
                        <>
                            {castItems.length > 0 && (
                                <>
                                    {renderSectionHeader('Cast Members', 'Character')}
                                    {castItems.map(item => renderRow(item))}
                                </>
                            )}
                            
                            {locationItems.length > 0 && (
                                <>
                                    {renderSectionHeader('Set Locations', 'Location')}
                                    {locationItems.map(item => renderRow(item))}
                                </>
                            )}

                            {sceneItems.length > 0 && (
                                <>
                                    {renderSectionHeader('Scenes & Shots', 'Scene')}
                                    {sceneItems.map(item => renderRow(item))}
                                </>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2">
                            <Wand2 size={32} className="opacity-20"/>
                            <p>No items discovered. Check your script content.</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-zinc-800 bg-zinc-900 flex justify-end gap-2 shrink-0">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button variant="secondary" onClick={onDiscover} disabled={isLoading} icon={Search}>
                         Discover
                    </Button>
                    <Button onClick={() => onExecute({ count: genCount, autoAssemble })} disabled={isLoading || items.length === 0}>
                        <Play size={16} className="fill-current"/> Execute One Shot
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
