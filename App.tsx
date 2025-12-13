
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';
import { GalleryView } from './components/GalleryView'; 
import { DepartmentPanel } from './components/DepartmentPanel';
import { AssetEditorPanel } from './components/AssetEditorPanel';
import { ChatBot } from './components/ChatBot';
import { EditorTimeline } from './components/EditorTimeline';
import { DepartmentType, FlowNode, FlowConnection, Project, NodeType, ProjectAsset, StorySeed } from './types';
import { DEPARTMENTS, MODELS, VIDEO_MODEL_CAPABILITIES } from './constants';
import { Button, Input, Modal, TextArea, ToggleGroup } from './components/UI';
import { FolderPlus, Film, Layout, CornerUpLeft, Sparkles, Check, Wand2, Dice5, Cloud, Loader2, CloudOff, Grid, List, LayoutGrid, Scissors } from 'lucide-react';
import { generateEnhancementOptions, generateSummary, extractCharactersFromScript, extractLocationsFromScript, extractStoryElementsFromScript, generateStorySeeds, extractShotsFromScene } from './services/geminiService';
import * as GoogleDriveService from './services/googleDriveService';

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
  const [workspaceView, setWorkspaceView] = useState<'canvas' | 'gallery'>('canvas'); // New State

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

  // Drive State
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [isMockDrive, setIsMockDrive] = useState(false);
  const [driveFolderMap, setDriveFolderMap] = useState<Record<string, string>>({});

  // Initialize Google Drive API
  useEffect(() => {
      GoogleDriveService.initGapi().then(() => {
          console.log("Google API Initialized");
      });
  }, []);

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
                 summary: 'A cynical robot courier with a rusted chassis.',
                 status: 'active'
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

  // --- Editorial Sequence Resolution ---
  const editorialState = useMemo(() => {
      if (!activeAsset || currentDept !== DepartmentType.EDITORIAL) return { sequence: null, filterId: null };
      
      // If the selected asset has a parent, assume parent is the Sequence/Scene and asset is a Shot/Element
      if (activeAsset.parentId) {
          const parent = activeProject?.assets.find(a => a.id === activeAsset.parentId);
          return { sequence: parent || null, filterId: activeAsset.id };
      }
      
      // Otherwise, the selected asset is the Sequence
      return { sequence: activeAsset, filterId: null };
  }, [activeAsset, currentDept, activeProject?.assets]);


  // --- Derived State: Script Context for Chat ---
  // Aggregates all text from Writers Room nodes to give context to the ChatBot
  const scriptContext = useMemo(() => {
      if (!activeProject) return "";
      const scriptNodes = activeProject.nodes.filter(n => 
          n.department === DepartmentType.WRITERS_ROOM && 
          (n.type === NodeType.TEXT_INPUT || n.type === NodeType.AI_TEXT_GEN) &&
          n.data.text
      );
      
      return scriptNodes.map(n => 
          `[Source: ${n.type === NodeType.TEXT_INPUT ? 'Note' : 'Generated Script'}]\n${n.data.text}`
      ).join('\n\n');
  }, [activeProject?.nodes]);

  // --- Effective Thumbnails ---
  // Memoized map of AssetID -> ImageURL (from Latest Approved Node OR Asset Prop)
  const assetThumbnails = useMemo(() => {
      if (!activeProject) return {};
      const map: Record<string, string> = {};
      
      activeProject.assets.forEach(asset => {
          // 1. Check explicit thumbnail
          if (asset.thumbnailUrl) {
              map[asset.id] = asset.thumbnailUrl;
          } else {
              // 2. Find latest approved AI_IMAGE_GEN node
              const candidates = activeProject.nodes.filter(n => 
                  n.assetId === asset.id && 
                  n.type === NodeType.AI_IMAGE_GEN && 
                  n.data.status === 'approved' && 
                  n.data.imageUrl
              );
              // Simple sort by ID timestamp (works because ID is date-based)
              if (candidates.length > 0) {
                   const latest = candidates.sort((a, b) => b.id.localeCompare(a.id))[0];
                   if (latest.data.imageUrl) map[asset.id] = latest.data.imageUrl;
              }
          }
      });
      return map;
  }, [activeProject?.nodes, activeProject?.assets]);
  
  // --- Refined Images Map ---
  // Memoized map of AssetID -> List of Approved Refinement Image URLs
  const refinedImagesMap = useMemo(() => {
      if (!activeProject) return {};
      const map: Record<string, string[]> = {};
      activeProject.assets.forEach(asset => {
          const images = activeProject.nodes
            .filter(n => n.assetId === asset.id && n.data.status === 'approved' && n.data.imageUrl && n.data.tag === 'refinement')
            .map(n => n.data.imageUrl!);
          if (images.length > 0) map[asset.id] = images;
      });
      return map;
  }, [activeProject?.nodes, activeProject?.assets]);


  // --- Drive Handlers ---
  const handleConnectDrive = async () => {
      try {
          await GoogleDriveService.signIn();
          // Check mock status after sign in attempt
          if (GoogleDriveService.isMockMode()) {
              setIsMockDrive(true);
          } else {
              setIsMockDrive(false);
          }
          setIsDriveConnected(true);
      } catch (e) {
          console.error("Drive connection failed", e);
          // Auto fallback on failure
          GoogleDriveService.enableMockMode();
          setIsMockDrive(true);
          setIsDriveConnected(true);
      }
  };

  const handleForceOffline = () => {
      GoogleDriveService.enableMockMode();
      setIsMockDrive(true);
      setIsDriveConnected(true);
  }

  const syncToDrive = useCallback(async (project: Project) => {
      if (!isDriveConnected || !project.driveDbId) return;
      await GoogleDriveService.updateProjectDB(project.driveDbId, project.assets);
  }, [isDriveConnected]);

  // Auto-Save Effect
  useEffect(() => {
      if (activeProject && isDriveConnected) {
          const timer = setTimeout(() => {
              syncToDrive(activeProject);
          }, 3000); // Debounce 3s
          return () => clearTimeout(timer);
      }
  }, [activeProject?.assets, isDriveConnected, syncToDrive]);


  // --- Project Handlers ---
  // ... (Project creation/modal handlers omitted for brevity, effectively unchanged)
  // Re-inserting required handlers to ensure file is complete and valid

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

  const handleCreateProject = async () => {
      // ... (Same as before)
      let title = newProjectTitle;
      let summary = '';
      let initialAssets: ProjectAsset[] = [];
      let initialNodes: FlowNode[] = [];
      let type: Project['type'] = 'Feature';
      let visualStyle = '';

      if (creationMode === 'blank') {
          if (!newProjectTitle) return;
      } else {
          // From Seed
          if (selectedSeedIdx === null || !generatedSeeds[selectedSeedIdx]) return;
          const seed = generatedSeeds[selectedSeedIdx];
          title = seed.title;
          summary = seed.logline;
          visualStyle = seed.visualStyle;
          
          initialAssets.push({
              id: `asset-bible-${Date.now()}`,
              department: DepartmentType.STORY,
              title: "Story Bible",
              description: `Logline: ${summary}\n\nGenre: ${seed.genre}`,
              visualStyle: visualStyle,
              summary: summary,
              status: 'active'
          });

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
             initialNodes.push({
                 id: `seed-beat-${Date.now()}`,
                 type: NodeType.AI_TEXT_GEN,
                 department: DepartmentType.WRITERS_ROOM,
                 parentId: groupId,
                 position: { x: 120, y: 160 },
                 width: 400,
                 height: 400,
                 data: {
                     prompt: `Write a beat sheet for a ${seed.genre} film called "${title}".\nLogline: ${summary}`,
                     status: 'generating'
                 }
             });
             initialNodes.push({
                 id: `seed-script-${Date.now()}`,
                 type: NodeType.AI_TEXT_GEN,
                 department: DepartmentType.WRITERS_ROOM,
                 parentId: groupId,
                 position: { x: 540, y: 160 },
                 width: 400,
                 height: 400,
                 data: {
                     prompt: `Write the opening sequence script for "${title}".\nGenre: ${seed.genre}.\nLogline: ${summary}`,
                     status: 'generating'
                 }
             });
          }
      }

      // Drive Integration
      let driveData = {};
      if (isDriveConnected) {
          try {
              const struct = await GoogleDriveService.createProjectDriveStructure(title);
              driveData = {
                  driveFolderId: struct.projectId,
                  driveDbId: struct.dbId
              };
              setDriveFolderMap(struct.folders); // Store local map for session
          } catch(e) {
              console.error("Failed to create Drive structure", e);
          }
      }

      const newProj: Project = {
          id: `p-${Date.now()}`,
          title,
          summary,
          type,
          assets: initialAssets,
          nodes: initialNodes,
          connections: [],
          updatedAt: new Date(),
          ...driveData
      };

      setProjects([...projects, newProj]);
      setCurrentProjectId(newProj.id);
      setView('project');
      resetProjectModal();
  };

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
      
      let defaultVisualStyle = "";
      if (currentDept === DepartmentType.STORY) {
          defaultVisualStyle = "Storyboard";
      }

      const newAsset: ProjectAsset = {
          id: newId,
          department: currentDept,
          title: newAssetTitle,
          description: newAssetDesc,
          summary: "Generating AI summary...", 
          parentId: newAssetParentId,
          visualStyle: defaultVisualStyle,
          status: 'active'
      };

      // Drive: Sync Folder
      if (isDriveConnected && activeProject) {
          try {
              // Ensure we have a folder ID for this asset (important for Sets/Prod)
              const driveId = await GoogleDriveService.syncAssetFolder(newAsset, activeProject.driveFolderId!, driveFolderMap);
              newAsset.driveId = driveId;
          } catch(e) { console.error(e); }
      }

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

  const handleDeleteAsset = (assetId: string) => {
      if (!currentProjectId) return;
      
      setProjects(prev => {
          const project = prev.find(p => p.id === currentProjectId);
          if (!project) return prev;

          const idsToDelete = new Set<string>();
          const collectIds = (id: string, assets: ProjectAsset[]) => {
              idsToDelete.add(id);
              assets.filter(a => a.parentId === id).forEach(child => collectIds(child.id, assets));
          };
          
          collectIds(assetId, project.assets);

          if (currentAssetId && idsToDelete.has(currentAssetId)) {
              setTimeout(() => {
                  setCurrentAssetId(null);
                  setFocusNodeIds([]);
              }, 0);
          }

          return prev.map(p => {
              if (p.id === currentProjectId) {
                  return {
                      ...p,
                      assets: p.assets.filter(a => !idsToDelete.has(a.id))
                  };
              }
              return p;
          });
      });
  };

  const handleArchiveAsset = (assetId: string) => {
      if (!currentProjectId) return;
      
      setProjects(prev => {
          const project = prev.find(p => p.id === currentProjectId);
          if (!project) return prev;

          const idsToArchive = new Set<string>();
          const collectIds = (id: string, assets: ProjectAsset[]) => {
              idsToArchive.add(id);
              assets.filter(a => a.parentId === id).forEach(child => collectIds(child.id, assets));
          };
          
          collectIds(assetId, project.assets);

          if (currentAssetId && idsToArchive.has(currentAssetId)) {
              setTimeout(() => {
                  setCurrentAssetId(null);
                  setFocusNodeIds([]);
              }, 0);
          }

          return prev.map(p => {
              if (p.id === currentProjectId) {
                  return {
                      ...p,
                      assets: p.assets.map(a => idsToArchive.has(a.id) ? { ...a, status: 'archived' } : a)
                  };
              }
              return p;
          });
      });
  };

  const handleRestoreAsset = (assetId: string) => {
      if (!currentProjectId) return;

      setProjects(prev => {
          const project = prev.find(p => p.id === currentProjectId);
          if (!project) return prev;

          const idsToRestore = new Set<string>();
          const collectIds = (id: string, assets: ProjectAsset[]) => {
              idsToRestore.add(id);
              assets.filter(a => a.parentId === id).forEach(child => collectIds(child.id, assets));
          };
          collectIds(assetId, project.assets);

          return prev.map(p => {
              if (p.id === currentProjectId) {
                  return {
                      ...p,
                      assets: p.assets.map(a => idsToRestore.has(a.id) ? { ...a, status: 'active' } : a)
                  };
              }
              return p;
          });
      });
  };

  const handleSetThumbnail = useCallback(async (assetId: string, imageUrl: string) => {
      if (!currentProjectId) return;
      
      let finalUrl = imageUrl;

      // Drive Upload Logic
      if (isDriveConnected && activeProject) {
          const asset = activeProject.assets.find(a => a.id === assetId);
          if (asset && asset.driveId) {
             try {
                 const driveLink = await GoogleDriveService.uploadFileToDrive(asset.driveId, `Thumbnail_${asset.title}.png`, imageUrl, 'image/png');
                 finalUrl = driveLink; 
             } catch(e) { console.error("Thumbnail upload failed", e); }
          }
      }

      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              return {
                  ...p,
                  assets: p.assets.map(a => a.id === assetId ? { ...a, thumbnailUrl: finalUrl } : a)
              };
          }
          return p;
      }));
  }, [currentProjectId, isDriveConnected, activeProject]);

  const handleNavigateToAsset = (assetId: string) => {
      const asset = activeProject?.assets.find(a => a.id === assetId);
      if (asset) {
          setCurrentDept(asset.department);
          setCurrentAssetId(asset.id);
      }
  };


  // --- Generation Workflows ---
  // ... (Includes all generation handlers from previous file, omitted here for brevity but assumed present in final output)
  const handleGenerateConcepts = (count: number) => {
    // ... (Implementation same as previous)
    if (!activeAsset || !currentProjectId || !activeProject) return;
    
    // 1. Determine Bounding Box... (Existing implementation)
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
    const nodeWidth = 300;
    const nodeHeight = 450;
    const gap = 20;
    const padding = 20;

    const groupId = `group-${Date.now()}`;
    const groupWidth = (nodeWidth * count) + (gap * (count - 1)) + (padding * 2);
    const groupHeight = nodeHeight + (padding * 2) + 40;

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

    const newNodes: FlowNode[] = [];
    
    let defaultPrompt = `@${activeAsset.title}`;
    if (activeAsset.parentId && currentDept === DepartmentType.CASTING_WARDROBE) {
        const parent = activeProject.assets.find(a => a.id === activeAsset.parentId);
        if (parent) {
            defaultPrompt = `@${parent.title}.${activeAsset.title}`;
        }
    }

    let defaultRatio = "16:9";
    if (currentDept === DepartmentType.CASTING_WARDROBE) {
        defaultRatio = "1:1";
    }

    for (let i = 0; i < count; i++) {
        const childX = startX + padding + (i * (nodeWidth + gap));
        const childY = startY + 60;

        newNodes.push({
            id: `gen-${Date.now()}-${i}`,
            type: NodeType.AI_IMAGE_GEN,
            department: currentDept,
            assetId: activeAsset.id,
            parentId: groupId,
            position: { x: childX, y: childY }, 
            width: nodeWidth,
            height: nodeHeight,
            data: {
                prompt: defaultPrompt,
                aspectRatio: defaultRatio,
                status: 'generating',
                tag: 'concept' 
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

    setFocusNodeIds(allNewIds);
  };
  
  const handleGalleryGenerate = (prompt: string, count: number, model: string, aspectRatio: string) => {
      if (!currentProjectId || !activeProject) return;
      
      const contextNodes = activeProject.nodes.filter(n => 
          n.department === currentDept && 
          n.assetId === (currentAssetId || undefined) &&
          n.data.status !== 'archived'
      );
      
      let maxY = 0;
      if (contextNodes.length > 0) maxY = Math.max(...contextNodes.map(n => n.position.y + (n.height || 400)));
      
      const startY = maxY > 0 ? maxY + 100 : 100;
      const startX = 100;
      const nodeWidth = 300;
      const nodeHeight = 450;
      const gap = 20;
      const padding = 20;

      const groupId = `group-gal-${Date.now()}`;
      const groupWidth = (nodeWidth * count) + (gap * (count - 1)) + (padding * 2);
      const groupHeight = nodeHeight + (padding * 2) + 40;

      const groupNode: FlowNode = {
        id: groupId,
        type: NodeType.GROUP,
        department: currentDept,
        assetId: currentAssetId || undefined,
        position: { x: startX, y: startY },
        width: groupWidth,
        height: groupHeight,
        data: {
            label: `Gallery Batch ${new Date().toLocaleTimeString()}`,
            collapsed: false
        }
      };

      const newNodes: FlowNode[] = [];
      for (let i = 0; i < count; i++) {
          const childX = startX + padding + (i * (nodeWidth + gap));
          const childY = startY + 60;

          newNodes.push({
              id: `gal-gen-${Date.now()}-${i}`,
              type: model.includes('veo') ? NodeType.AI_VIDEO_GEN : NodeType.AI_IMAGE_GEN,
              department: currentDept,
              assetId: currentAssetId || undefined,
              parentId: groupId,
              position: { x: childX, y: childY }, 
              width: nodeWidth,
              height: nodeHeight,
              data: {
                  prompt: prompt,
                  aspectRatio: aspectRatio,
                  model: model,
                  status: 'generating',
                  duration: model.includes('veo') ? '4' : undefined,
                  withAudio: false
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
      setFocusNodeIds(allNewIds);
  }

  const handleGenerateOutline = () => {
      // ... (Same as previous)
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
      const nodeWidth = 600;
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

  const handleRefineConcept = (assetId: string, sourceImageUrl?: string) => {
       // ... (Same as previous)
      if (!currentProjectId || !activeProject) return;
      const asset = activeProject.assets.find(a => a.id === assetId);
      if (!asset) return;

      const contextNodes = activeProject.nodes.filter(n => 
          n.department === currentDept && 
          n.assetId === assetId &&
          n.data.status !== 'archived'
      );
      let maxY = 0;
      if (contextNodes.length > 0) maxY = Math.max(...contextNodes.map(n => n.position.y + (n.height || 400)));

      const startY = maxY > 0 ? maxY + 100 : 100;
      const startX = 100;
      const nodeWidth = 300;
      const nodeHeight = 400;
      const gap = 20;
      const padding = 20;

      const prompts = [
          `@${asset.title}, Full body character standing in a NEUTRAL POSE on a white background, soft neutral lighting, hands at sides, no props, whole body visible in frame`,
          `@${asset.title}, Extreme closeup of head and shoulders facing the camera on a white background, neutral lighting, neutral expression, high detail face`,
          `@${asset.title}, Full body front view on white background. CHARACTER IS FACING DIRECTLY TOWARD THE CAMERA IN A NEUTRAL POSE, front-on, hands at sides, no props.`,
          `@${asset.title}, Full body three quarter view on a white background in a NEUTRAL POSE in neutral lighting, hands at sides, no props. THE SUBJECT IS FACING SCREEN LEFT (45 degrees).`,
          `@${asset.title}, Full body three quarter view on a white background in a NEUTRAL POSE in neutral lighting, hands at sides, no props. THE SUBJECT IS FACING SCREEN RIGHT (45 degrees).`,
          `@${asset.title}, Full body side profile view on a white background in a NEUTRAL POSE in neutral lighting, hands at sides, no props. THE SUBJECT IS FACING DIRECTLY LEFT (90 degrees).`,
          `@${asset.title}, Full body side profile view on a white background in a NEUTRAL POSE in neutral lighting, hands at sides, no props. THE SUBJECT IS FACING DIRECTLY RIGHT (90 degrees).`,
          `@${asset.title}, Full body back view on a white background in a NEUTRAL POSE in neutral lighting, hands at sides, no props. THE SUBJECT IS FACING AWAY FROM THE CAMERA.`
      ];

      const columns = 4;
      const rows = 2;
      const groupWidth = (nodeWidth * columns) + (gap * (columns - 1)) + (padding * 2);
      const groupHeight = (nodeHeight * rows) + (gap * (rows - 1)) + (padding * 2) + 40;

      const groupId = `group-ref-${Date.now()}`;
      const groupNode: FlowNode = {
          id: groupId,
          type: NodeType.GROUP,
          department: currentDept,
          assetId: assetId,
          position: { x: startX, y: startY },
          width: groupWidth,
          height: groupHeight,
          data: { label: `Refined Character Sheet`, collapsed: false }
      };

      const newNodes: FlowNode[] = [];
      prompts.forEach((p, i) => {
          const col = i % columns;
          const row = Math.floor(i / columns);
          const childX = startX + padding + (col * (nodeWidth + gap));
          const childY = startY + 60 + (row * (nodeHeight + gap));

          newNodes.push({
              id: `ref-gen-${Date.now()}-${i}`,
              type: NodeType.AI_IMAGE_GEN,
              department: currentDept,
              assetId: assetId,
              parentId: groupId,
              position: { x: childX, y: childY },
              width: nodeWidth,
              height: nodeHeight,
              data: {
                  prompt: p,
                  aspectRatio: "1:1",
                  model: MODELS.IMAGE_EDIT, 
                  status: 'generating',
                  tag: 'refinement', 
                  referenceImageUrl: sourceImageUrl 
              }
          });
      });

      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              return { ...p, nodes: [...p.nodes, groupNode, ...newNodes] };
          }
          return p;
      }));
      setFocusNodeIds([groupId]);
  }
  
  const handleGalleryTurntable = (node: FlowNode) => {
      // ... (Same as previous)
      if (!currentProjectId || !activeProject) return;
      
      const contextNodes = activeProject.nodes.filter(n => 
          n.department === currentDept && 
          n.assetId === (currentAssetId || undefined)
      );
      let maxY = 0;
      if (contextNodes.length > 0) maxY = Math.max(...contextNodes.map(n => n.position.y + (n.height || 400)));
      
      const pos = { x: 100, y: maxY + 50 };
      const width = 300;
      const height = 400;

      const model = MODELS.VIDEO_HQ;
      const supportsLastFrame = VIDEO_MODEL_CAPABILITIES[model]?.supportsLastFrame || false;

      const newNode: FlowNode = {
           id: `vid-turntable-${Date.now()}`,
           type: NodeType.AI_VIDEO_GEN,
           department: currentDept,
           assetId: node.assetId,
           parentId: node.parentId,
           position: pos,
           width: width,
           height: height,
           data: {
               prompt: `A smooth 360 degree 3D turntable of a static model, seamless loop, high quality render`,
               imageUrl: node.data.imageUrl, // Seed image
               lastFrameImageUrl: supportsLastFrame ? node.data.imageUrl : undefined,
               model: model,
               aspectRatio: '16:9',
               status: 'draft',
               duration: '8', // Prefer long for turntable
               withAudio: false
           }
      };

      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              return { ...p, nodes: [...p.nodes, newNode] };
          }
          return p;
      }));
  }

  const handleGalleryExpressions = (node: FlowNode) => {
       // ... (Same as previous)
       if (!currentProjectId || !activeProject) return;
       const contextNodes = activeProject.nodes.filter(n => 
          n.department === currentDept && 
          n.assetId === (currentAssetId || undefined)
       );
       let maxY = 0;
       if (contextNodes.length > 0) maxY = Math.max(...contextNodes.map(n => n.position.y + (n.height || 400)));
       const startY = maxY + 50;
       
       const emotions = [
           { name: 'Happiness', prompt: 'face closeup, expressing pure joy, smiling, eyes crinkling, cinematic lighting' },
           { name: 'Sadness', prompt: 'face closeup, expression of deep grief, frowning, looking down, subtle tears, moody lighting' },
           { name: 'Fear', prompt: 'face closeup, expression of terror, wide eyes, screaming, dramatic lighting' },
           { name: 'Anger', prompt: 'face closeup, expression of rage, clenched teeth, narrowed eyes, intense lighting' },
           { name: 'Surprise', prompt: 'face closeup, expression of shock, wide open mouth, wide eyes' },
           { name: 'Disgust', prompt: 'face closeup, expression of revulsion, wrinkled nose, grimace' },
           { name: 'Contempt', prompt: 'face closeup, expression of scorn, smirk, one raised eyebrow' }
       ];
       
       const columns = 4;
       const rows = 2;
       const nodeW = 300;
       const nodeH = 400;
       const gap = 20;
       const padding = 20;
       const groupWidth = (nodeW * columns) + (gap * (columns - 1)) + (padding * 2);
       const groupHeight = (nodeH * rows) + (gap * (rows - 1)) + (padding * 2) + 40;
       
       const groupId = `group-expr-${Date.now()}`;
       const groupNode: FlowNode = {
            id: groupId,
            type: NodeType.GROUP,
            department: currentDept,
            assetId: node.assetId,
            position: { x: 100, y: startY },
            width: groupWidth,
            height: groupHeight,
            data: { label: `Expressions Batch`, collapsed: false }
       };
       
       const targetModel = MODELS.VIDEO_FAST;
       const newNodes: FlowNode[] = [];
       emotions.forEach((emo, idx) => {
           const col = idx % columns;
           const row = Math.floor(idx / columns);
           const childX = 100 + padding + (col * (nodeW + gap));
           const childY = startY + 60 + (row * (nodeH + gap));

           newNodes.push({
               id: `vid-expr-${Date.now()}-${idx}`,
               type: NodeType.AI_VIDEO_GEN,
               department: currentDept,
               assetId: node.assetId,
               parentId: groupId, // Link to group
               position: { x: childX, y: childY },
               width: nodeW,
               height: nodeH,
               data: {
                   prompt: `@${activeAsset?.title || 'Character'}, ${emo.prompt}, neutral background, high quality`,
                   imageUrl: node.data.imageUrl,
                   model: targetModel,
                   aspectRatio: '16:9',
                   status: 'draft',
                   duration: '4', // Shortest
                   withAudio: false
               }
           });
       });
       
       setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              return { ...p, nodes: [...p.nodes, groupNode, ...newNodes] };
          }
          return p;
       }));
  }
  
  const handleNodesChange = useCallback((newNodes: React.SetStateAction<FlowNode[]>) => {
      if (!currentProjectId) return;
      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              const updatedNodes = typeof newNodes === 'function' ? newNodes(p.nodes) : newNodes;
              return { ...p, nodes: updatedNodes };
          }
          return p;
      }));
  }, [currentProjectId]);

  const handleConnectionsChange = useCallback((newConns: React.SetStateAction<FlowConnection[]>) => {
      if (!currentProjectId) return;
      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              const updatedConns = typeof newConns === 'function' ? newConns(p.connections) : newConns;
              return { ...p, connections: updatedConns };
          }
          return p;
      }));
  }, [currentProjectId]);
  
  // Update a single node (Used for status changes etc)
  const handleUpdateNode = useCallback((nodeId: string, data: any) => {
      if (!currentProjectId) return;
      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              return {
                  ...p,
                  nodes: p.nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n)
              };
          }
          return p;
      }));
  }, [currentProjectId]);
  
  const handleAnalyzeScripts = () => {
      setDetectedItems([]);
      setAnalysisParentId(null); 
      setIsAnalyzeModalOpen(true);
  };
  
  const handleApproveAnalysis = async () => {
      if (!currentProjectId) return;
      const approvedItems = detectedItems.filter(i => i.selected && !i.isDuplicate);
      
      const newAssets: ProjectAsset[] = approvedItems.map(item => {
          let visualStyle = "";
          if (item.type === 'Characters') visualStyle = "Cinematic Portrait";
          else if (item.type === 'Locations') visualStyle = "Wide Shot, Detailed Environment";
          
          const cleanTitle = item.name.replace(/@/g, '').trim();

          return {
              id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              department: currentDept,
              title: cleanTitle,
              description: item.description,
              visualStyle: visualStyle,
              summary: "Auto-detected",
              parentId: analysisParentId || undefined, 
              status: 'active'
          };
      });

      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              return { ...p, assets: [...p.assets, ...newAssets] };
          }
          return p;
      }));
      
      setIsAnalyzeModalOpen(false);
      setAnalysisParentId(null);
  }

  const handleRunAnalysis = async () => {
      if (!activeProject) return;
      setIsAnalyzing(true);
      
      try {
          const scriptNodes = activeProject.nodes.filter(n => 
              n.department === DepartmentType.WRITERS_ROOM && 
              n.type === NodeType.AI_TEXT_GEN && 
              n.data.text
          );
          const fullText = scriptNodes.map(n => n.data.text).join('\n\n');

          if (!fullText) {
              alert("No scripts found to analyze.");
              setIsAnalyzing(false);
              return;
          }

          let rawItems: any[] = [];
          
          if (currentDept === DepartmentType.CASTING_WARDROBE) {
              setAnalysisType('Characters');
              rawItems = await extractCharactersFromScript(fullText);
          } else if (currentDept === DepartmentType.SET_DESIGN) {
              setAnalysisType('Locations');
              rawItems = await extractLocationsFromScript(fullText);
          } else if (currentDept === DepartmentType.STORY) {
              setAnalysisType('Story');
              const knownChars = activeProject.assets
                .filter(a => a.department === DepartmentType.CASTING_WARDROBE)
                .map(a => a.title);
              rawItems = await extractStoryElementsFromScript(fullText, knownChars);
          } 

          const existingNames = new Set(
              activeProject.assets
                .filter(a => a.department === currentDept)
                .map(a => a.title.toLowerCase())
          );

          const items: DetectedItem[] = rawItems.map((r: any) => {
             const name = r.name || r.title || "Unknown";
             const isDup = existingNames.has(name.toLowerCase());
             return {
                 name: name,
                 description: r.description || r.role || "",
                 type: r.type || r.role || analysisType,
                 selected: !isDup, 
                 isDuplicate: isDup
             };
          });

          setDetectedItems(items);
      } catch (e) {
          console.error("Analysis failed", e);
      } finally {
          setIsAnalyzing(false);
      }
  }
  
  const handleDiscoverShots = async (assetId: string) => {
      if (!activeProject) return;
      const asset = activeProject.assets.find(a => a.id === assetId);
      if (!asset) return;

      setIsAnalyzing(true);
      setAnalysisParentId(assetId); 
      setAnalysisType('Shots');
      setIsAnalyzeModalOpen(true);

      try {
           const knownChars = activeProject.assets
                .filter(a => a.department === DepartmentType.CASTING_WARDROBE)
                .map(a => a.title);
           
           const rawItems = await extractShotsFromScene(asset.description, knownChars);
           
           const items: DetectedItem[] = rawItems.map((r: any) => ({
               name: r.title,
               description: r.description,
               type: 'Shot',
               selected: true
           }));
           setDetectedItems(items);
      } catch (e) { console.error(e); }
      finally { setIsAnalyzing(false); }
  }


  if (view === 'dashboard') {
    return (
      <div className="w-full h-full bg-background flex flex-col font-sans">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
                ShowrunnerAI
            </h1>
            <div className="flex items-center gap-2">
                 {isDriveConnected ? (
                     <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${isMockDrive ? 'bg-yellow-900/30 border-yellow-700 text-yellow-500' : 'bg-green-900/30 border-green-700 text-green-500'}`}>
                         {isMockDrive ? <CloudOff size={16}/> : <Cloud size={16}/>}
                         <span className="text-xs font-bold">{isMockDrive ? "Offline Mode" : "Drive Connected"}</span>
                     </div>
                 ) : (
                     <>
                        <Button variant="secondary" size="sm" onClick={handleForceOffline} icon={CloudOff}>
                             Work Offline
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handleConnectDrive} icon={Cloud}>
                             Connect Drive
                        </Button>
                     </>
                 )}
            </div>
        </div>
        
        {/* Projects List */}
        <div className="flex-1 p-8 overflow-y-auto">
             <div className="flex items-center justify-between mb-6">
                 <h2 className="text-xl font-bold text-zinc-100">Projects</h2>
                 <Button onClick={() => setIsCreateProjectOpen(true)} icon={FolderPlus}>New Project</Button>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                 {projects.map(project => (
                     <div 
                        key={project.id}
                        onClick={() => { setCurrentProjectId(project.id); setView('project'); }}
                        className="bg-surface border border-border rounded-xl p-6 hover:border-zinc-600 transition-all cursor-pointer group hover:shadow-xl hover:shadow-blue-900/10"
                     >
                         <div className="flex justify-between items-start mb-4">
                             <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center text-white font-bold text-lg">
                                 {project.title.substring(0, 2).toUpperCase()}
                             </div>
                             <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded-full border border-zinc-700">
                                 {project.type}
                             </span>
                         </div>
                         <h3 className="font-bold text-lg text-zinc-100 mb-2 group-hover:text-blue-400 transition-colors">{project.title}</h3>
                         <p className="text-sm text-zinc-500 line-clamp-2">{project.summary}</p>
                         <div className="mt-4 pt-4 border-t border-zinc-800 flex justify-between items-center text-xs text-zinc-600">
                             <span>{project.assets.length} Assets</span>
                             <span>Last edit: {project.updatedAt.toLocaleDateString()}</span>
                         </div>
                     </div>
                 ))}
             </div>
        </div>

        {/* Create Project Modal */}
        {isCreateProjectOpen && (
             <Modal title="Create New Project" onClose={resetProjectModal}>
                 <div className="space-y-6">
                     
                     {/* Creation Mode Tabs */}
                     <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                         <button 
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${creationMode === 'blank' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                            onClick={() => setCreationMode('blank')}
                         >
                             Blank Project
                         </button>
                         <button 
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 ${creationMode === 'seed' ? 'bg-blue-900/30 text-blue-200' : 'text-zinc-500 hover:text-zinc-300'}`}
                            onClick={() => setCreationMode('seed')}
                         >
                             <Dice5 size={14} /> From Seed
                         </button>
                     </div>

                     {creationMode === 'blank' ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Project Title</label>
                                <Input autoFocus value={newProjectTitle} onChange={(e) => setNewProjectTitle(e.target.value)} placeholder="e.g. The Matrix 2" />
                            </div>
                        </div>
                     ) : (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Prompt / Genre</label>
                                <div className="flex gap-2">
                                    <Input 
                                        value={seedPrompt} 
                                        onChange={(e) => setSeedPrompt(e.target.value)} 
                                        placeholder='e.g. "A cyberpunk detective story in Neo Tokyo"'
                                    />
                                    <Button onClick={handleRollDice} disabled={isGeneratingSeeds} icon={Dice5}>
                                        {isGeneratingSeeds ? '...' : 'Roll'}
                                    </Button>
                                </div>
                            </div>
                            
                            {/* Seed Results Grid */}
                            {generatedSeeds.length > 0 && (
                                <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto p-1">
                                    {generatedSeeds.map((seed, idx) => (
                                        <div 
                                            key={idx}
                                            onClick={() => setSelectedSeedIdx(idx)}
                                            className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedSeedIdx === idx ? 'bg-blue-900/20 border-blue-500 ring-1 ring-blue-500' : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800'}`}
                                        >
                                            <div className="font-bold text-sm text-white mb-1">{seed.title}</div>
                                            <div className="text-[10px] text-zinc-400 mb-2">{seed.genre}</div>
                                            <div className="text-xs text-zinc-500 line-clamp-2">{seed.logline}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex items-center gap-2">
                                <input type="checkbox" checked={autoGenAssets} onChange={e => setAutoGenAssets(e.target.checked)} id="autogen" />
                                <label htmlFor="autogen" className="text-xs text-zinc-400">Auto-generate Script & Beat Sheet</label>
                            </div>
                        </div>
                     )}

                     <div className="flex justify-end gap-2 pt-4 border-t border-zinc-800">
                         <Button variant="ghost" onClick={resetProjectModal}>Cancel</Button>
                         <Button onClick={handleCreateProject} disabled={creationMode === 'blank' ? !newProjectTitle : selectedSeedIdx === null}>
                             Create Project
                         </Button>
                     </div>
                 </div>
             </Modal>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex bg-background font-sans overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar 
            currentDept={currentDept} 
            onChangeDept={(d) => { setCurrentDept(d); setCurrentAssetId(null); setFocusNodeIds([]); }}
            onBack={() => setView('dashboard')}
        />
        
        {/* Department Panel */}
        <DepartmentPanel 
            department={currentDept}
            assets={activeProject?.assets || []}
            nodes={activeProject?.nodes || []}
            currentAssetId={currentAssetId}
            onSelectAsset={(id) => { setCurrentAssetId(id); setFocusNodeIds([]); }}
            onCreateAsset={handleOpenCreateAssetModal}
            onAnalyzeScripts={handleAnalyzeScripts}
            onDiscoverShots={handleDiscoverShots}
            assetThumbnails={assetThumbnails}
            onDeleteAsset={handleDeleteAsset}
            onArchiveAsset={handleArchiveAsset}
            onRestoreAsset={handleRestoreAsset}
        />

        {/* Workspace Area */}
        <div className="flex-1 flex flex-col relative min-w-0">
             {/* Sub-Header */}
             <div className="h-14 border-b border-border bg-surface flex items-center justify-between px-6 shrink-0 z-20">
                 <div className="flex items-center gap-4 min-w-0">
                     <h2 className="font-bold text-zinc-100 truncate">{activeAsset ? activeAsset.title : "General"}</h2>
                     {activeAsset && (
                         <span className="text-xs text-zinc-500 bg-zinc-900 px-2 py-1 rounded border border-zinc-800 max-w-[200px] truncate" title={activeAsset.summary}>
                             {activeAsset.summary || "No summary"}
                         </span>
                     )}
                 </div>
                 
                 <div className="flex items-center gap-3">
                     {/* View Toggle (Only show if NOT Editorial) */}
                     {currentDept !== DepartmentType.EDITORIAL && (
                         <ToggleGroup 
                            options={[
                                { value: 'canvas', icon: LayoutGrid, label: 'Canvas' },
                                { value: 'gallery', icon: List, label: 'Gallery' }
                            ]}
                            value={workspaceView}
                            onChange={(v) => setWorkspaceView(v as any)}
                         />
                     )}

                     <div className="h-6 w-[1px] bg-zinc-800 mx-2"/>

                     {isDriveConnected && (
                         <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                             {isMockDrive ? <CloudOff size={12} className="text-yellow-600"/> : <Cloud size={12} className="text-green-600"/>}
                             {isMockDrive ? "Offline Save" : "Auto-Save On"}
                         </div>
                     )}
                 </div>
             </div>

             {/* Workspace Content */}
             <div className="flex-1 relative bg-black overflow-hidden">
                 {currentDept === DepartmentType.EDITORIAL ? (
                     // Editorial View
                     editorialState.sequence ? (
                         <EditorTimeline 
                             sequenceAsset={editorialState.sequence}
                             filterAssetId={editorialState.filterId}
                             projectAssets={activeProject?.assets || []}
                             projectNodes={activeProject?.nodes || []}
                             onUpdateAsset={handleUpdateAsset}
                             onUpdateNode={handleUpdateNode}
                         />
                     ) : (
                         <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
                             <Scissors size={48} className="opacity-20" />
                             <p>Select a Sequence (created in Story) to start editing.</p>
                         </div>
                     )
                 ) : (
                     // Standard Canvas/Gallery View
                     workspaceView === 'canvas' ? (
                         <Canvas 
                            nodes={activeProject?.nodes || []}
                            connections={activeProject?.connections || []}
                            setNodes={handleNodesChange}
                            setConnections={handleConnectionsChange}
                            currentDept={currentDept}
                            currentAssetId={currentAssetId}
                            activeAsset={activeAsset}
                            focusNodes={focusNodeIds}
                            onSetThumbnail={handleSetThumbnail}
                            projectAssets={activeProject?.assets}
                            onRefineConcept={handleRefineConcept}
                            refinedImagesMap={refinedImagesMap}
                         />
                     ) : (
                        <GalleryView 
                            nodes={activeProject?.nodes || []}
                            currentDept={currentDept}
                            currentAssetId={currentAssetId}
                            onGenerateBatch={handleGalleryGenerate}
                            onSetThumbnail={handleSetThumbnail}
                            onRefineConcept={handleRefineConcept}
                            onGenerateTurntable={handleGalleryTurntable}
                            onGenerateExpressions={handleGalleryExpressions}
                        />
                     )
                 )}
                 
                 {/* Chat Assistant - Hide in Editorial for space? Kept for now. */}
                 {currentDept !== DepartmentType.EDITORIAL && <ChatBot scriptContext={scriptContext} />}
             </div>
        </div>

        {/* Floating Modals */}
        {isCreateAssetOpen && (
            <Modal title={`Create New ${activeDeptConfig?.assetLabel || 'Asset'}`} onClose={() => setIsCreateAssetOpen(false)}>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Title</label>
                        <Input autoFocus value={newAssetTitle} onChange={(e) => setNewAssetTitle(e.target.value)} placeholder="e.g. The Main Character" />
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs font-bold text-zinc-500 uppercase">Description</label>
                            <button onClick={handleEnhanceDescription} disabled={!newAssetDesc} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                                <Sparkles size={12}/> Enhance with AI
                            </button>
                        </div>
                        <TextArea value={newAssetDesc} onChange={(e) => setNewAssetDesc(e.target.value)} placeholder="Describe visual appearance, personality, role..." />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="ghost" onClick={() => setIsCreateAssetOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateAsset} disabled={!newAssetTitle}>Create</Button>
                    </div>
                </div>
            </Modal>
        )}

        {showEnhanceModal && (
            <Modal title="Enhance Description" onClose={() => setShowEnhanceModal(false)}>
                <div className="space-y-4">
                    <p className="text-sm text-zinc-400">Select the best version:</p>
                    {isEnhancing ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="animate-spin text-blue-500" size={32} />
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                            {enhancementOptions.map((opt, i) => (
                                <div key={i} onClick={() => applyEnhancement(opt)} className="p-3 rounded bg-zinc-800 hover:bg-zinc-700 cursor-pointer border border-zinc-700 hover:border-blue-500 transition-all text-sm text-zinc-200">
                                    {opt}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>
        )}
        
        {isAnalyzeModalOpen && (
             <Modal title={`Analyze for ${analysisType}`} onClose={() => setIsAnalyzeModalOpen(false)} maxWidth="max-w-2xl">
                 <div className="flex flex-col h-[60vh]">
                     {!isAnalyzing && detectedItems.length === 0 && (
                         <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
                             <Wand2 size={48} className="text-purple-500 opacity-50"/>
                             <div className="space-y-2">
                                 <h3 className="text-lg font-bold text-white">Scan Script for {analysisType}</h3>
                                 <p className="text-sm text-zinc-400 max-w-sm mx-auto">
                                     We will analyze all generated scripts and notes to automatically identify {analysisType.toLowerCase()}.
                                 </p>
                             </div>
                             <Button onClick={handleRunAnalysis} size="lg">Start Analysis</Button>
                         </div>
                     )}

                     {isAnalyzing && (
                         <div className="flex-1 flex flex-col items-center justify-center gap-4">
                             <Loader2 size={32} className="animate-spin text-blue-500"/>
                             <p className="text-zinc-400 animate-pulse">Reading scripts...</p>
                         </div>
                     )}

                     {detectedItems.length > 0 && (
                         <>
                             <div className="flex-1 overflow-y-auto border border-zinc-800 rounded-lg bg-zinc-900/50 p-2 space-y-2 mb-4">
                                 {detectedItems.map((item, idx) => (
                                     <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${item.selected ? 'bg-blue-900/20 border-blue-500/50' : 'bg-zinc-900 border-zinc-800 opacity-50'}`}>
                                         <input 
                                            type="checkbox" 
                                            checked={item.selected} 
                                            onChange={(e) => {
                                                const newItems = [...detectedItems];
                                                newItems[idx].selected = e.target.checked;
                                                setDetectedItems(newItems);
                                            }}
                                            className="mt-1"
                                         />
                                         <div className="flex-1 min-w-0">
                                             <div className="flex items-center justify-between">
                                                 <span className="font-bold text-sm text-white">{item.name}</span>
                                                 {item.isDuplicate && <span className="text-[10px] text-orange-400 font-mono">Existing</span>}
                                             </div>
                                             <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{item.description}</p>
                                         </div>
                                     </div>
                                 ))}
                             </div>
                             <div className="flex justify-end gap-2 pt-4 border-t border-zinc-800">
                                 <Button variant="ghost" onClick={() => setIsAnalyzeModalOpen(false)}>Cancel</Button>
                                 <Button onClick={handleApproveAnalysis}>Import Selected ({detectedItems.filter(i => i.selected).length})</Button>
                             </div>
                         </>
                     )}
                 </div>
             </Modal>
        )}
        
        {/* Asset Editor Panel */}
        {activeAsset && currentDept !== DepartmentType.EDITORIAL && (
            <AssetEditorPanel 
                asset={activeAsset} 
                projectAssets={activeProject?.assets}
                onUpdate={handleUpdateAsset} 
                onGenerateConcepts={handleGenerateConcepts}
                onGenerateOutline={handleGenerateOutline}
                approvedImages={activeProject?.nodes
                    .filter(n => n.assetId === activeAsset.id && n.type === NodeType.AI_IMAGE_GEN && n.data.status === 'approved' && n.data.imageUrl && n.data.tag !== 'refinement')
                    .map(n => n.data.imageUrl!) || []
                }
                onNavigateToAsset={handleNavigateToAsset}
                onGenerateRefSheet={handleRefineConcept}
                assetThumbnails={assetThumbnails}
                refinedImages={refinedImagesMap[activeAsset.id] || []}
            />
        )}
        
    </div>
  );
};

export default App;
