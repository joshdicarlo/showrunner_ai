
import React, { useState, useRef, useEffect, memo, useMemo } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { FlowNode, NodeType, ProjectAsset, NodeHistoryItem, DepartmentType, ProjectSettings, BatchType } from '../types';
import { Move, Play, X, Sparkles, Edit, Image as ImageIcon, Film, CheckCircle, Eye, Archive, AlertCircle, Folder, FolderOpen, ChevronDown, ChevronRight, RotateCcw, User, Maximize2, Minimize2, Bold, Italic, Heading1, Heading2, List, Quote, Code, EyeOff, Bot, Upload, Download, HardDrive, FileText, Cloud, Music, Volume2, VolumeX, ChevronLeft, History, Palette, Search } from 'lucide-react';
import { Button, Input, TextArea, Select } from './UI';
import { ASPECT_RATIOS, IMAGE_MODELS_OPTIONS, MODELS, VIDEO_MODELS_OPTIONS, VIDEO_MODEL_CAPABILITIES } from '../constants';
import * as GeminiService from '../services/geminiService';
import * as FileService from '../services/fileService';
import { generateLumaVideo, generateLumaImage } from '../services/lumaService';
import { resolvePrompt, resolveReferenceImages } from '../utils/promptUtils';
import { StyleSelector } from './StyleSelector';

interface Suggestion {
    id: string;
    label: string;
    subLabel: string;
    insertText: string;
    type: 'asset' | 'style';
    iconClass: string;
}

/** Request for generation to be routed through App.tsx */
export interface GenerationRequest {
    nodeId: string;
    type: 'image' | 'video' | 'text';
    prompt: string;
    config?: {
        model?: string;
        aspectRatio?: string;
        styleId?: string;
        duration?: string;
        withAudio?: boolean;
        startImage?: string;
        endImage?: string;
        referenceImages?: string[];
    };
}

interface NodeItemProps {
    node: FlowNode;
    isSelected: boolean;
    onSelect: (e: React.MouseEvent, id: string) => void;
    onDelete: (id: string) => void;
    onUpdate: (id: string, data: any) => void;
    onDragStart: (e: React.MouseEvent, id: string) => void;
    onContextMenu?: (e: React.MouseEvent, id: string) => void;
    /** Callback to request generation through the central queue */
    onRequestGeneration?: (request: GenerationRequest) => void;
    /** Callback when image is clicked to open lightbox */
    onImageClick?: () => void;
    activeAsset?: ProjectAsset;
    isThumbnail?: boolean;
    isDragOver?: boolean;
    projectAssets?: ProjectAsset[];
    assetThumbnails?: Record<string, string>;
    refinedImagesMap?: Record<string, string[]>;
    approvedImagesMap?: Record<string, string[]>;
    projectSettings?: ProjectSettings;
}

