
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Palette } from 'lucide-react';
import { ProjectSettings } from '../types';

interface StyleSelectorProps {
    selectedId?: string;
    onChange: (id: string) => void;
    projectSettings?: ProjectSettings;
    className?: string;
}

export const StyleSelector: React.FC<StyleSelectorProps> = ({ selectedId, onChange, projectSettings, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [filter, setFilter] = useState('');
    const [highlightIndex, setHighlightIndex] = useState(0);
    const [coords, setCoords] = useState({ top: 0, left: 0, minWidth: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Prepare Options
    const options = useMemo(() => {
        const all = [
            { id: "", label: "Default Style", isSystem: true, prompt: "Uses the project's default visual style." },
            { id: "none", label: "No Style", isSystem: true, prompt: "Disables all style prompts." },
            ...(projectSettings?.styles || [])
        ];
        return all.filter(opt => opt.label.toLowerCase().includes(filter.toLowerCase()));
    }, [projectSettings?.styles, filter]);

    const getLabel = (id?: string) => {
        if (!id) return "Default Style";
        if (id === 'none') return "No Style";
        return projectSettings?.styles.find(s => s.id === id)?.label || "Unknown Style";
    };

    const getTooltip = (id?: string) => {
        if (!id) {
            const defId = projectSettings?.defaultStyleId;
            const defStyle = projectSettings?.styles.find(s => s.id === defId);
            return defStyle ? `Default: ${defStyle.prompt}` : "Uses the project's default visual style.";
        }
        if (id === 'none') return "Disables all style prompts.";
        return projectSettings?.styles.find(s => s.id === id)?.prompt || "";
    };

    const handleOpen = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setCoords({
                top: rect.bottom + window.scrollY + 4,
                left: rect.left + window.scrollX,
                minWidth: Math.max(rect.width, 200)
            });
        }
        setFilter('');
        setHighlightIndex(0);
        setIsOpen(!isOpen);
    };

    const handleSelect = (id: string) => {
        onChange(id);
        setIsOpen(false);
    };

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (buttonRef.current && buttonRef.current.contains(e.target as Node)) return;
            if (listRef.current && listRef.current.contains(e.target as Node)) return;
            setIsOpen(false);
        };
        window.addEventListener('mousedown', handleClick);
        return () => window.removeEventListener('mousedown', handleClick);
    }, [isOpen]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) return;
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex(prev => (prev + 1) % options.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex(prev => (prev - 1 + options.length) % options.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (options[highlightIndex]) {
                handleSelect(options[highlightIndex].id);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsOpen(false);
        }
    };

    return (
        <>
            <button 
                ref={buttonRef}
                onClick={handleOpen}
                className={`text-[10px] font-bold text-zinc-400 hover:text-white flex items-center gap-1 transition-colors px-1 py-0.5 -ml-1 rounded hover:bg-zinc-800 ${className}`}
                title={getTooltip(selectedId)}
            >
                <Palette size={10} />
                {getLabel(selectedId)}
                <ChevronDown size={10} className={`transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && createPortal(
                <div 
                    ref={listRef}
                    className="fixed z-[9999] bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-75"
                    style={{ top: coords.top, left: coords.left, minWidth: coords.minWidth, width: '220px' }}
                >
                    <div className="p-2 border-b border-zinc-800 flex items-center gap-2">
                        <Search size={12} className="text-zinc-500" />
                        <input
                            ref={inputRef}
                            value={filter}
                            onChange={e => { setFilter(e.target.value); setHighlightIndex(0); }}
                            onKeyDown={handleKeyDown}
                            placeholder="Filter styles..."
                            className="bg-transparent text-xs text-white placeholder-zinc-600 focus:outline-none w-full"
                        />
                    </div>
                    <div className="max-h-60 overflow-y-auto py-1">
                        {options.map((opt, idx) => (
                            <button
                                key={opt.id}
                                onClick={() => handleSelect(opt.id)}
                                onMouseEnter={() => setHighlightIndex(idx)}
                                title={opt.prompt}
                                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 ${
                                    idx === highlightIndex ? 'bg-blue-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'
                                } ${selectedId === opt.id ? 'font-bold' : ''}`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${selectedId === opt.id ? 'bg-white' : 'bg-transparent'}`} />
                                {opt.label}
                            </button>
                        ))}
                        {options.length === 0 && (
                            <div className="px-3 py-2 text-xs text-zinc-500 italic text-center">No styles found</div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
