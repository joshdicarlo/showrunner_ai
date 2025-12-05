
import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';
import { DepartmentPanel } from './components/DepartmentPanel';
import { AssetEditorPanel } from './components/AssetEditorPanel';
import { ChatBot } from './components/ChatBot';
import { DepartmentType, FlowNode, FlowConnection, Project, NodeType, ProjectAsset, StorySeed } from './types';
import { DEPARTMENTS } from './constants';
import { Button, Input, Modal, TextArea } from './components/UI';
import { FolderPlus, Film, Layout, CornerUpLeft, Sparkles, Check, Wand2, Dice5 } from 'lucide-react';
import { generateEnhancementOptions, generateSummary, extractCharactersFromScript, extractLocationsFromScript, extractStoryElementsFromScript, generateStorySeeds, extractShotsFromScene } from './services/geminiService';

type View = 'dashboard' | 'project';

// Generalized Detection Interface
interface DetectedItem {
    name: string;
    description: string;
    type: string;
    selected: boolean;
    isDuplicate?: boolean;
}

const App: React.FC = () => {
  const [view, setView] = useState<View>('dashboard');
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  
  // Context State
  const [currentDept, setCurrentDept] = useState<DepartmentType>(DepartmentType.WRITERS_ROOM);
  const [currentAssetId, setCurrentAssetId] = useState<string | null>(null); // Null means Department Root

  // Canvas Focus State
  const [focusNodeIds, setFocusNodeIds] = useState<string[]>([]);

  // Modals
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isCreateAssetOpen, setIsCreateAssetOpen] = useState(false);
  const [showEnhanceModal, setShowEnhanceModal] = useState(false);
  const [isAnalyzeModalOpen, setIsAnalyzeModalOpen] = useState(false);
  
  // Form State (New Project)
  const [creationMode, setCreationMode] = useState<'blank' | 'seed'>('blank');
  const [newProjectTitle, setNewProjectTitle] = useState('');
  
  // Project Seed State
  const [seedPrompt, setSeedPrompt] = useState('');
  const [generatedSeeds, setGeneratedSeeds] = useState<StorySeed[]>([]);
  const [selectedSeedIdx, setSelectedSeedIdx] = useState<number | null>(null);
  const [isGeneratingSeeds, setIsGeneratingSeeds] = useState(false);
  const [autoGenAssets, setAutoGenAssets] = useState(true);

  // Asset Creation State
  const [newAssetTitle, setNewAssetTitle] = useState('');
  const [newAssetDesc, setNewAssetDesc] = useState('');
  const [newAssetParentId, setNewAssetParentId] = useState<string | undefined>(undefined);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancementOptions, setEnhancementOptions] = useState<string[]>([]);
  
  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([]);
  const [analysisType, setAnalysisType] = useState<string>(''); // 'Characters', 'Locations', 'Story'
  const [analysisParentId, setAnalysisParentId] = useState<string | null>(null); // For creating child assets during analysis

  // Mock initial data load
  useEffect(() => {
      const demoAssetId = 'asset-1';
      const demoProject: Project = {
          id: 'demo-1',
          title: 'The Galactic Courier',
          summary: 'A sci-fi adventure about a courier delivering a package to the wrong dimension.',
          type: 'Feature',
          assets: [
             {
                 id: demoAssetId,
                 department: DepartmentType.CASTING_WARDROBE,
                 title: 'Zax',
                 description: 'A cynical robot courier with a rusted chassis and a heart of gold. He often malfunctions at inconvenient times but always delivers the package.',
                 summary: 'A cynical robot courier with a rusted chassis.'
             }
          ],
          nodes: [
             // Writers Room Sequence Group
             {
                 id: 'seq-group',
                 type: NodeType.GROUP,
                 department: DepartmentType.WRITERS_ROOM,
                 position: { x: 50, y: 50 },
                 width: 850,
                 height: 550,
                 data: { label: "Sequence 1", collapsed: false }
             },
             // Beat Sheet
             { 
                 id: 'n-beat', 
                 type: NodeType.AI_TEXT_GEN, 
                 department: DepartmentType.WRITERS_ROOM,
                 parentId: 'seq-group',
                 position: {x: 80, y: 120}, 
                 data: { 
                     prompt: 'Write a beat sheet for a chase scene in an asteroid field.', 
                     text: `1. **The Signal**: @Zax and his copilot **R-7** receive a distress call from the rebel leader **Kira**.\n2. **The Ambush**: The warlord **Vorg** intercepts the transmission and launches his fleet.\n3. **The Maneuver**: @Zax flies into the asteroid field while **R-7** calculates the odds.\n4. **The Crash**: They are hit by **Vorg**'s cannon but **Kira** pulls them from the wreckage just in time.`,
                     status: 'approved' 
                 },
                 width: 350, height: 400
             },
             // Script
             { 
                 id: 'n-script', 
                 type: NodeType.AI_TEXT_GEN, 
                 department: DepartmentType.WRITERS_ROOM,
                 parentId: 'seq-group',
                 position: {x: 480, y: 120}, 
                 data: { 
                     prompt: 'Convert the beat sheet into a script scene.', 
                     text: `INT. COCKPIT - DAY\n\n@ZAX struggles with the controls. His small drone companion, R-7, beeps frantically attached to the dashboard.\n\n@ZAX\nQuiet, R-7! I know the odds!\n\nOn the com-link, KIRA's voice crackles through, urgent and commanding.\n\nKIRA (V.O.)\nVorg is right behind you, Zax! Dive into the nebula!\n\nEXT. ASTEROID FIELD - CONTINUOUS\n\nThe courier ship weaves through the debris, narrowly dodging VORG'S massive flagship plasma blasts.`,
                     status: 'review' 
                 },
                 width: 350, height: 400
             },
             // Asset Specific Node (Zax)
             { 
                 id: 'n2', 
                 type: NodeType.AI_IMAGE_GEN, 
                 department: DepartmentType.CASTING_WARDROBE,
                 assetId: demoAssetId,
                 position: {x: 100, y: 100}, 
                 data: { prompt: 'A rusty robot courier named Zax, sci-fi concept art', aspectRatio: '1:1', status: 'approved', imageUrl: 'https://picsum.photos/400/400' },
                 width: 300, height: 400
             }
          ],
          connections: [],
          updatedAt: new Date()
      };
      setProjects([demoProject]);
  }, []);

  const activeProject = projects.find(p => p.id === currentProjectId);
  const activeAsset = activeProject?.assets.find(a => a.id === currentAssetId);
  const activeDeptConfig = DEPARTMENTS.find(d => d.id === currentDept);

  // --- Project Handlers ---

  const resetProjectModal = () => {
      setNewProjectTitle('');
      setCreationMode('blank');
      setSeedPrompt('');
      setGeneratedSeeds([]);
      setSelectedSeedIdx(null);
      setAutoGenAssets(true);
      setIsCreateProjectOpen(false);
  }

  const handleRollDice = async () => {
      setIsGeneratingSeeds(true);
      setGeneratedSeeds([]);
      try {
          const seeds = await generateStorySeeds(seedPrompt);
          setGeneratedSeeds(seeds);
      } finally {
          setIsGeneratingSeeds(false);
      }
  }

  const handleCreateProject = () => {
      if (creationMode === 'blank') {
          if (!newProjectTitle) return;
          const newProj: Project = {
              id: `p-${Date.now()}`,
              title: newProjectTitle,
              summary: '',
              type: 'Feature',
              assets: [],
              nodes: [],
              connections: [],
              updatedAt: new Date()
          };
          setProjects([...projects, newProj]);
          setCurrentProjectId(newProj.id);
          setView('project');
          resetProjectModal();
      } else {
          // From Seed
          if (selectedSeedIdx === null || !generatedSeeds[selectedSeedIdx]) return;
          
          const seed = generatedSeeds[selectedSeedIdx];
          const newProjId = `p-${Date.now()}`;
          
          const initialNodes: FlowNode[] = [];
          
          // Auto Generate Assets logic
          if (autoGenAssets) {
             const groupId = `group-seed-${Date.now()}`;
             initialNodes.push({
                id: groupId,
                type: NodeType.GROUP,
                department: DepartmentType.WRITERS_ROOM,
                position: {x: 100, y: 100},
                width: 950,
                height: 550,
                data: { label: "Seed Generation", collapsed: false }
             });

             // Beat Sheet Node
             initialNodes.push({
                 id: `seed-beat-${Date.now()}`,
                 type: NodeType.AI_TEXT_GEN,
                 department: DepartmentType.WRITERS_ROOM,
                 parentId: groupId,
                 position: { x: 120, y: 160 },
                 width: 400,
                 height: 400,
                 data: {
                     prompt: `Write a beat sheet for a ${seed.genre} film called "${seed.title}".\nLogline: ${seed.logline}`,
                     status: 'generating'
                 }
             });

             // Script Node
             initialNodes.push({
                 id: `seed-script-${Date.now()}`,
                 type: NodeType.AI_TEXT_GEN,
                 department: DepartmentType.WRITERS_ROOM,
                 parentId: groupId,
                 position: { x: 540, y: 160 },
                 width: 400,
                 height: 400,
                 data: {
                     prompt: `Write the opening sequence script for "${seed.title}".\nGenre: ${seed.genre}.\nLogline: ${seed.logline}`,
                     status: 'generating'
                 }
             });
          }

          const newProj: Project = {
              id: newProjId,
              title: seed.title,
              summary: seed.logline,
              type: 'Feature',
              assets: [
                  // Create a Story Bible Asset
                  {
                      id: `asset-bible-${Date.now()}`,
                      department: DepartmentType.STORY,
                      title: "Story Bible",
                      description: `Logline: ${seed.logline}\n\nGenre: ${seed.genre}`,
                      visualStyle: seed.visualStyle,
                      summary: seed.logline
                  }
              ],
              nodes: initialNodes,
              connections: [],
              updatedAt: new Date()
          };

          setProjects([...projects, newProj]);
          setCurrentProjectId(newProj.id);
          setView('project');
          resetProjectModal();
      }
  };

  // --- Asset Handlers ---
  
  const handleEnhanceDescription = async () => {
      if (!newAssetDesc) return;
      setIsEnhancing(true);
      const options = await generateEnhancementOptions(newAssetDesc, activeDeptConfig?.assetLabel || "Asset");
      setEnhancementOptions(options);
      setIsEnhancing(false);
      setShowEnhanceModal(true);
  };

  const applyEnhancement = (selectedText: string) => {
      setNewAssetDesc(selectedText);
      setShowEnhanceModal(false);
  };

  const handleOpenCreateAssetModal = (parentId?: string) => {
      setNewAssetParentId(parentId);
      setNewAssetTitle('');
      setNewAssetDesc('');
      setIsCreateAssetOpen(true);
  };

  const handleCreateAsset = async () => {
      if (!currentProjectId || !newAssetTitle) return;
      
      const newId = `asset-${Date.now()}`;
      
      // Default Visual Style for Story Department
      let defaultVisualStyle = "";
      if (currentDept === DepartmentType.STORY) {
          defaultVisualStyle = "Storyboard";
      }

      const newAsset: ProjectAsset = {
          id: newId,
          department: currentDept,
          title: newAssetTitle,
          description: newAssetDesc,
          summary: "Generating AI summary...", // Placeholder
          parentId: newAssetParentId,
          visualStyle: defaultVisualStyle
      };

      // Update state immediately
      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              return { ...p, assets: [...p.assets, newAsset] };
          }
          return p;
      }));

      setNewAssetTitle('');
      setNewAssetDesc('');
      setNewAssetParentId(undefined);
      setIsCreateAssetOpen(false);
      
      if (!newAssetParentId) {
          setCurrentAssetId(newAsset.id);
      }

      // Generate Summary in background
      if (newAssetDesc) {
          try {
              const summary = await generateSummary(newAssetDesc);
              setProjects(prev => prev.map(p => {
                  if (p.id === currentProjectId) {
                      return {
                          ...p,
                          assets: p.assets.map(a => a.id === newId ? { ...a, summary } : a)
                      };
                  }
                  return p;
              }));
          } catch (e) {
              console.error("Background summary gen failed", e);
          }
      }
  };

  const handleUpdateAsset = useCallback((updatedAsset: ProjectAsset) => {
      if (!currentProjectId) return;
      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              return {
                  ...p,
                  assets: p.assets.map(a => a.id === updatedAsset.id ? updatedAsset : a)
              };
          }
          return p;
      }));
  }, [currentProjectId]);

  const handleSetThumbnail = useCallback((assetId: string, imageUrl: string) => {
      if (!currentProjectId) return;
      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              return {
                  ...p,
                  assets: p.assets.map(a => a.id === assetId ? { ...a, thumbnailUrl: imageUrl } : a)
              };
          }
          return p;
      }));
  }, [currentProjectId]);

  const handleNavigateToAsset = (assetId: string) => {
      const asset = activeProject?.assets.find(a => a.id === assetId);
      if (asset) {
          setCurrentDept(asset.department);
          setCurrentAssetId(asset.id);
      }
  };

  const handleGenerateConcepts = (count: number) => {
    if (!activeAsset || !currentProjectId || !activeProject) return;

    // 1. Determine Bounding Box of existing nodes in this context to place below
    const contextNodes = activeProject.nodes.filter(n => 
        n.department === currentDept && 
        n.assetId === activeAsset.id &&
        n.data.status !== 'archived'
    );

    let maxY = 0;
    if (contextNodes.length > 0) {
        maxY = Math.max(...contextNodes.map(n => n.position.y + (n.height || 400)));
    }

    // 2. Calculate placement
    const startY = maxY > 0 ? maxY + 100 : 100; // 100px padding below lowest node
    const startX = 100;
    const nodeWidth = 300;
    const nodeHeight = 450;
    const gap = 20;
    const padding = 20;

    // 3. Create Group Node
    const groupId = `group-${Date.now()}`;
    const groupWidth = (nodeWidth * count) + (gap * (count - 1)) + (padding * 2);
    const groupHeight = nodeHeight + (padding * 2) + 40; // +40 for header

    const groupNode: FlowNode = {
        id: groupId,
        type: NodeType.GROUP,
        department: currentDept,
        assetId: activeAsset.id,
        position: { x: startX, y: startY },
        width: groupWidth,
        height: groupHeight,
        data: {
            label: `Concepts Batch ${new Date().toLocaleTimeString()}`,
            collapsed: false
        }
    };

    // 4. Create Child Nodes
    const newNodes: FlowNode[] = [];
    
    for (let i = 0; i < count; i++) {
        const childX = startX + padding + (i * (nodeWidth + gap));
        const childY = startY + 60; // Header offset

        newNodes.push({
            id: `gen-${Date.now()}-${i}`,
            type: NodeType.AI_IMAGE_GEN,
            department: currentDept,
            assetId: activeAsset.id,
            parentId: groupId, // Link to group
            position: { x: childX, y: childY }, 
            width: nodeWidth,
            height: nodeHeight,
            data: {
                prompt: `@${activeAsset.title}`,
                aspectRatio: '1:1',
                status: 'generating' // Auto-start
            }
        });
    }

    const allNewIds = [groupId, ...newNodes.map(n => n.id)];

    setProjects(prev => prev.map(p => {
        if (p.id === currentProjectId) {
             return { ...p, nodes: [...p.nodes, groupNode, ...newNodes] };
        }
        return p;
    }));

    // Trigger Focus
    setFocusNodeIds(allNewIds);
  };

  const handleGenerateOutline = () => {
      if (!activeAsset || !currentProjectId || !activeProject) return;

      const contextNodes = activeProject.nodes.filter(n => 
          n.department === currentDept && 
          n.assetId === activeAsset.id &&
          n.data.status !== 'archived'
      );
      let maxY = 0;
      if (contextNodes.length > 0) {
          maxY = Math.max(...contextNodes.map(n => n.position.y + (n.height || 400)));
      }

      const startY = maxY > 0 ? maxY + 100 : 100;
      const startX = 100;
      const nodeWidth = 600; // Wider for text
      const nodeHeight = 400;
      const padding = 20;

      const groupId = `group-${Date.now()}`;
      const groupWidth = nodeWidth + (padding * 2);
      const groupHeight = nodeHeight + (padding * 2) + 40;

      const groupNode: FlowNode = {
          id: groupId,
          type: NodeType.GROUP,
          department: currentDept,
          assetId: activeAsset.id,
          position: { x: startX, y: startY },
          width: groupWidth,
          height: groupHeight,
          data: { label: `Outline Batch ${new Date().toLocaleTimeString()}`, collapsed: false }
      };

      const outlineNode: FlowNode = {
          id: `gen-outline-${Date.now()}`,
          type: NodeType.AI_TEXT_GEN,
          department: currentDept,
          assetId: activeAsset.id,
          parentId: groupId,
          position: { x: startX + padding, y: startY + 60 },
          width: nodeWidth,
          height: nodeHeight,
          data: {
              prompt: `Create a beat sheet outline for @${activeAsset.title}. Focus on dramatic tension.`,
              status: 'generating'
          }
      };

      const allNewIds = [groupId, outlineNode.id];

      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              return { ...p, nodes: [...p.nodes, groupNode, outlineNode] };
          }
          return p;
      }));

      setFocusNodeIds(allNewIds);
  };

  const handleUpdateNodes = useCallback((value: FlowNode[] | ((prev: FlowNode[]) => FlowNode[])) => {
      if (!currentProjectId) return;
      setProjects(prev => prev.map(p => {
          if (p.id !== currentProjectId) return p;
          const nextNodes = typeof value === 'function' ? value(p.nodes) : value;
          return { ...p, nodes: nextNodes };
      }));
  }, [currentProjectId]);

   const handleUpdateConnections = useCallback((value: FlowConnection[] | ((prev: FlowConnection[]) => FlowConnection[])) => {
      if (!currentProjectId) return;
       setProjects(prev => prev.map(p => {
          if (p.id !== currentProjectId) return p;
          const nextConns = typeof value === 'function' ? value(p.connections) : value;
          return { ...p, connections: nextConns };
      }));
  }, [currentProjectId]);

  const getApprovedImages = () => {
      if (!activeProject || !currentAssetId) return [];
      return activeProject.nodes
        .filter(n => n.assetId === currentAssetId && n.data.status === 'approved' && n.data.imageUrl)
        .map(n => n.data.imageUrl!);
  };

  // --- Generalized Detection Logic ---
  
  const handleDiscoverShots = async (assetId: string) => {
      const asset = activeProject?.assets.find(a => a.id === assetId);
      if (!asset) return;
      
      setAnalysisParentId(assetId); // IMPORTANT: Set this so new assets become children
      setAnalysisType("Shots");
      setIsAnalyzing(true);
      setIsAnalyzeModalOpen(true);
      setDetectedItems([]);

      try {
          // Pass known characters to enable @ tagging
          const knownCharacters = activeProject?.assets
            .filter(a => a.department === DepartmentType.CASTING_WARDROBE)
            .map(a => a.title) || [];

          const shots = await extractShotsFromScene(asset.description, knownCharacters);
          setDetectedItems(shots.map(s => ({
              name: s.title,
              description: s.description,
              type: s.type,
              selected: true, // Auto-select shots
              isDuplicate: false 
          })));
      } catch(e) {
          console.error(e);
      } finally {
          setIsAnalyzing(false);
      }
  };

  const handleAnalyzeScripts = async () => {
      if (!activeProject) return;
      
      setAnalysisParentId(null); // Reset parent context
      setIsAnalyzing(true);
      setIsAnalyzeModalOpen(true);
      setDetectedItems([]);
      
      // 1. Aggregate script content (Writers Room & Story nodes)
      const scriptNodes = activeProject.nodes.filter(n => 
          (n.department === DepartmentType.WRITERS_ROOM || n.department === DepartmentType.STORY) &&
          (n.type === NodeType.TEXT_INPUT || n.type === NodeType.AI_TEXT_GEN) &&
          n.data.text && n.data.text.trim().length > 0
      );

      const combinedScript = scriptNodes.map(n => n.data.text).join('\n\n');

      if (!combinedScript) {
          setIsAnalyzing(false);
          setAnalysisType("Error");
          return;
      }

      try {
          // Switch based on Department
          if (currentDept === DepartmentType.CASTING_WARDROBE) {
              setAnalysisType("Characters");
              const profiles = await extractCharactersFromScript(combinedScript);
              
              const existingNames = new Set(
                 activeProject.assets
                    .filter(a => a.department === DepartmentType.CASTING_WARDROBE)
                    .map(a => a.title.toLowerCase().trim())
              );
              setDetectedItems(profiles.map(p => ({
                  name: p.name,
                  description: p.description,
                  type: p.role,
                  selected: !existingNames.has(p.name.toLowerCase().trim()),
                  isDuplicate: existingNames.has(p.name.toLowerCase().trim())
              })));

          } else if (currentDept === DepartmentType.SET_DESIGN) {
              setAnalysisType("Locations");
              const locs = await extractLocationsFromScript(combinedScript);
              
              const existingLocs = new Set(
                 activeProject.assets
                    .filter(a => a.department === DepartmentType.SET_DESIGN)
                    .map(a => a.title.toLowerCase().trim())
              );
              setDetectedItems(locs.map(l => ({
                  name: l.name,
                  description: l.description,
                  type: l.type, // INT/EXT
                  selected: !existingLocs.has(l.name.toLowerCase().trim()),
                  isDuplicate: existingLocs.has(l.name.toLowerCase().trim())
              })));

          } else if (currentDept === DepartmentType.STORY) {
              setAnalysisType("Story Elements");
              
              // Gather known character names to help with @ tagging
              const knownCharacters = activeProject.assets
                  .filter(a => a.department === DepartmentType.CASTING_WARDROBE)
                  .map(a => a.title);

              const elements = await extractStoryElementsFromScript(combinedScript, knownCharacters);
              
               const existingElements = new Set(
                 activeProject.assets
                    .filter(a => a.department === DepartmentType.STORY)
                    .map(a => a.title.toLowerCase().trim())
              );
              setDetectedItems(elements.map(e => ({
                  name: e.title,
                  description: e.description,
                  type: e.type,
                  selected: !existingElements.has(e.title.toLowerCase().trim()),
                  isDuplicate: existingElements.has(e.title.toLowerCase().trim())
              })));
          }

      } catch(e) {
          console.error(e);
      } finally {
          setIsAnalyzing(false);
      }
  };

  const handleApproveAnalysis = () => {
      if (!currentProjectId) return;
      const toAdd = detectedItems.filter(c => c.selected);
      
      if (toAdd.length === 0) {
          setIsAnalyzeModalOpen(false);
          return;
      }

      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              const newAssets = toAdd.map(item => ({
                  id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  department: currentDept,
                  title: item.name,
                  description: item.description,
                  visualStyle: currentDept === DepartmentType.STORY ? "Storyboard" : "", // Apply default
                  summary: `${item.type}. ${item.description.substring(0, 60)}...`,
                  parentId: analysisParentId || undefined // Use tracked parent ID if available
              }));
              return { ...p, assets: [...p.assets, ...newAssets] };
          }
          return p;
      }));

      setIsAnalyzeModalOpen(false);
      setDetectedItems([]);
      setAnalysisParentId(null); // Reset
  };

  const toggleItemSelection = (idx: number) => {
      setDetectedItems(prev => prev.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item));
  };


  // --- Views ---

  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-background text-zinc-100 p-10">
        <div className="max-w-6xl mx-auto">
            <header className="flex items-center justify-between mb-12">
                <div>
                    <h1 className="text-4xl font-bold tracking-tighter mb-2 flex items-center gap-3">
                        <Film className="text-yellow-500"/> ShowrunnerAI
                    </h1>
                    <p className="text-zinc-400">Nano Banana Powered Creative Studio</p>
                </div>
                <Button onClick={() => setIsCreateProjectOpen(true)}>
                    <FolderPlus className="mr-2"/> New Project
                </Button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map(p => (
                    <div 
                        key={p.id} 
                        onClick={() => { setCurrentProjectId(p.id); setView('project'); }}
                        className="bg-surface border border-border rounded-xl p-6 cursor-pointer hover:border-zinc-600 hover:shadow-xl transition-all group relative overflow-hidden"
                    >
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity"/>
                        <h3 className="text-xl font-semibold mb-2 group-hover:text-white transition-colors">{p.title}</h3>
                        <p className="text-sm text-zinc-500 line-clamp-2 mb-4">{p.summary || "No summary yet."}</p>
                        <div className="flex items-center gap-4 text-xs text-zinc-600">
                            <span className="flex items-center gap-1"><Layout size={12}/> {p.nodes.length} Nodes</span>
                            <span className="uppercase border border-zinc-800 px-2 py-0.5 rounded">{p.type}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {isCreateProjectOpen && (
            <Modal title="Create New Project" onClose={resetProjectModal} maxWidth="max-w-4xl">
                <div className="min-h-[400px] flex flex-col">
                    {/* Creation Mode Tabs */}
                    <div className="flex gap-4 border-b border-zinc-800 mb-6">
                        <button 
                            onClick={() => setCreationMode('blank')}
                            className={`pb-2 px-1 text-sm font-medium transition-colors border-b-2 ${creationMode === 'blank' ? 'border-blue-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                        >
                            Blank Project
                        </button>
                        <button 
                            onClick={() => setCreationMode('seed')}
                            className={`pb-2 px-1 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${creationMode === 'seed' ? 'border-purple-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                        >
                            <Dice5 size={14} /> From Story Seed
                        </button>
                    </div>

                    <div className="flex-1">
                        {creationMode === 'blank' ? (
                            <div className="space-y-4 max-w-lg mx-auto py-12">
                                <div>
                                    <label className="block text-sm text-zinc-400 mb-1">Project Title</label>
                                    <Input autoFocus value={newProjectTitle} onChange={e => setNewProjectTitle(e.target.value)} placeholder="e.g. The Matrix Reborn" />
                                </div>
                                <p className="text-xs text-zinc-500">Start with a clean slate and build your world from scratch.</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Seed Input */}
                                <div className="flex gap-2 items-end">
                                    <div className="flex-1">
                                        <label className="block text-xs uppercase font-bold text-zinc-500 mb-1">Story Seed / Theme (Optional)</label>
                                        <Input 
                                            value={seedPrompt} 
                                            onChange={e => setSeedPrompt(e.target.value)} 
                                            placeholder="e.g. A buddy comedy set in Middle Earth..." 
                                            onKeyDown={e => e.key === 'Enter' && handleRollDice()}
                                        />
                                    </div>
                                    <Button onClick={handleRollDice} disabled={isGeneratingSeeds} variant="secondary" icon={Dice5}>
                                        {isGeneratingSeeds ? "Rolling..." : "Roll Dice"}
                                    </Button>
                                </div>

                                {/* Generated Cards */}
                                {generatedSeeds.length > 0 && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {generatedSeeds.map((seed, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => setSelectedSeedIdx(idx)}
                                                className={`text-left p-4 rounded-lg border transition-all relative overflow-hidden ${selectedSeedIdx === idx ? 'bg-purple-900/20 border-purple-500 ring-1 ring-purple-500/50' : 'bg-zinc-900 border-zinc-700 hover:border-zinc-500'}`}
                                            >
                                                <h4 className="font-bold text-zinc-100 mb-1">{seed.title}</h4>
                                                <div className="flex gap-2 text-[10px] mb-2">
                                                    <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">{seed.genre}</span>
                                                    <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">{seed.visualStyle}</span>
                                                </div>
                                                <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">{seed.logline}</p>
                                                
                                                {selectedSeedIdx === idx && (
                                                    <div className="absolute top-2 right-2 text-purple-500">
                                                        <Check size={16} />
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                
                                {generatedSeeds.length === 0 && !isGeneratingSeeds && (
                                    <div className="h-48 border-2 border-dashed border-zinc-800 rounded-lg flex flex-col items-center justify-center text-zinc-600">
                                        <Dice5 size={24} className="mb-2 opacity-50"/>
                                        <p className="text-sm">Enter a theme or leave blank, then roll the dice.</p>
                                    </div>
                                )}
                                
                                {isGeneratingSeeds && (
                                    <div className="h-48 flex items-center justify-center text-purple-400 gap-2">
                                        <Wand2 className="animate-spin" /> Generating ideas...
                                    </div>
                                )}
                                
                                {/* Auto Gen Option */}
                                {generatedSeeds.length > 0 && (
                                    <div className="flex items-center gap-2 pt-4 border-t border-zinc-800">
                                        <input 
                                            type="checkbox" 
                                            id="autoGen"
                                            checked={autoGenAssets}
                                            onChange={e => setAutoGenAssets(e.target.checked)}
                                            className="rounded border-zinc-700 bg-zinc-900"
                                        />
                                        <label htmlFor="autoGen" className="text-sm text-zinc-300 cursor-pointer select-none">
                                            Automatically generate Beat Sheet and Script sequence
                                        </label>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    
                    {/* Footer Actions */}
                    <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-zinc-800">
                        <Button variant="ghost" onClick={resetProjectModal}>Cancel</Button>
                        <Button 
                            onClick={handleCreateProject} 
                            disabled={creationMode === 'blank' ? !newProjectTitle : selectedSeedIdx === null}
                        >
                            Create Project
                        </Button>
                    </div>
                </div>
            </Modal>
        )}
      </div>
    );
  }

  // Project View
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-zinc-200">
      {/* Primary Navigation */}
      <Sidebar 
        currentDept={currentDept} 
        onChangeDept={(d) => { setCurrentDept(d); setCurrentAssetId(null); }} // Reset asset selection on dept change
        onBack={() => setView('dashboard')}
      />
      
      {/* Secondary Context Panel (Left) */}
      {activeProject && (
          <DepartmentPanel 
            department={currentDept}
            assets={activeProject.assets}
            nodes={activeProject.nodes}
            currentAssetId={currentAssetId}
            onSelectAsset={setCurrentAssetId}
            onCreateAsset={handleOpenCreateAssetModal}
            onAnalyzeScripts={handleAnalyzeScripts}
            onDiscoverShots={handleDiscoverShots}
          />
      )}

      <div className="flex-1 flex flex-col relative min-w-0">
          {/* Top Bar / Breadcrumbs */}
          <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-surface/50 backdrop-blur z-10 shrink-0">
             <div className="flex flex-col overflow-hidden">
                 <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                     <span className="whitespace-nowrap">{activeProject?.title}</span>
                     <span>/</span>
                     <span className={!currentAssetId ? "text-zinc-300" : "whitespace-nowrap"}>{currentDept}</span>
                     {currentAssetId && activeAsset && (
                        <>
                            <span>/</span>
                            <span className="text-blue-400 flex items-center gap-1 whitespace-nowrap truncate">
                                {activeAsset.title}
                            </span>
                        </>
                     )}
                 </div>
                 <div className="text-sm font-medium text-zinc-100 mt-0.5 truncate">
                     {currentAssetId && activeAsset 
                        ? (activeAsset.summary || activeAsset.description) 
                        : `${activeDeptConfig?.assetLabel} Workspace`}
                 </div>
             </div>
             
             <div className="flex items-center gap-3 shrink-0">
                 {currentAssetId && (
                     <Button size="sm" variant="ghost" onClick={() => setCurrentAssetId(null)} className="text-xs px-2 h-8">
                         <CornerUpLeft size={14} className="mr-1"/> Return to Dept
                     </Button>
                 )}
                 <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-xs font-bold border border-white/10">AI</div>
             </div>
          </div>

          {/* Canvas Area */}
          <div className="flex-1 relative bg-black overflow-hidden">
              {activeProject && (
                  <Canvas 
                    nodes={activeProject.nodes} 
                    connections={activeProject.connections}
                    setNodes={handleUpdateNodes}
                    setConnections={handleUpdateConnections}
                    currentDept={currentDept}
                    currentAssetId={currentAssetId}
                    activeAsset={activeAsset}
                    focusNodes={focusNodeIds}
                    onSetThumbnail={handleSetThumbnail}
                    projectAssets={activeProject.assets}
                  />
              )}
          </div>
      </div>
      
      {/* Right Sidebar (Inspector) */}
      {activeAsset && currentAssetId && activeProject && (
          <AssetEditorPanel 
            asset={activeAsset} 
            projectAssets={activeProject.assets}
            onUpdate={handleUpdateAsset} 
            onGenerateConcepts={handleGenerateConcepts} 
            onGenerateOutline={handleGenerateOutline}
            approvedImages={getApprovedImages()}
            onNavigateToAsset={handleNavigateToAsset}
          />
      )}

      <ChatBot />

      {/* Create Asset Modal */}
      {isCreateAssetOpen && (
        <Modal title={`Add New ${activeDeptConfig?.assetLabel}`} onClose={() => setIsCreateAssetOpen(false)}>
            <div className="space-y-4">
                <div>
                    <label className="block text-xs uppercase font-bold text-zinc-500 mb-1">Name</label>
                    <Input 
                        autoFocus 
                        value={newAssetTitle} 
                        onChange={e => setNewAssetTitle(e.target.value)} 
                        placeholder={`e.g. ${currentDept === DepartmentType.CASTING_WARDROBE ? "Neo" : "The Kitchen"}`} 
                    />
                </div>
                <div>
                    <label className="block text-xs uppercase font-bold text-zinc-500 mb-1">Description</label>
                    <TextArea 
                        value={newAssetDesc} 
                        onChange={e => setNewAssetDesc(e.target.value)} 
                        placeholder="Key details, visual style, personality..." 
                        className="min-h-[150px]" 
                    />
                </div>
                
                {/* Actions Footer */}
                <div className="flex items-center justify-between mt-4 pt-2 border-t border-zinc-800/50">
                    <button 
                        onClick={handleEnhanceDescription}
                        disabled={isEnhancing || !newAssetDesc}
                        className="flex items-center gap-2 text-xs font-medium text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors px-2 py-1 -ml-2 rounded hover:bg-blue-900/20"
                        title="Enhance text with AI for better generation results"
                    >
                        <Sparkles size={14} />
                        {isEnhancing ? "Thinking..." : "Enhance with AI"}
                    </button>

                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => setIsCreateAssetOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateAsset} disabled={!newAssetTitle}>Create</Button>
                    </div>
                </div>
            </div>
        </Modal>
      )}

      {/* Enhancement Options Modal */}
      {showEnhanceModal && (
        <Modal title="Select Enhancement" onClose={() => setShowEnhanceModal(false)}>
             <div className="space-y-3">
                 <p className="text-xs text-zinc-500 mb-2">Choose the version that best fits your vision:</p>
                 {enhancementOptions.map((option, idx) => (
                     <button 
                        key={idx}
                        onClick={() => applyEnhancement(option)}
                        className="w-full text-left p-3 rounded border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 hover:border-blue-500/50 transition-all group"
                     >
                         <div className="flex items-start gap-3">
                             <div className="mt-0.5 w-5 h-5 rounded-full border border-zinc-700 flex items-center justify-center group-hover:border-blue-500 group-hover:text-blue-500 text-transparent">
                                 <Check size={12} />
                             </div>
                             <div className="text-sm text-zinc-300 group-hover:text-white leading-relaxed">
                                 {option}
                             </div>
                         </div>
                     </button>
                 ))}
                 <div className="flex justify-end gap-2 mt-4 border-t border-zinc-800 pt-4">
                     <Button variant="ghost" onClick={() => setShowEnhanceModal(false)}>Cancel</Button>
                 </div>
             </div>
        </Modal>
      )}

      {/* Analysis Modal (Characters, Locations, Story) */}
      {isAnalyzeModalOpen && (
          <Modal title={`Auto-Detect ${analysisType}`} onClose={() => setIsAnalyzeModalOpen(false)}>
              <div className="space-y-4">
                  <div className="text-xs text-zinc-400">
                      Analyzing your script content across the project...
                  </div>
                  
                  {isAnalyzing ? (
                      <div className="py-12 flex flex-col items-center justify-center gap-3">
                          <Wand2 className="animate-pulse text-purple-400" size={32} />
                          <span className="text-sm text-zinc-300">Reading script nodes...</span>
                      </div>
                  ) : detectedItems.length === 0 ? (
                      <div className="py-8 text-center text-zinc-500 text-sm">
                          {analysisType === 'Error' ? "No scripts found to analyze." : "No items found."}
                      </div>
                  ) : (
                      <div className="max-h-[50vh] overflow-y-auto space-y-2 border border-zinc-800 rounded bg-zinc-900/30 p-2">
                          {detectedItems.map((item, idx) => (
                              <label 
                                key={idx} 
                                className={`flex items-start gap-3 p-3 rounded border transition-all ${
                                    item.isDuplicate 
                                        ? 'bg-zinc-900/50 border-zinc-800 opacity-60 cursor-not-allowed'
                                        : item.selected 
                                            ? 'bg-blue-900/20 border-blue-800 cursor-pointer' 
                                            : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 cursor-pointer'
                                }`}
                              >
                                  <input 
                                    type="checkbox" 
                                    checked={item.selected} 
                                    onChange={() => !item.isDuplicate && toggleItemSelection(idx)}
                                    disabled={!!item.isDuplicate}
                                    className="mt-1"
                                  />
                                  <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                          <span className="font-bold text-zinc-200">{item.name}</span>
                                          <span className="text-[10px] uppercase bg-zinc-800 px-1.5 rounded text-zinc-400 border border-zinc-700">{item.type}</span>
                                          {item.isDuplicate && (
                                              <span className="text-[10px] text-yellow-500 bg-yellow-900/20 px-1.5 py-0.5 rounded border border-yellow-900/50 flex items-center gap-1">
                                                  Existing
                                              </span>
                                          )}
                                      </div>
                                      <p className="text-xs text-zinc-500 leading-relaxed">{item.description}</p>
                                  </div>
                              </label>
                          ))}
                      </div>
                  )}

                  <div className="flex justify-end gap-2 mt-4 pt-2 border-t border-zinc-800">
                       <Button variant="ghost" onClick={() => setIsAnalyzeModalOpen(false)}>Cancel</Button>
                       <Button 
                        onClick={handleApproveAnalysis} 
                        disabled={isAnalyzing || detectedItems.filter(c => c.selected).length === 0}
                       >
                           Approve Selected ({detectedItems.filter(c => c.selected).length})
                       </Button>
                  </div>
              </div>
          </Modal>
      )}

    </div>
  );
};

export default App;