// --- Highlighted Input Component ---
const HighlightedInput: React.FC<{
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    className?: string;
    projectAssets?: ProjectAsset[];
    activeAsset?: ProjectAsset;
    projectSettings?: ProjectSettings;
}> = ({ value, onChange, placeholder, className, projectAssets, activeAsset, projectSettings }) => {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [filteredSuggestions, setFilteredSuggestions] = useState<Suggestion[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [cursorPos, setCursorPos] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Create sorted regex patterns for highlighting
    const highlightConfig = useMemo(() => {
        const map: Record<string, string> = {};
        const keys: string[] = [];

        // Add standard assets
        if (projectAssets) {
            projectAssets.forEach(a => {
                const key = `@${a.title}`;
                keys.push(key);
                map[key.toLowerCase()] = a.department;
                
                // Add Dot Syntax Children
                const children = projectAssets.filter(c => c.parentId === a.id);
                children.forEach(c => {
                    const childKey = `@${a.title}.${c.title}`;
                    keys.push(childKey);
                    map[childKey.toLowerCase()] = c.department;
                });
            });
        }

        // Add Styles
        if (projectSettings?.styles) {
            projectSettings.styles.forEach(s => {
                const key = `@style:${s.value}`;
                keys.push(key);
                map[key.toLowerCase()] = 'Style';
            });
        }

        // Add context keywords
        if (activeAsset) {
            keys.push('@character');
            map['@character'] = activeAsset.department;
            keys.push('@parent');
            map['@parent'] = 'Context';
        }

        // Sort by length desc to match longest first (e.g. @style:key before @style)
        keys.sort((a, b) => b.length - a.length);
        
        if (keys.length === 0) return { pattern: null, map };

        // Escape for regex
        const escaped = keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
        
        return { pattern, map };
    }, [projectAssets, activeAsset, projectSettings]);

    const getDeptColor = (dept: string) => {
        switch (dept) {
            case DepartmentType.WRITERS_ROOM: return "bg-blue-500/20 text-blue-200";
            case DepartmentType.CASTING_WARDROBE: return "bg-purple-500/30 text-purple-200";
            case DepartmentType.STORY: return "bg-yellow-500/20 text-yellow-200";
            case DepartmentType.SET_DESIGN: return "bg-green-500/20 text-green-200";
            case DepartmentType.PRODUCTION: return "bg-red-500/20 text-red-200";
            case 'Context': return "bg-zinc-600/30 text-zinc-300";
            case 'Style': return "bg-pink-500/20 text-pink-200";
            default: return "bg-orange-500/20 text-orange-200";
        }
    };

    const renderHighlights = () => {
        if (!value) return null;
        if (!highlightConfig.pattern) return value;

        const parts = value.split(highlightConfig.pattern);
        return parts.map((part, i) => {
            const lower = part.toLowerCase();
            const dept = highlightConfig.map[lower];
            if (dept) {
                return (
                    <span key={i} className={`${getDeptColor(dept)} rounded-[2px] px-0.5 mx-[-2px]`}>
                        {part}
                    </span>
                );
            }
            return <span key={i}>{part}</span>;
        });
    };

    // --- Auto Complete Logic ---
    const getActiveToken = (text: string, cursor: number) => {
        const textBeforeCursor = text.slice(0, cursor);
        const match = textBeforeCursor.match(/@([\w\.:\-]*)$/);
        return match ? match[1] : null;
    };

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        const newCursor = e.target.selectionStart;
        onChange(newValue);
        setCursorPos(newCursor);

        const token = getActiveToken(newValue, newCursor);
        if (token !== null) {
            const search = token.toLowerCase();
            const suggestions: Suggestion[] = [];

            // 1. Filter Assets
            if (projectAssets) {
                projectAssets.forEach(a => {
                    if (a.title.toLowerCase().startsWith(search)) {
                        suggestions.push({
                            id: a.id,
                            label: a.title,
                            subLabel: a.department,
                            insertText: a.title,
                            type: 'asset',
                            iconClass: a.department === DepartmentType.CASTING_WARDROBE ? 'bg-purple-500' : 'bg-zinc-500'
                        });
                    }
                });
            }

            // 2. Filter Styles
            if (projectSettings?.styles) {
                projectSettings.styles.forEach(s => {
                    const key = `style:${s.value}`;
                    if (key.toLowerCase().startsWith(search)) {
                        suggestions.push({
                            id: s.id,
                            label: key,
                            subLabel: s.label,
                            insertText: key,
                            type: 'style',
                            iconClass: 'bg-pink-500'
                        });
                    }
                });
            }
            
            if (suggestions.length > 0) {
                suggestions.sort((a, b) => a.label.localeCompare(b.label));
                setFilteredSuggestions(suggestions.slice(0, 15)); 
                setShowSuggestions(true);
                setSelectedIndex(0);
                return;
            }
        }
        setShowSuggestions(false);
    };

    const insertSuggestion = (suggestion: Suggestion) => {
        const token = getActiveToken(value, cursorPos);
        if (token !== null) {
            const before = value.slice(0, cursorPos - token.length - 1); // -1 for @
            const after = value.slice(cursorPos);
            const inserted = `@${suggestion.insertText} `;
            onChange(before + inserted + after);
            setShowSuggestions(false);
            
            setTimeout(() => {
                if (textareaRef.current) {
                    const newPos = before.length + inserted.length;
                    textareaRef.current.focus();
                    textareaRef.current.setSelectionRange(newPos, newPos);
                }
            }, 0);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (showSuggestions) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % filteredSuggestions.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
            } else if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault();
                insertSuggestion(filteredSuggestions[selectedIndex]);
            } else if (e.key === 'Escape') {
                setShowSuggestions(false);
            }
        }
    };

    const sharedStyle = {
        fontFamily: '"Fira Code", monospace',
        fontSize: '12px',
        lineHeight: '1.5',
        letterSpacing: 'normal',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        padding: '12px',
    } as const;

    return (
        <div className={`relative group ${className} overflow-visible bg-zinc-900 border border-zinc-700 rounded`}>
             <div 
                className="absolute inset-0 pointer-events-none text-transparent z-0 overflow-hidden"
                style={sharedStyle}
                aria-hidden="true"
             >
                {renderHighlights()}
             </div>

             <textarea
                ref={textareaRef}
                value={value}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onClick={(e) => {
                    setCursorPos(e.currentTarget.selectionStart);
                    setShowSuggestions(false);
                }}
                placeholder={placeholder}
                className="relative z-10 w-full h-full bg-transparent text-zinc-200 caret-white focus:outline-none resize-none"
                style={sharedStyle}
                spellCheck={false}
             />

             {showSuggestions && filteredSuggestions.length > 0 && (
                 <div className="absolute left-0 top-full mt-1 w-64 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-75 max-h-96 overflow-y-auto">
                     <div className="px-2 py-1 bg-zinc-950 text-[9px] text-zinc-500 font-bold border-b border-zinc-800 sticky top-0 z-10">
                         SUGGESTIONS
                     </div>
                     {filteredSuggestions.map((item, idx) => (
                         <button
                            key={item.id}
                            onMouseDown={(e) => { e.preventDefault(); insertSuggestion(item); }}
                            className={`px-3 py-2 text-left text-xs flex items-center gap-2 w-full ${idx === selectedIndex ? 'bg-blue-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}
                         >
                            {item.type === 'style' ? (
                                <Palette size={12} className={item.iconClass.replace('bg-', 'text-')} />
                            ) : (
                                <span className={`w-2 h-2 rounded-full ${item.iconClass}`} />
                            )}
                            <div className="flex flex-col min-w-0">
                                <span className="font-bold truncate">{item.label}</span>
                                <span className="text-[9px] opacity-70 truncate">{item.subLabel}</span>
                            </div>
                         </button>
                     ))}
                 </div>
             )}
        </div>
    );
};

const MarkdownToolbar: React.FC<{
    onInsert: (syntax: string, wrap?: boolean) => void;
    onImportClick: () => void;
    onSaveClick: () => void;
    onDriveImport: () => void;
    onDriveSave: () => void;
}> = ({ onInsert, onImportClick, onSaveClick, onDriveImport, onDriveSave }) => (
    <div className="flex items-center gap-1 p-2 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-0.5 border-r border-zinc-700 pr-2 mr-2">
            <button onClick={() => onInsert('**', true)} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white" title="Bold"><Bold size={14}/></button>
            <button onClick={() => onInsert('*', true)} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white" title="Italic"><Italic size={14}/></button>
            <button onClick={() => onInsert('# ')} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white" title="Heading 1"><Heading1 size={14}/></button>
            <button onClick={() => onInsert('## ')} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white" title="Heading 2"><Heading2 size={14}/></button>
        </div>
        <div className="flex items-center gap-0.5 border-r border-zinc-700 pr-2 mr-2">
            <button onClick={() => onInsert('- ')} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white" title="List"><List size={14}/></button>
            <button onClick={() => onInsert('> ')} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white" title="Quote"><Quote size={14}/></button>
            <button onClick={() => onInsert('`', true)} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white" title="Code"><Code size={14}/></button>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-0.5">
             <button onClick={onImportClick} className="flex items-center gap-1.5 px-2 py-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white text-[10px]" title="Import Local File">
                 <Upload size={12}/> Import
             </button>
             <button onClick={onSaveClick} className="flex items-center gap-1.5 px-2 py-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white text-[10px]" title="Save Local File">
                 <Download size={12}/> Save
             </button>
             <div className="w-[1px] h-4 bg-zinc-700 mx-1" />
             <button onClick={onDriveImport} className="flex items-center gap-1.5 px-2 py-1 hover:bg-green-900/30 text-green-400 hover:text-green-300 rounded text-[10px]" title="Load from Drive">
                 <Cloud size={12}/> Drive Load
             </button>
             <button onClick={onDriveSave} className="flex items-center gap-1.5 px-2 py-1 hover:bg-green-900/30 text-green-400 hover:text-green-300 rounded text-[10px]" title="Save to Drive">
                 <HardDrive size={12}/> Drive Save
             </button>
        </div>
    </div>
);

const NodeItemComponent: React.FC<NodeItemProps> = ({ 
    node, isSelected, onSelect, onDelete, onUpdate, onDragStart, onContextMenu, onRequestGeneration,
    activeAsset, isThumbnail, isDragOver, projectAssets, assetThumbnails = {}, refinedImagesMap = {}, approvedImagesMap = {}, projectSettings
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false); // Ref to prevent StrictMode double-execution
  const [progressMsg, setProgressMsg] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedEditMode, setCollapsedEditMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoStartFrameRef = useRef<HTMLInputElement>(null);
  const videoEndFrameRef = useRef<HTMLInputElement>(null);
  const textImportInputRef = useRef<HTMLInputElement>(null); 
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [isCoPilotEnabled, setIsCoPilotEnabled] = useState(true);
  const [suggestion, setSuggestion] = useState('');
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isExpanded) return;
    const target = e.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'LABEL', 'OPTION'].includes(target.tagName)) {
        e.stopPropagation();
        return;
    }
    onDragStart(e, node.id);
  };

  const handleToggleExpand = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isExpanded) setCollapsedEditMode(false); 
      setIsExpanded(!isExpanded);
  };

  const handleToggleCollapsedEdit = (e: React.MouseEvent) => {
      e.stopPropagation();
      setCollapsedEditMode(!collapsedEditMode);
  }

  const handleToggleCoPilot = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsCoPilotEnabled(!isCoPilotEnabled);
      setSuggestion('');
  }

  const handleInsertMarkdown = (syntax: string, wrap: boolean = false) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = node.data.text || '';
      
      let newText = '';
      let newCursorPos = end;

      if (wrap) {
          newText = text.substring(0, start) + syntax + text.substring(start, end) + syntax + text.substring(end);
          newCursorPos = end + (syntax.length * 2);
      } else {
          newText = text.substring(0, start) + syntax + text.substring(end);
          newCursorPos = start + syntax.length;
      }

      onUpdate(node.id, { ...node.data, text: newText });
      
      setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
  };
  
  const addToHistory = (type: 'image'|'video'|'text', content: string) => {
      const newEntry: NodeHistoryItem = {
          type,
          content,
          prompt: node.data.prompt,
          timestamp: Date.now()
      };
      const history = node.data.history || [];
      const newHistory = [newEntry, ...history].slice(0, 10);
      return newHistory;
  }
  
  const handleHistoryNav = (direction: 'prev' | 'next') => {
      const history = node.data.history || [];
      if (history.length === 0) return;
      
      if (direction === 'prev') {
          const [current, ...rest] = history;
          const rotated = [...rest, current];
          
          if (current.type === 'image') onUpdate(node.id, { ...node.data, imageUrl: current.content, history: rotated });
          if (current.type === 'video') onUpdate(node.id, { ...node.data, videoUrl: current.content, history: rotated });
          if (current.type === 'text') onUpdate(node.id, { ...node.data, text: current.content, history: rotated });
      }
  }

  const handleLocalFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          FileService.readTextFile(file).then(content => {
              const current = node.data.text || '';
              onUpdate(node.id, { ...node.data, text: current + (current ? '\n\n' : '') + content });
              if (textImportInputRef.current) textImportInputRef.current.value = ''; 
          }).catch(err => {
              console.error("Failed to read file", err);
              setError("Failed to read file.");
          });
      }
  };

  const handleLocalFileSave = () => {
      const content = node.data.text || '';
      const filename = `Script_${node.id.substring(0, 5)}.md`;
      FileService.saveToLocalFile(content, filename);
  };

  const handleDriveImport = async () => {
      const content = await FileService.simulateDriveImport();
      const current = node.data.text || '';
      onUpdate(node.id, { ...node.data, text: current + (current ? '\n\n' : '') + content });
  };

  const handleDriveSave = async () => {
      setIsProcessing(true);
      await FileService.simulateDriveSave(node.data.text || '');
      setIsProcessing(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      onUpdate(node.id, { ...node.data, text: val });
      if (suggestion) setSuggestion('');

      if (!isCoPilotEnabled) return;

      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(async () => {
          if (!val.trim()) return;
          if (e.target.selectionEnd === val.length) {
               const completion = await GeminiService.generateTextCompletion(val);
               if (completion) setSuggestion(completion);
          }
      }, 500); 
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab' && suggestion) {
          e.preventDefault();
          const newVal = (node.data.text || '') + suggestion;
          onUpdate(node.id, { ...node.data, text: newVal });
          setSuggestion('');
      } else if (e.key === 'Escape') {
          setSuggestion('');
      }
  };

  const handleTextGen = async () => {
    // Route through central generation if callback provided
    if (onRequestGeneration) {
      onUpdate(node.id, { ...node.data, status: 'pending' });
      onRequestGeneration({
        nodeId: node.id,
        type: 'text',
        prompt: node.data.prompt || "",
        config: { styleId: node.data.styleId }
      });
      return;
    }
    
    // Fallback: Direct generation (legacy path)
    setIsProcessing(true);
    setProgressMsg("Writing...");
    setError(null);
    try {
      const { resolved } = resolvePrompt(node.data.prompt || "", projectAssets, activeAsset, projectSettings, null, false, 'text');
      const result = await GeminiService.generateCreativeText(resolved);
      const newHistory = addToHistory('text', result);
      onUpdate(node.id, { ...node.data, text: result, status: 'review', history: newHistory });
    } catch (e) {
      setError("Generation failed. Try again.");
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  const handleImageGen = async () => {
    if (isProcessingRef.current) return; // Prevent double-execution
    
    const rawPrompt = node.data.prompt || (activeAsset ? `@${activeAsset.title}` : "A cinematic shot");
    
    // Route through central generation if callback provided
    if (onRequestGeneration) {
      let refImages: string[] = [];
      if (node.data.referenceImageUrl) {
        refImages = [node.data.referenceImageUrl];
      } else {
        const { matchedAssets } = resolvePrompt(rawPrompt, projectAssets, activeAsset, projectSettings, node.data.styleId);
        refImages = resolveReferenceImages(rawPrompt, projectAssets, activeAsset, refinedImagesMap, approvedImagesMap, assetThumbnails, matchedAssets);
      }
      
      onUpdate(node.id, { ...node.data, status: 'pending' });
      onRequestGeneration({
        nodeId: node.id,
        type: 'image',
        prompt: rawPrompt,
        config: {
          model: node.data.model || MODELS.IMAGE_GEN,
          aspectRatio: node.data.aspectRatio || "16:9",
          styleId: node.data.styleId,
          referenceImages: refImages
        }
      });
      return;
    }
    
    // Fallback: Direct generation (legacy path)
    isProcessingRef.current = true;
    setIsProcessing(true);
    setProgressMsg("Dreaming...");
    setError(null);
    try {
      const { resolved, matchedAssets } = resolvePrompt(
          rawPrompt, 
          projectAssets, 
          activeAsset, 
          projectSettings,
          node.data.styleId,
          false, // debug
          'image' // Strip video-only fields
      );
      const model = node.data.model || MODELS.IMAGE_GEN;

      let refImages: string[] = [];
      if (node.data.referenceImageUrl) {
          refImages = [node.data.referenceImageUrl];
      } else {
          refImages = resolveReferenceImages(
              rawPrompt, 
              projectAssets, 
              activeAsset, 
              refinedImagesMap, 
              approvedImagesMap, 
              assetThumbnails, 
              matchedAssets
          );
      }

      let result: string;
      if (model.includes('luma')) {
          // Route to Luma API for Luma models
          const lumaResult = await generateLumaImage(resolved, BatchType.STANDARD, "1024x1024");
          result = lumaResult.uri;
      } else {
          result = await GeminiService.generateImage(
              resolved,
              node.data.aspectRatio || "16:9",
              model,
              refImages
          );
      }
      const newHistory = addToHistory('image', result);
      onUpdate(node.id, { 
          ...node.data, 
          imageUrl: result, 
          status: 'review', 
          history: newHistory,
          submittedPrompt: resolved 
      });
    } catch (e) {
      setError("Image generation failed.");
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  const handleImageEdit = async () => {
      if (!node.data.imageUrl) return;
      setIsProcessing(true);
      setProgressMsg("Editing...");
      setError(null);
      try {
          const { resolved } = resolvePrompt(node.data.prompt || "Enhance this", projectAssets, activeAsset, projectSettings, null, false, 'image');
          const result = await GeminiService.editImage(node.data.imageUrl, resolved);
          const newHistory = addToHistory('image', result);
          onUpdate(node.id, { 
              ...node.data, 
              imageUrl: result, 
              status: 'review', 
              history: newHistory,
              submittedPrompt: resolved 
          }); 
      } catch(e) {
          setError("Edit failed.");
      } finally {
          setIsProcessing(false);
          setProgressMsg("");
      }
  }

  const handleVideoGen = async () => {
      const rawPrompt = node.data.prompt || "A video scene";
      const model = node.data.model || MODELS.VIDEO_FAST;
      
      // Route through central generation if callback provided
      if (onRequestGeneration) {
        let startImage = node.data.imageUrl;
        if (!startImage) {
          const { matchedAssets } = resolvePrompt(rawPrompt, projectAssets, activeAsset, projectSettings, node.data.styleId);
          const images = resolveReferenceImages(rawPrompt, projectAssets, activeAsset, refinedImagesMap, approvedImagesMap, assetThumbnails, matchedAssets);
          if (images.length > 0) startImage = images[0];
        }
        
        onUpdate(node.id, { ...node.data, status: 'pending' });
        onRequestGeneration({
          nodeId: node.id,
          type: 'video',
          prompt: rawPrompt,
          config: {
            model,
            aspectRatio: node.data.aspectRatio || "16:9",
            styleId: node.data.styleId,
            duration: node.data.duration || "5",
            withAudio: node.data.withAudio,
            startImage,
            endImage: node.data.lastFrameImageUrl
          }
        });
        return;
      }
      
      // Fallback: Direct generation (legacy path)
      setIsProcessing(true);
      setProgressMsg("Starting...");
      setError(null);
      try {
          const { resolved, matchedAssets } = resolvePrompt(
              rawPrompt, 
              projectAssets, 
              activeAsset, 
              projectSettings,
              node.data.styleId,
              false, // debug
              'video' // Keep all fields for video
          );
          
          let refImage = node.data.imageUrl;
          if (!refImage) {
               const images = resolveReferenceImages(
                   rawPrompt, 
                   projectAssets, 
                   activeAsset, 
                   refinedImagesMap, 
                   approvedImagesMap,
                   assetThumbnails, 
                   matchedAssets
               );
               if (images.length > 0) refImage = images[0];
          }

          let result: string;
          // Fix branching: If it's a Luma model, use Luma service
          if (model.includes('luma')) {
              result = await generateLumaVideo(
                  refImage || "",
                  resolved,
                  BatchType.STANDARD,
                  undefined,
                  parseFloat(node.data.duration || "5"),
                  undefined,
                  (msg) => setProgressMsg(msg)
              );
          } else {
              result = await GeminiService.generateVideo(
                  resolved,
                  (node.data.aspectRatio as "16:9" | "9:16") || "16:9",
                  refImage, 
                  model,
                  node.data.duration,
                  node.data.withAudio,
                  node.data.lastFrameImageUrl, 
                  (msg) => setProgressMsg(msg)
              );
          }

          const newHistory = addToHistory('video', result);
          onUpdate(node.id, { 
              ...node.data, 
              videoUrl: result, 
              status: 'review', 
              history: newHistory,
              submittedPrompt: resolved 
          });
      } catch (e: any) {
          console.error("Video Gen Error", e);
          setError("Video generation failed. " + (e.message || ""));
      } finally {
          setIsProcessing(false);
          setProgressMsg("");
      }
  }

  useEffect(() => {
    // Guard: only trigger if status is 'generating' (direct generation), not 'pending' (queue-managed)
    // 'pending' nodes are processed by RenderQueue, not by this useEffect
    // Use a flag to prevent double-execution from React StrictMode
    let cancelled = false;
    
    if (node.data.status === 'generating' && !isProcessing) {
       if (node.type === NodeType.AI_IMAGE_GEN && !node.data.imageUrl) {
           handleImageGen(); // Ref guard inside handleImageGen prevents double-execution
       } else if (node.type === NodeType.AI_TEXT_GEN && !node.data.text) {
           handleTextGen();
       }
    }
  }, [node.data.status]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'imageUrl' | 'lastFrameImageUrl' = 'imageUrl') => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = () => {
          onUpdate(node.id, { ...node.data, [field]: reader.result as string, status: 'draft' });
      };
      reader.readAsDataURL(file);
  }

  const setStatus = (status: 'draft' | 'approved' | 'review' | 'archived') => {
      onUpdate(node.id, { ...node.data, status });
  }

  const toggleCollapse = () => {
      onUpdate(node.id, { ...node.data, collapsed: !node.data.collapsed });
  }

  const renderContent = (expanded = false) => {
    switch (node.type) {
      case NodeType.GROUP:
          return (
              <div className="p-4 h-full flex items-center justify-center text-zinc-700">
                  {node.data.collapsed ? (
                      <span className="text-xs italic">Content Hidden ({node.data.label})</span>
                  ) : (
                      <span className="text-[200px] opacity-5 select-none pointer-events-none">
                          <FolderOpen />
                      </span>
                  )}
              </div>
          );

      case NodeType.TEXT_INPUT:
        if (expanded) {
            return (
                <div className="flex flex-col h-full max-w-7xl mx-auto w-full bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden shadow-2xl">
                    <MarkdownToolbar 
                        onInsert={handleInsertMarkdown} 
                        onImportClick={() => textImportInputRef.current?.click()}
                        onSaveClick={handleLocalFileSave}
                        onDriveImport={handleDriveImport}
                        onDriveSave={handleDriveSave}
                    />
                    <input type="file" ref={textImportInputRef} className="hidden" onChange={handleLocalFileImport} accept=".txt,.md,.json,.rtf" />

                    <div className="flex-1 flex min-h-0">
                        <div className="flex-1 flex flex-col border-r border-zinc-800 relative bg-zinc-900">
                             <div className="bg-zinc-900 px-3 py-1 text-[10px] text-zinc-500 font-mono border-b border-zinc-800 flex justify-between items-center">
                                 <span>EDITOR (MARKDOWN)</span>
                                 {isCoPilotEnabled && suggestion && <span className="text-blue-400 animate-pulse">Co-Pilot Active (Tab to accept)</span>}
                             </div>
                             
                             <div className="relative flex-1">
                                {isCoPilotEnabled && suggestion && (
                                    <div className="absolute inset-0 p-4 font-mono text-sm text-transparent whitespace-pre-wrap break-words pointer-events-none z-0" aria-hidden="true">
                                        {node.data.text}<span className="text-zinc-500/70">{suggestion}</span>
                                    </div>
                                )}

                                <textarea
                                    ref={textareaRef}
                                    value={node.data.text || ''}
                                    onChange={handleInputChange}
                                    onKeyDown={handleInputKeyDown}
                                    placeholder="# Scene Heading..."
                                    className="absolute inset-0 w-full h-full p-4 bg-transparent text-zinc-200 font-mono text-sm resize-none focus:outline-none z-10"
                                    spellCheck={false}
                                />
                             </div>
                        </div>
                        <div className="flex-1 flex flex-col bg-zinc-950">
                            <div className="bg-zinc-950 px-3 py-1 text-[10px] text-zinc-500 font-mono border-b border-zinc-800">PREVIEW</div>
                            <div className="flex-1 p-8 overflow-y-auto markdown-preview">
                                <ReactMarkdown>{node.data.text || '_No content_'}</ReactMarkdown>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        
        return (
          <div className="h-full flex flex-col relative group/input">
             {collapsedEditMode ? (
                 <div className="relative w-full h-full">
                     {isCoPilotEnabled && suggestion && (
                         <div className="absolute inset-0 p-3 text-sm leading-relaxed font-sans text-transparent whitespace-pre-wrap break-words pointer-events-none z-0" aria-hidden="true">
                             {node.data.text}<span className="text-zinc-500/70">{suggestion}</span>
                         </div>
                     )}

                     <textarea 
                        value={node.data.text || ''}
                        onChange={handleInputChange}
                        onKeyDown={handleInputKeyDown}
                        placeholder="Write something..."
                        className="absolute inset-0 w-full h-full bg-zinc-900/50 border-none resize-none text-sm leading-relaxed p-3 focus:outline-none text-zinc-200 z-10 bg-transparent font-sans"
                        autoFocus
                     />
                 </div>
             ) : (
                 <div className="h-full p-4 overflow-y-auto markdown-preview text-xs select-text" onDoubleClick={handleToggleExpand}>
                     <ReactMarkdown>{node.data.text || ''}</ReactMarkdown>
                     {!node.data.text && <span className="text-zinc-600 italic">Empty note...</span>}
                 </div>
             )}
          </div>
        );

      case NodeType.AI_TEXT_GEN:
        return (
          <div className={`flex flex-col h-full ${expanded ? 'max-w-4xl mx-auto w-full' : ''}`}>
             <div className="flex-1 p-2 overflow-y-auto min-h-0 markdown-preview bg-zinc-950/30 rounded-t">
                 {node.data.text ? (
                     <ReactMarkdown>{node.data.text}</ReactMarkdown>
                 ) : (
                     <div className="h-full flex items-center justify-center text-zinc-600 text-xs italic">
                         {isProcessing ? progressMsg || "Thinking..." : "Generated text will appear here..."}
                     </div>
                 )}
             </div>

             <div className="border-t border-zinc-800 p-2 bg-zinc-900/50 rounded-b space-y-2">
                 <TextArea 
                    value={node.data.prompt || ''}
                    onChange={(e) => onUpdate(node.id, { ...node.data, prompt: e.target.value })}
                    placeholder={activeAsset ? `Write about @${activeAsset.title}...` : "Describe what to write..."}
                    className={`${expanded ? 'min-h-[80px] text-base' : 'h-16 text-xs'}`}
                 />
                 <Button onClick={handleTextGen} disabled={isProcessing || !node.data.prompt} className="w-full py-1" size="sm">
                   {isProcessing ? "Thinking..." : "Generate"}
                 </Button>
             </div>
          </div>
        );

      case NodeType.AI_IMAGE_GEN:
        return (
            <div className={`p-3 space-y-2 ${expanded ? 'h-full flex flex-col' : 'flex flex-col h-full'}`}>
                 {node.data.imageUrl ? (
                     <div className={`relative group ${expanded ? 'flex-1 flex items-center justify-center bg-zinc-900/50 rounded-lg overflow-hidden' : 'flex-1 flex items-center justify-center bg-zinc-900/50 rounded overflow-hidden min-h-0'}`}>
                         <img 
                            src={node.data.imageUrl} 
                            alt="Generated" 
                            className={`rounded border border-zinc-700 ${expanded ? 'max-h-full max-w-full object-contain' : 'max-h-full max-w-full object-contain'}`}
                            onDoubleClick={(e) => { e.stopPropagation(); onImageClick?.(); }}
                         />
                         
                         {!expanded && (
                             <button 
                                onClick={() => onUpdate(node.id, {...node.data, imageUrl: undefined})}
                                className="absolute top-1 right-1 bg-black/50 p-1 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <X size={12}/>
                            </button>
                         )}

                         {isThumbnail && !expanded && (
                             <div className="absolute bottom-2 right-2 bg-blue-600 text-white p-1.5 rounded shadow-lg border border-blue-400" title="Active Asset Thumbnail">
                                 <User size={12} fill="currentColor" />
                             </div>
                         )}
                         
                         {node.data.tag === 'refinement' && !expanded && (
                             <div className="absolute top-2 left-2 bg-green-600/80 text-white p-1 rounded text-[9px] font-bold border border-green-400">
                                 REF
                             </div>
                         )}
                     </div>
                 ) : (
                     <div className={`${expanded ? 'flex-1' : 'flex-1 min-h-0'} bg-zinc-900/50 rounded flex items-center justify-center border border-dashed border-zinc-700 text-zinc-600 text-xs`}>
                         {(isProcessing || node.data.status === 'pending') ? (
                             <div className="flex flex-col items-center gap-2">
                                <Sparkles className="animate-spin text-purple-500" />
                                <span className="animate-pulse">{progressMsg || "Dreaming..."}</span>
                             </div>
                         ) : "No Image"}
                     </div>
                 )}
                 
                 <div className={`${expanded ? 'max-w-2xl mx-auto w-full pt-4' : 'shrink-0'}`}>
                     <label className="text-xs text-zinc-400 uppercase font-bold flex justify-between">
                         <span>Prompt & Settings</span>
                         {node.data.tag === 'refinement' && <span className="text-green-500">Refinement Mode</span>}
                     </label>
                     <div className="flex flex-col gap-2 mt-1">
                        <HighlightedInput
                            value={node.data.prompt || ''}
                            onChange={(val) => onUpdate(node.id, { ...node.data, prompt: val })}
                            placeholder={activeAsset ? `@${activeAsset.title} in a scene...` : "A futuristic city..."}
                            className={`${expanded ? 'h-20' : 'h-14'} mb-1 w-full bg-zinc-900 rounded border border-zinc-700`}
                            projectAssets={projectAssets}
                            activeAsset={activeAsset}
                            projectSettings={projectSettings}
                        />
                        
                        <div className="relative z-20 mb-1">
                            <StyleSelector 
                                selectedId={node.data.styleId} 
                                onChange={(id) => onUpdate(node.id, { ...node.data, styleId: id })}
                                projectSettings={projectSettings}
                            />
                        </div>

                        <div className="flex gap-2">
                             <Select 
                                value={node.data.model || MODELS.IMAGE_GEN}
                                onChange={(e) => onUpdate(node.id, { ...node.data, model: e.target.value })}
                                className="flex-1 text-xs"
                             >
                                 {IMAGE_MODELS_OPTIONS.map(m => (
                                     <option key={m.value} value={m.value}>{m.label}</option>
                                 ))}
                             </Select>
                            <Select 
                                value={node.data.aspectRatio || '16:9'} 
                                onChange={(e) => onUpdate(node.id, { ...node.data, aspectRatio: e.target.value })}
                                className="w-24 text-xs"
                            >
                                {ASPECT_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
                            </Select>
                            <Button onClick={handleImageGen} disabled={isProcessing || !node.data.prompt} className="px-4 py-1">
                                {isProcessing ? "..." : "Gen"}
                            </Button>
                        </div>
                     </div>
                 </div>
            </div>
        );

      case NodeType.AI_IMAGE_EDIT:
          return (
            <div className={`p-3 space-y-2 ${expanded ? 'h-full flex flex-col' : ''}`}>
                 <div 
                    className={`${expanded ? 'flex-1' : 'h-32'} bg-zinc-900/50 rounded flex items-center justify-center border border-dashed border-zinc-700 overflow-hidden relative cursor-pointer`}
                    onClick={() => !node.data.imageUrl && fileInputRef.current?.click()}
                 >
                     {node.data.imageUrl ? (
                         <>
                            <img src={node.data.imageUrl} className={`w-full h-full ${expanded ? 'object-contain' : 'object-cover'}`} onDoubleClick={(e) => { e.stopPropagation(); onImageClick?.(); }} />
                            {isThumbnail && !expanded && (
                                <div className="absolute bottom-2 right-2 bg-blue-600 text-white p-1.5 rounded shadow-lg border border-blue-400">
                                    <User size={12} fill="currentColor" />
                                </div>
                            )}
                         </>
                     ) : (
                         <div className="text-center p-2">
                            <ImageIcon className="mx-auto mb-1 text-zinc-600" />
                            <span className="text-[10px] text-zinc-500">Drop image or click to upload source</span>
                         </div>
                     )}
                     <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*" />
                 </div>

                 <div className={expanded ? 'max-w-2xl mx-auto w-full pt-4' : ''}>
                     <label className="text-xs text-zinc-400 uppercase font-bold">Edit Instruction</label>
                     <div className="flex gap-2 mt-1">
                        <Input 
                            value={node.data.prompt || ''}
                            onChange={(e) => onUpdate(node.id, { ...node.data, prompt: e.target.value })}
                            placeholder={activeAsset ? `Make @${activeAsset.title} look older...` : "Add sunglasses..."}
                            className="flex-1"
                        />
                        <Button onClick={handleImageEdit} disabled={isProcessing || !node.data.prompt || !node.data.imageUrl} variant="secondary" className="whitespace-nowrap">
                            <Sparkles size={14} className="mr-1"/>
                            {isProcessing ? "Editing..." : "Apply Edit"}
                        </Button>
                     </div>
                 </div>
            </div>
          );

      case NodeType.AI_VIDEO_GEN:
          const modelCapabilities = VIDEO_MODEL_CAPABILITIES[node.data.model || MODELS.VIDEO_FAST];
          const supportsLastFrame = modelCapabilities?.supportsLastFrame || false;
          
          return (
            <div className={`p-3 space-y-2 ${expanded ? 'h-full flex flex-col' : 'flex flex-col h-full'}`}>
                 {node.data.videoUrl ? (
                     <video controls src={node.data.videoUrl} className={`rounded border border-zinc-700 bg-black ${expanded ? 'flex-1 w-full h-full' : 'w-full flex-1 min-h-0 object-contain'}`} />
                 ) : (
                    <div className={`${expanded ? 'flex-1' : 'flex-1 min-h-0'} bg-zinc-900/50 rounded flex items-center justify-center border border-dashed border-zinc-700 text-zinc-600`}>
                         {(isProcessing || node.data.status === 'pending') ? (
                             <div className="flex flex-col items-center gap-2">
                                <Film className="animate-spin text-red-500" />
                                <span className="animate-pulse text-xs">{progressMsg || "Dreaming..."}</span>
                             </div>
                         ) : "No Video"}
                    </div>
                 )}

                 <div className="grid grid-cols-2 gap-2 h-16 shrink-0">
                     <div 
                        className="bg-zinc-900/50 rounded border border-zinc-800 flex items-center justify-center relative overflow-hidden cursor-pointer hover:border-zinc-600 transition-colors"
                        onClick={() => videoStartFrameRef.current?.click()}
                        title="Start Frame"
                     >
                         {node.data.imageUrl ? (
                             <img src={node.data.imageUrl} className="w-full h-full object-cover opacity-60" />
                         ) : (
                             <span className="text-[9px] text-zinc-600 uppercase font-bold">Start Frame</span>
                         )}
                         <input type="file" ref={videoStartFrameRef} className="hidden" onChange={(e) => handleFileUpload(e, 'imageUrl')} accept="image/*" />
                     </div>

                     <div 
                        className={`bg-zinc-900/50 rounded border border-zinc-800 flex items-center justify-center relative overflow-hidden transition-colors ${supportsLastFrame ? 'cursor-pointer hover:border-zinc-600' : 'opacity-30 cursor-not-allowed'}`}
                        onClick={() => supportsLastFrame && videoEndFrameRef.current?.click()}
                        title={supportsLastFrame ? "End Frame (Loop)" : "End Frame Not Supported"}
                     >
                         {node.data.lastFrameImageUrl ? (
                             <img src={node.data.lastFrameImageUrl} className="w-full h-full object-cover opacity-60" />
                         ) : (
                             <span className="text-[9px] text-zinc-600 uppercase font-bold">End Frame</span>
                         )}
                         <input type="file" ref={videoEndFrameRef} className="hidden" onChange={(e) => handleFileUpload(e, 'lastFrameImageUrl')} accept="image/*" disabled={!supportsLastFrame} />
                     </div>
                 </div>

                 <div className={`${expanded ? 'max-w-2xl mx-auto w-full pt-4' : 'shrink-0'}`}>
                     <label className="text-xs text-zinc-400 uppercase font-bold">Prompt & Config</label>
                     <HighlightedInput
                            value={node.data.prompt || ''}
                            onChange={(val) => onUpdate(node.id, { ...node.data, prompt: val })}
                            placeholder={activeAsset ? `@${activeAsset.title} running...` : "A cat flying in space..."}
                            className={`${expanded ? 'h-20' : 'h-14'} mb-1 w-full bg-zinc-900 rounded border border-zinc-700`}
                            projectAssets={projectAssets}
                            activeAsset={activeAsset}
                            projectSettings={projectSettings}
                    />
                    
                    <div className="relative z-20 mb-1">
                        <StyleSelector 
                            selectedId={node.data.styleId} 
                            onChange={(id) => onUpdate(node.id, { ...node.data, styleId: id })}
                            projectSettings={projectSettings}
                        />
                    </div>

                     <div className="flex flex-col gap-2">
                         <div className="flex gap-1">
                             <Select 
                                value={node.data.model || MODELS.VIDEO_FAST}
                                onChange={(e) => onUpdate(node.id, { ...node.data, model: e.target.value, duration: undefined })}
                                className="w-full text-xs flex-[2]"
                             >
                                 {VIDEO_MODELS_OPTIONS.map(m => (
                                     <option key={m.value} value={m.value}>{m.label}</option>
                                 ))}
                             </Select>
                             <Select value={node.data.aspectRatio || '16:9'} onChange={(e) => onUpdate(node.id, { ...node.data, aspectRatio: e.target.value })} className="w-full text-xs flex-1">
                                    <option value="16:9">16:9</option>
                                    <option value="9:16">9:16</option>
                             </Select>
                        </div>
                        
                        <div className="flex gap-1">
                            {modelCapabilities && (
                                <Select 
                                    value={node.data.duration || modelCapabilities.durations[0]} 
                                    onChange={(e) => onUpdate(node.id, { ...node.data, duration: e.target.value })} 
                                    className="w-full text-xs flex-1"
                                    title="Duration (Seconds)"
                                >
                                    {modelCapabilities.durations.map(d => (
                                        <option key={d} value={d}>{d}s</option>
                                    ))}
                                </Select>
                            )}
                            
                            {modelCapabilities?.supportsAudio && (
                                <button 
                                    onClick={() => onUpdate(node.id, { ...node.data, withAudio: !node.data.withAudio })}
                                    className={`flex items-center justify-center gap-1 text-xs px-2 rounded border transition-colors ${node.data.withAudio ? 'bg-zinc-700 text-white border-zinc-600' : 'bg-zinc-900 text-zinc-500 border-zinc-800'}`}
                                >
                                    {node.data.withAudio ? <Volume2 size={12}/> : <VolumeX size={12}/>}
                                </button>
                            )}
                            
                            <Button onClick={handleVideoGen} disabled={isProcessing || (!node.data.prompt && !node.data.imageUrl)} className="flex-[2] py-1 text-xs">
                                <Film size={14} className="mr-1"/>
                                {isProcessing ? "Generating" : "Generate"}
                            </Button>
                        </div>
                     </div>
                 </div>
            </div>
          );
      
      default:
        return <div className="p-2 text-zinc-500 text-sm">Unknown Node</div>;
    }
  };

  const getHeaderColor = () => {
      if (node.type === NodeType.GROUP) return "bg-zinc-800 border-zinc-700 text-zinc-400";
      if (node.data.status === 'approved') return "bg-green-900/40 border-green-800 text-green-200";
      if (node.data.status === 'review') return "bg-yellow-900/40 border-yellow-800 text-yellow-200";
      if (node.data.status === 'archived') return "bg-zinc-800/40 border-zinc-700 text-zinc-500";
      if (node.data.status === 'generating' || node.data.status === 'pending') return "bg-purple-900/50 border-purple-700 text-white animate-pulse";

      switch(node.type) {
          case NodeType.AI_TEXT_GEN: return "bg-blue-900/30 border-blue-800 text-blue-200";
          case NodeType.AI_IMAGE_GEN: return "bg-purple-900/30 border-purple-800 text-purple-200";
          case NodeType.AI_IMAGE_EDIT: return "bg-pink-900/30 border-pink-800 text-pink-200";
          case NodeType.AI_VIDEO_GEN: return "bg-red-900/30 border-red-800 text-red-200";
          default: return "bg-zinc-800 border-zinc-700 text-zinc-300";
      }
  }

  const getBorderColor = () => {
      if (isDragOver) return "ring-2 ring-blue-400 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)]";
      if (isSelected) return "ring-2 ring-blue-500 border-transparent";
      if (node.type === NodeType.GROUP) return "border-zinc-700 border-dashed";
      if (node.data.status === 'approved') return "border-green-600/50 ring-1 ring-green-900";
      if (node.data.status === 'review') return "border-yellow-600/50 ring-1 ring-yellow-900";
      if (node.data.status === 'generating' || node.data.status === 'pending') return "border-purple-500/50 ring-1 ring-purple-900";
      return "border-zinc-700";
  }

  const getTitle = () => {
      if (node.type === NodeType.GROUP) return node.data.label || "Group";
      switch(node.type) {
          case NodeType.TEXT_INPUT: return "Script / Note";
          case NodeType.AI_TEXT_GEN: return "Writer's Assistant";
          case NodeType.AI_IMAGE_GEN: return "Image Generator";
          case NodeType.AI_IMAGE_EDIT: return "Nano Banana Edit";
          case NodeType.AI_VIDEO_GEN: return "Veo Video";
          default: return "Node";
      }
  }

  const isGroup = node.type === NodeType.GROUP;
  const hasHistory = node.data.history && node.data.history.length > 0;

  if (isExpanded) {
      return createPortal(
          <div className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col animate-in fade-in zoom-in-95 duration-200 text-zinc-200 font-sans">
               <div className={`flex items-center justify-between px-6 py-3 border-b border-zinc-800 ${getHeaderColor()}`}>
                   <div className="flex items-center gap-3">
                       <span className="text-lg font-bold flex items-center gap-2">
                           {!isGroup && node.data.status === 'approved' && <CheckCircle size={20}/>}
                           {!isGroup && node.data.status === 'review' && <Eye size={20}/>}
                           {getTitle()}
                       </span>
                       <span className="text-sm opacity-50 px-2 border-l border-white/20">Full Screen Mode</span>
                   </div>
                   <div className="flex items-center gap-2">
                        {node.type === NodeType.TEXT_INPUT && (
                            <button onClick={handleToggleCoPilot} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${isCoPilotEnabled ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-zinc-800 text-zinc-500'}`}>
                                <Bot size={14} /> {isCoPilotEnabled ? "Co-Pilot ON" : "Co-Pilot OFF"}
                            </button>
                        )}
                        <button onClick={handleToggleExpand} className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white" title="Minimize">
                            <Minimize2 size={20} />
                        </button>
                   </div>
               </div>
               
               <div className="flex-1 overflow-y-auto bg-zinc-950/50 relative p-8">
                   {renderContent(true)}
               </div>
          </div>,
          document.body
      );
  }

  const nodeWidth = node.width || (isGroup ? 400 : 288);
  const nodeHeight = node.data.collapsed ? 42 : (node.height || 'auto');
  const zIndex = isGroup ? 1 : (isSelected ? 50 : 10); 

  return (
    <div 
      className={`absolute flex flex-col rounded-lg shadow-md border transition-colors ${getBorderColor()} ${node.data.status === 'archived' ? 'opacity-50 grayscale' : 'opacity-100'} ${isGroup ? 'bg-zinc-950/30' : 'bg-zinc-900'}`}
      style={{ left: node.position.x, top: node.position.y, width: nodeWidth, height: nodeHeight, zIndex: zIndex }}
      onClick={(e) => { e.stopPropagation(); onSelect(e, node.id); }}
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => { if (onContextMenu) onContextMenu(e, node.id); }}
    >
      <div 
        className={`flex items-center justify-between px-3 py-2 rounded-t-lg border-b cursor-grab active:cursor-grabbing select-none ${getHeaderColor()}`}
        onDoubleClick={handleToggleExpand}
        title="Double click to expand"
      >
        <div className="flex items-center gap-2">
             {isGroup && (
                 <button onClick={(e) => { e.stopPropagation(); toggleCollapse(); }}>
                     {node.data.collapsed ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}
                 </button>
             )}
             <span className="text-xs font-bold tracking-wide flex items-center gap-2">
                {!isGroup && node.data.status === 'approved' && <CheckCircle size={12}/>}
                {!isGroup && node.data.status === 'review' && <Eye size={12}/>}
                {!isGroup && (node.data.status === 'generating' || node.data.status === 'pending') && <Sparkles size={12} className="animate-spin"/>}
                {getTitle()}
            </span>
        </div>
        
        <div className="flex items-center gap-1">
            {hasHistory && (
                <button onClick={(e) => { e.stopPropagation(); handleHistoryNav('prev'); }} className="text-white/50 hover:text-white mx-1" title="Previous Generation">
                    <History size={12} />
                </button>
            )}
            
            {node.type === NodeType.TEXT_INPUT && (
                <button onClick={handleToggleCoPilot} className={`p-1 rounded mr-1 transition-colors ${isCoPilotEnabled ? 'text-blue-400 hover:text-blue-300' : 'text-zinc-600 hover:text-zinc-400'}`}>
                    <Bot size={14} />
                </button>
            )}
            {node.type === NodeType.TEXT_INPUT && !isExpanded && (
                <button onClick={handleToggleCollapsedEdit} className="text-zinc-400 hover:text-white mr-1">
                    {collapsedEditMode ? <Eye size={14} /> : <Edit size={14} />}
                </button>
            )}
            <button onClick={handleToggleExpand} className="text-white/50 hover:text-white">
                <Maximize2 size={14} />
            </button>
        </div>
      </div>

      <div className={`relative flex-1 overflow-hidden ${isGroup && node.data.collapsed ? 'hidden' : ''}`}>
        {renderContent(false)}
        {error && <div className="px-3 pb-2 text-[10px] text-red-400">{error}</div>}
      </div>

      {!isGroup && (
      <div className="flex items-center border-t border-zinc-800 p-1 gap-1 bg-zinc-950/50 rounded-b-lg shrink-0">
          {node.data.status === 'archived' ? (
            <button onClick={(e) => { e.stopPropagation(); setStatus('draft'); }} className="flex-1 py-1 text-[10px] font-medium rounded flex items-center justify-center gap-1 transition-colors text-zinc-400 hover:bg-zinc-800 hover:text-green-400">
                <RotateCcw size={10} /> Restore
            </button>
          ) : (
            <>
                <button onClick={(e) => { e.stopPropagation(); setStatus('approved'); }} className={`flex-1 py-1 text-[10px] font-medium rounded flex items-center justify-center gap-1 transition-colors ${node.data.status === 'approved' ? 'bg-green-900 text-green-200' : 'text-zinc-500 hover:bg-zinc-800 hover:text-green-400'}`}>
                    <CheckCircle size={10} /> Approve
                </button>
                <button onClick={(e) => { e.stopPropagation(); setStatus('review'); }} className={`flex-1 py-1 text-[10px] font-medium rounded flex items-center justify-center gap-1 transition-colors ${node.data.status === 'review' ? 'bg-yellow-900 text-yellow-200' : 'text-zinc-500 hover:bg-zinc-800 hover:text-yellow-400'}`}>
                    <AlertCircle size={10} /> Review
                </button>
                <button onClick={(e) => { e.stopPropagation(); setStatus('archived'); }} className={`flex-1 py-1 text-[10px] font-medium rounded flex items-center justify-center gap-1 transition-colors text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300`}>
                    <Archive size={10} /> Archive
                </button>
            </>
          )}
      </div>
      )}
    </div>
  );
};

export const NodeItem = memo(NodeItemComponent);
