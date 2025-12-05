import React, { useState, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { FlowNode, NodeType, ProjectAsset } from '../types';
import { Move, Play, X, Sparkles, Edit, Image as ImageIcon, Film, CheckCircle, Eye, Archive, AlertCircle, Folder, FolderOpen, ChevronDown, ChevronRight, RotateCcw, User, Maximize2, Minimize2, Bold, Italic, Heading1, Heading2, List, Quote, Code, EyeOff, Bot, Upload, Download, HardDrive, FileText, Cloud } from 'lucide-react';
import { Button, Input, TextArea, Select } from './UI';
import { ASPECT_RATIOS, IMAGE_MODELS_OPTIONS, MODELS } from '../constants';
import * as GeminiService from '../services/geminiService';
import * as FileService from '../services/fileService';

interface NodeItemProps {
  node: FlowNode;
  isSelected: boolean;
  onSelect: (e: React.MouseEvent, id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: any) => void;
  onDragStart: (e: React.MouseEvent, id: string) => void;
  onContextMenu?: (e: React.MouseEvent, id: string) => void;
  activeAsset?: ProjectAsset;
  isThumbnail?: boolean;
  isDragOver?: boolean; 
  projectAssets?: ProjectAsset[];
  assetThumbnails?: Record<string, string>;
}

const MarkdownToolbar: React.FC<{ 
    onInsert: (syntax: string, wrap?: boolean) => void,
    onImportClick: () => void,
    onSaveClick: () => void,
    onDriveImport: () => void,
    onDriveSave: () => void
}> = ({ onInsert, onImportClick, onSaveClick, onDriveImport, onDriveSave }) => {
    return (
        <div className="flex items-center justify-between p-2 bg-zinc-800 border-b border-zinc-700">
            <div className="flex items-center gap-1">
                <button onClick={() => onInsert('**', true)} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200" title="Bold">
                    <Bold size={14} />
                </button>
                <button onClick={() => onInsert('*', true)} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200" title="Italic">
                    <Italic size={14} />
                </button>
                <div className="w-[1px] h-4 bg-zinc-700 mx-1" />
                <button onClick={() => onInsert('# ', false)} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200" title="Heading 1">
                    <Heading1 size={14} />
                </button>
                <button onClick={() => onInsert('## ', false)} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200" title="Heading 2">
                    <Heading2 size={14} />
                </button>
                <div className="w-[1px] h-4 bg-zinc-700 mx-1" />
                <button onClick={() => onInsert('- ', false)} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200" title="List">
                    <List size={14} />
                </button>
                <button onClick={() => onInsert('> ', false)} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200" title="Quote">
                    <Quote size={14} />
                </button>
                <button onClick={() => onInsert('`', true)} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200" title="Code">
                    <Code size={14} />
                </button>
            </div>
            
            <div className="flex items-center gap-2 pl-2 border-l border-zinc-700">
                <div className="flex items-center bg-zinc-900 rounded p-0.5 border border-zinc-700">
                    <button onClick={onImportClick} className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors" title="Upload local file">
                        <Upload size={12} /> Upload
                    </button>
                    <div className="w-[1px] h-3 bg-zinc-700 mx-0.5" />
                    <button onClick={onDriveImport} className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors" title="Import from Drive">
                        <Cloud size={12} /> Drive
                    </button>
                </div>

                <div className="flex items-center bg-zinc-900 rounded p-0.5 border border-zinc-700">
                    <button onClick={onSaveClick} className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors" title="Save to Disk">
                        <Download size={12} /> Save
                    </button>
                    <div className="w-[1px] h-3 bg-zinc-700 mx-0.5" />
                    <button onClick={onDriveSave} className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors" title="Save to Drive">
                        <Cloud size={12} /> Drive
                    </button>
                </div>
            </div>
        </div>
    );
};

const NodeItemComponent: React.FC<NodeItemProps> = ({ 
    node, isSelected, onSelect, onDelete, onUpdate, onDragStart, onContextMenu, 
    activeAsset, isThumbnail, isDragOver, projectAssets, assetThumbnails = {} 
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedEditMode, setCollapsedEditMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textImportInputRef = useRef<HTMLInputElement>(null); 
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Co-Pilot State
  const [isCoPilotEnabled, setIsCoPilotEnabled] = useState(true);
  const [suggestion, setSuggestion] = useState('');
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Helper: Prompt Resolver ---
  const resolvePrompt = (text: string) => {
    if (!text) return text;
    let resolved = text;
    
    try {
        // 1. Resolve Global Project Asset References (@Zax, @Neo, etc.) AND Dot Syntax (@Zax.Look)
        if (projectAssets) {
            // Sort by title length desc
            const sortedAssets = [...projectAssets].sort((a, b) => b.title.length - a.title.length);
            
            // Regex to find @Word or @Word.Word
            // We'll iterate manually to handle the logic
            
            for (const asset of sortedAssets) {
                // Case 1: Dot Syntax (@Asset.Child)
                const safeTitle = asset.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const dotRegex = new RegExp(`@${safeTitle}\\.([a-zA-Z0-9_]+)\\b`, 'gi');
                
                resolved = resolved.replace(dotRegex, (match, childName) => {
                    const child = projectAssets.find(c => c.parentId === asset.id && c.title.toLowerCase() === childName.toLowerCase());
                    if (child) {
                        return `${asset.description}, wearing ${child.description}`; 
                    }
                    return match; // Keep original if child not found
                });

                // Case 2: Standard Syntax (@Asset)
                const standardRegex = new RegExp(`@${safeTitle}\\b`, 'gi');
                if (standardRegex.test(resolved)) {
                    let replacement = asset.description;
                    
                    // Inheritance Logic
                    let effectiveStyle = asset.visualStyle;
                    if (!effectiveStyle && asset.parentId) {
                         const parent = projectAssets.find(p => p.id === asset.parentId);
                         if (parent) effectiveStyle = parent.visualStyle;
                    }

                    if (effectiveStyle) {
                        replacement += `, visual style: ${effectiveStyle}`;
                    }
                    resolved = resolved.replace(standardRegex, replacement);
                }
            }
        }

        // 2. Resolve Contextual Keywords (@character, @parent)
        if (activeAsset) {
            // Check inheritance for Active Asset
            let activeStyle = activeAsset.visualStyle;
            let parentDesc = "";
            
            if (projectAssets && activeAsset.parentId) {
                const parent = projectAssets.find(p => p.id === activeAsset.parentId);
                if (parent) {
                    if (!activeStyle) activeStyle = parent.visualStyle;
                    parentDesc = parent.description;
                }
            }

            let replacement = activeAsset.description;
            if (activeStyle) replacement += `, visual style: ${activeStyle}`;

            // Replace @character
            resolved = resolved.replace(/@character/gi, replacement);
            
            // Replace @parent (useful for shots inheriting scene context)
            if (parentDesc) {
                 resolved = resolved.replace(/@parent/gi, parentDesc);
            }
        }
    } catch (e) {
        console.warn("Prompt resolution failed", e);
    }
    return resolved;
  };

  // --- Reference Image Finder ---
  const resolveReferenceImage = (text: string): string | undefined => {
      if (!projectAssets) return undefined;
      // Find first mentioned asset that has a thumbnail
      for (const asset of projectAssets) {
          if (text.toLowerCase().includes(`@${asset.title.toLowerCase()}`)) {
              // Check if we have a thumbnail
              const thumb = assetThumbnails[asset.id] || asset.thumbnailUrl;
              if (thumb) return thumb;
          }
      }
      // If we are in asset context and referencing @character
      if (activeAsset && text.toLowerCase().includes('@character')) {
           const thumb = assetThumbnails[activeAsset.id] || activeAsset.thumbnailUrl;
           if (thumb) return thumb;
      }
      return undefined;
  };


  // --- Handlers ---

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

  // --- File Ops ---

  const handleLocalFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          FileService.readTextFile(file).then(content => {
              const current = node.data.text || '';
              onUpdate(node.id, { ...node.data, text: current + (current ? '\n\n' : '') + content });
              if (textImportInputRef.current) textImportInputRef.current.value = ''; // Reset
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

  // --- Co-Pilot Logic ---
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

  // --- Gen Logic ---

  const handleTextGen = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const prompt = resolvePrompt(node.data.prompt || "");
      const result = await GeminiService.generateCreativeText(prompt);
      onUpdate(node.id, { ...node.data, text: result, status: 'review' });
    } catch (e) {
      setError("Generation failed. Try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImageGen = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const rawPrompt = node.data.prompt || (activeAsset ? `@${activeAsset.title}` : "A cinematic shot");
      const finalPrompt = resolvePrompt(rawPrompt);
      const model = node.data.model || MODELS.IMAGE_GEN;

      // Check for Reference Image Injection
      // Only if user hasn't uploaded their own image to edit? 
      // Actually AI_IMAGE_GEN doesn't support manual upload in this app design (only AI_IMAGE_EDIT).
      // So we can always try to find a reference.
      const refImage = resolveReferenceImage(rawPrompt);

      const result = await GeminiService.generateImage(
          finalPrompt,
          node.data.aspectRatio || "16:9",
          model,
          refImage
      );
      onUpdate(node.id, { ...node.data, imageUrl: result, status: 'review' });
    } catch (e) {
      setError("Image generation failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImageEdit = async () => {
      if (!node.data.imageUrl) return;
      setIsProcessing(true);
      setError(null);
      try {
          const prompt = resolvePrompt(node.data.prompt || "Enhance this");
          const result = await GeminiService.editImage(node.data.imageUrl, prompt);
          onUpdate(node.id, { ...node.data, imageUrl: result, status: 'review' }); 
      } catch(e) {
          setError("Edit failed.");
      } finally {
          setIsProcessing(false);
      }
  }

  const handleVideoGen = async () => {
      setIsProcessing(true);
      setError(null);
      try {
          const rawPrompt = node.data.prompt || "A video scene";
          const finalPrompt = resolvePrompt(rawPrompt);
          
          // Use manual upload OR auto-injected reference
          let refImage = node.data.imageUrl;
          if (!refImage) {
               refImage = resolveReferenceImage(rawPrompt);
          }

          const result = await GeminiService.generateVideo(
              finalPrompt,
              (node.data.aspectRatio as "16:9" | "9:16") || "16:9",
              refImage
          );
          onUpdate(node.id, { ...node.data, videoUrl: result, status: 'review' });
      } catch(e) {
          setError("Video generation failed.");
      } finally {
          setIsProcessing(false);
      }
  }

  // --- Auto-Generate Effect ---
  useEffect(() => {
    if (node.data.status === 'generating' && !isProcessing) {
       if (node.type === NodeType.AI_IMAGE_GEN && !node.data.imageUrl) {
           handleImageGen();
       } else if (node.type === NodeType.AI_TEXT_GEN && !node.data.text) {
           handleTextGen();
       }
    }
  }, [node.data.status]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = () => {
          onUpdate(node.id, { ...node.data, imageUrl: reader.result as string, status: 'draft' });
      };
      reader.readAsDataURL(file);
  }

  const setStatus = (status: 'draft' | 'approved' | 'review' | 'archived') => {
      onUpdate(node.id, { ...node.data, status });
  }

  const toggleCollapse = () => {
      onUpdate(node.id, { ...node.data, collapsed: !node.data.collapsed });
  }

  // --- Renderers per Type ---

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
                         {isProcessing ? "Thinking..." : "Generated text will appear here..."}
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
            <div className={`p-3 space-y-2 ${expanded ? 'h-full flex flex-col' : ''}`}>
                 {node.data.imageUrl ? (
                     <div className={`relative group ${expanded ? 'flex-1 flex items-center justify-center bg-zinc-900/50 rounded-lg overflow-hidden' : ''}`}>
                         <img 
                            src={node.data.imageUrl} 
                            alt="Generated" 
                            className={`rounded border border-zinc-700 ${expanded ? 'max-h-full max-w-full object-contain' : 'w-full'}`} 
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
                     </div>
                 ) : (
                     <div className={`${expanded ? 'flex-1' : 'h-48'} bg-zinc-900/50 rounded flex items-center justify-center border border-dashed border-zinc-700 text-zinc-600 text-xs`}>
                         {isProcessing ? (
                             <span className="animate-pulse">Generating...</span>
                         ) : "No Image"}
                     </div>
                 )}
                 
                 <div className={expanded ? 'max-w-2xl mx-auto w-full pt-4' : ''}>
                     <label className="text-xs text-zinc-400 uppercase font-bold">Prompt & Settings</label>
                     <div className="flex flex-col gap-2 mt-1">
                        <Input 
                            value={node.data.prompt || ''}
                            onChange={(e) => onUpdate(node.id, { ...node.data, prompt: e.target.value })}
                            placeholder={activeAsset ? `@${activeAsset.title} in a scene...` : "A futuristic city..."}
                            className="flex-1"
                        />
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
                            <img src={node.data.imageUrl} className={`w-full h-full ${expanded ? 'object-contain' : 'object-cover'}`} />
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
          return (
            <div className={`p-3 space-y-2 ${expanded ? 'h-full flex flex-col' : ''}`}>
                 {node.data.videoUrl ? (
                     <video controls src={node.data.videoUrl} className={`rounded border border-zinc-700 ${expanded ? 'flex-1 w-full h-full' : 'w-full'}`} />
                 ) : node.data.imageUrl ? (
                     <div className={`relative ${expanded ? 'flex-1 flex items-center justify-center' : ''}`}>
                        <img src={node.data.imageUrl} className={`${expanded ? 'max-h-full max-w-full' : 'w-full h-24'} object-cover opacity-50 rounded`} />
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-white font-bold shadow-black drop-shadow-md">
                            Reference Image Loaded
                        </div>
                     </div>
                 ) : (
                    <div 
                        className={`${expanded ? 'flex-1' : 'h-24'} bg-zinc-900/50 rounded flex items-center justify-center border border-dashed border-zinc-700 cursor-pointer`}
                        onClick={() => fileInputRef.current?.click()}
                    >
                         <span className="text-[10px] text-zinc-500">Optional: Upload Ref Image</span>
                         <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*" />
                    </div>
                 )}

                 <div className={expanded ? 'max-w-2xl mx-auto w-full pt-4' : ''}>
                     <label className="text-xs text-zinc-400 uppercase font-bold">Video Prompt</label>
                     <div className="flex gap-2 mt-1">
                        <TextArea 
                            value={node.data.prompt || ''}
                            onChange={(e) => onUpdate(node.id, { ...node.data, prompt: e.target.value })}
                            placeholder={activeAsset ? `@${activeAsset.title} running...` : "A cat flying in space..."}
                            className={`${expanded ? 'h-20' : 'h-16'} text-xs flex-1`}
                        />
                        <div className="flex flex-col gap-2">
                            <Select value={node.data.aspectRatio || '16:9'} onChange={(e) => onUpdate(node.id, { ...node.data, aspectRatio: e.target.value })} className="w-24">
                                <option value="16:9">16:9</option>
                                <option value="9:16">9:16</option>
                            </Select>
                            <Button onClick={handleVideoGen} disabled={isProcessing || (!node.data.prompt && !node.data.imageUrl)} className="flex-1 py-1 text-xs">
                                <Film size={14} className="mr-1"/>
                                {isProcessing ? "Generating..." : "Generate"}
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
      if (node.data.status === 'generating') return "bg-purple-900/50 border-purple-700 text-white animate-pulse";

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
      if (node.data.status === 'generating') return "border-purple-500/50 ring-1 ring-purple-900";
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
                {!isGroup && node.data.status === 'generating' && <Sparkles size={12} className="animate-spin"/>}
                {getTitle()}
            </span>
        </div>
        
        <div className="flex items-center gap-1">
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

      <div className={`relative flex-1 ${isGroup && node.data.collapsed ? 'hidden' : ''}`}>
        {renderContent(false)}
        {error && <div className="px-3 pb-2 text-[10px] text-red-400">{error}</div>}
      </div>

      {!isGroup && (
      <div className="flex items-center border-t border-zinc-800 p-1 gap-1 bg-zinc-950/50 rounded-b-lg">
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