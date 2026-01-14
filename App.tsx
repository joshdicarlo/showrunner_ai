
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';
import { GalleryView } from './components/GalleryView'; 
import { DepartmentPanel } from './components/DepartmentPanel';
import { AssetEditorPanel } from './components/AssetEditorPanel';
import { ChatBot } from './components/ChatBot';
import { EditorTimeline } from './components/EditorTimeline';
import { SettingsModal } from './components/SettingsModal';
import { RenderQueuePanel } from './components/RenderQueuePanel';
import { Login } from './components/Login';
import { DepartmentType, FlowNode, FlowConnection, Project, NodeType, ProjectAsset, StorySeed, RenderTask, OneShotItem, TimelineClip, ProjectSettings, BatchType } from './types';
import { DEPARTMENTS, MODELS, VIDEO_MODEL_CAPABILITIES, DEFAULT_PROJECT_SETTINGS } from './constants';
import { Button, Input, Modal, TextArea, ToggleGroup, QueueIndicator } from './components/UI';
import { generateEnhancementOptions, generateSummary, extractCharactersFromScript, extractLocationsFromScript, extractStoryElementsFromScript, generateStorySeeds, extractShotsFromScene, extractOneShotBreakdown, generateImage, generateVideo } from './services/geminiService';
import { generateLumaVideo, generateLumaImage } from './services/lumaService';
import * as GoogleDriveService from './services/googleDriveService';
import { createRenderQueue } from './services/renderQueue';
import { OneShotModal } from './components/OneShotModal';
import { resolvePrompt, resolveReferenceImages } from './utils/promptUtils';
import { TEMPLATES } from './data/templates';
import { FolderPlus, Film, Layout, CornerUpLeft, Sparkles, Check, Wand2, Dice5, Cloud, Loader2, CloudOff, Grid, List, LayoutGrid, Scissors, Layers, Plus, ArrowRight, Clock, Star, Zap } from 'lucide-react';

type View = 'dashboard' | 'project';

interface DetectedItem {
    name: string;
    description: string;
    summary?: string;
    type: string;
    selected: boolean;
    isDuplicate?: boolean;
    children?: DetectedItem[]; 
}

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [view, setView] = useState<View>('dashboard');
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  
  const [currentDept, setCurrentDept] = useState<DepartmentType>(DepartmentType.WRITERS_ROOM);
  const [currentAssetId, setCurrentAssetId] = useState<string | null>(null); 
  const [workspaceView, setWorkspaceView] = useState<'canvas' | 'gallery'>('canvas'); 

  const [focusNodeIds, setFocusNodeIds] = useState<string[]>([]);

  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isCreateAssetOpen, setIsCreateAssetOpen] = useState(false);
  const [showEnhanceModal, setShowEnhanceModal] = useState(false);
  const [isAnalyzeModalOpen, setIsAnalyzeModalOpen] = useState(false);
  const [isOneShotModalOpen, setIsOneShotModalOpen] = useState(false);
  const [isRenderQueueOpen, setIsRenderQueueOpen] = useState(false); 
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [creationMode, setCreationMode] = useState<'blank' | 'seed'>('blank');
  const [newProjectTitle, setNewProjectTitle] = useState('');
  
  const [seedPrompt, setSeedPrompt] = useState('');
  const [generatedSeeds, setGeneratedSeeds] = useState<StorySeed[]>([]);
  const [selectedSeedIdx, setSelectedSeedIdx] = useState<number | null>(null);
  const [isGeneratingSeeds, setIsGeneratingSeeds] = useState(false);
  const [autoGenAssets, setAutoGenAssets] = useState(true);

  const [newAssetTitle, setNewAssetTitle] = useState('');
  const [newAssetDesc, setNewAssetDesc] = useState('');
  const [newAssetParentId, setNewAssetParentId] = useState<string | undefined>(undefined);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancementOptions, setEnhancementOptions] = useState<string[]>([]);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([]);
  const [oneShotItems, setOneShotItems] = useState<OneShotItem[]>([]);
  const [analysisType, setAnalysisType] = useState<string>(''); 
  const [analysisParentId, setAnalysisParentId] = useState<string | null>(null); 
  const [autoFindShots, setAutoFindShots] = useState(true);

  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [isMockDrive, setIsMockDrive] = useState(false);
  const [driveFolderMap, setDriveFolderMap] = useState<Record<string, string>>({});

  const [renderQueue, setRenderQueue] = useState<RenderTask[]>([]);
  const [queuePaused, setQueuePaused] = useState(false);
  
  const projectsRef = useRef(projects);
  const currentProjectIdRef = useRef(currentProjectId);
  useEffect(() => { projectsRef.current = projects; }, [projects]);
  useEffect(() => { currentProjectIdRef.current = currentProjectId; }, [currentProjectId]);

  const activeProject = projects.find(p => p.id === currentProjectId);

  const handleTaskExecution = async (task: RenderTask): Promise<string> => {
      const activeProj = projectsRef.current.find(p => p.id === currentProjectIdRef.current);
      const asset = activeProj?.assets.find(a => a.id === task.assetId);
      
      const { resolved, matchedAssets } = resolvePrompt(
          task.prompt, 
          activeProj?.assets, 
          asset,
          activeProj?.settings || DEFAULT_PROJECT_SETTINGS,
          task.config?.styleId 
      );
      
      task.submittedPrompt = resolved;
      
      const model = task.config?.model || MODELS.IMAGE_GEN;

      if (task.type === 'image') {
          if (model.includes('luma')) {
               const res = await generateLumaImage(resolved, BatchType.STANDARD, "1024x1024"); // Default res
               return res.uri;
          }

          const approvedMap: Record<string, string[]> = {};
          activeProj?.assets.forEach(a => {
              const images = activeProj.nodes
                .filter(n => n.assetId === a.id && n.data.status === 'approved' && n.data.imageUrl)
                .map(n => n.data.imageUrl!);
              if (images.length > 0) approvedMap[a.id] = images;
          });

          const refImages = resolveReferenceImages(
              task.prompt, 
              activeProj?.assets, 
              asset, 
              {}, 
              approvedMap, 
              {}, 
              matchedAssets
          );
          return await generateImage(resolved, task.config?.aspectRatio || "16:9", task.config?.model, refImages);
      } else if (task.type === 'video') {
          const startImage = task.startImage; 
          const duration = 5; 
          const model = task.config?.model || MODELS.VIDEO_FAST;

          // Branch: Luma vs Veo based on model name
          if (model.includes('luma')) {
              return await generateLumaVideo(
                  startImage || "",
                  resolved,
                  BatchType.STANDARD,
                  undefined,
                  duration,
                  undefined,
                  (status) => {
                      const match = status.match(/\((\d+)%\)/);
                      const percent = match ? parseInt(match[1]) : 0;
                      queueService.updateTaskProgress(task.id, percent);
                  }
              );
          } else {
              return await generateVideo(
                  resolved,
                  task.config?.aspectRatio as any || "16:9",
                  startImage,
                  model,
                  duration.toString(),
                  false,
                  undefined,
                  (msg, percent) => {
                      queueService.updateTaskProgress(task.id, percent);
                  }
              );
          }
      }
      return "";
  };

  const onTaskComplete = (task: RenderTask, result: string) => {
      if (!currentProjectIdRef.current) return;
      
      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectIdRef.current) {
              const asset = p.assets.find(a => a.id === task.assetId);
              // Basic validation for node creation
              if (!asset && !task.config?.targetNodeId) return p;

              // 1. Create or update the flow node
              const newNodeId = task.config?.targetNodeId || `gen-node-${Date.now()}-${Math.random()}`;
              const existingNode = task.config?.targetNodeId ? p.nodes.find(n => n.id === task.config!.targetNodeId) : null;
              
              const newNode: FlowNode = {
                  id: newNodeId,
                  type: task.type === 'video' ? NodeType.AI_VIDEO_GEN : NodeType.AI_IMAGE_GEN,
                  department: asset ? asset.department : DepartmentType.WRITERS_ROOM,
                  assetId: asset?.id,
                  parentId: existingNode?.parentId ?? undefined, 
                  position: existingNode?.position ?? { x: 100, y: 100 }, 
                  width: existingNode?.width,
                  height: existingNode?.height,
                  data: {
                      ...(existingNode?.data || {}),
                      imageUrl: task.type === 'image' ? result : (task.startImage || result), 
                      videoUrl: task.type === 'video' ? result : undefined,
                      prompt: task.prompt,
                      status: task.config?.autoApprove ? 'approved' : 'review',
                      model: task.config?.model,
                      aspectRatio: task.config?.aspectRatio,
                      styleId: task.config?.styleId,
                      submittedPrompt: task.submittedPrompt
                  }
              };

              let updatedNodes = p.nodes;
              if (task.config?.targetNodeId) {
                  updatedNodes = p.nodes.map(n => n.id === task.config!.targetNodeId ? newNode : n);
              } else {
                  updatedNodes = [...p.nodes, newNode];
              }

              // 2. Sync results to project assets (Timeline and Sequence updates)
              let updatedAssets = p.assets;
              
              // Handle "Generate & Replace" functionality
              if (task.config?.replaceClipId) {
                  updatedAssets = updatedAssets.map(a => {
                      if (a.timelineData) {
                          const updatedClips = a.timelineData.clips.map(c => {
                              if (c.id === task.config!.replaceClipId) {
                                  return {
                                      ...c,
                                      mediaUrl: result,
                                      mediaType: 'video' as const,
                                      sourceNodeId: newNodeId,
                                      thumbnail: task.startImage || result
                                  };
                              }
                              return c;
                          });
                          return { ...a, timelineData: { ...a.timelineData, clips: updatedClips }};
                      }
                      return a;
                  });
              }
              
              // Handle "Auto-Assemble" functionality
              else if (task.config?.autoAssemble && task.config?.sequenceId && asset) {
                  updatedAssets = updatedAssets.map(a => {
                      if (a.id === task.config!.sequenceId) {
                          const newClip: TimelineClip = {
                              id: `clip-${Date.now()}-${Math.random()}`,
                              sourceNodeId: newNodeId, 
                              mediaUrl: result,
                              mediaType: task.type as any,
                              start: a.timelineData ? a.timelineData.duration : 0,
                              duration: 5, 
                              offset: 0,
                              track: 0,
                              label: asset.title,
                              thumbnail: task.type === 'image' ? result : task.startImage
                          };
                          
                          const newTimelineData = {
                              clips: [...(a.timelineData?.clips || []), newClip],
                              duration: (a.timelineData?.duration || 0) + 5
                          };
                          return { ...a, timelineData: newTimelineData };
                      }
                      return a;
                  });
              }

              return { ...p, assets: updatedAssets, nodes: updatedNodes };
          }
          return p;
      }));
  };

  const queueService = useMemo(() => createRenderQueue(
      onTaskComplete, 
      handleTaskExecution,
      () => projectsRef.current.find(p => p.id === currentProjectIdRef.current)?.settings.concurrentGenerations || 10
  ), []);
  
  useEffect(() => {
      return queueService.subscribe((q) => {
          setRenderQueue(q);
          setQueuePaused(queueService.isPaused());
      });
  }, [queueService]);

  useEffect(() => {
      if (renderQueue.length > 0) {
          const waitingTasks = renderQueue.filter(t => t.status === 'waiting' && t.waitingOnBatchId);
          if (waitingTasks.length === 0) return;
          const batchesToCheck = new Set(waitingTasks.map(t => t.batchId));
          batchesToCheck.forEach(batchId => {
              const sampleTask = waitingTasks.find(t => t.batchId === batchId);
              if (!sampleTask || !sampleTask.waitingOnBatchId) return;
              const dependencyId = sampleTask.waitingOnBatchId;
              const depTasks = renderQueue.filter(t => t.batchId === dependencyId);
              const isDependencyActive = depTasks.some(t => t.status === 'pending' || t.status === 'processing' || t.status === 'waiting');
              if (!isDependencyActive && depTasks.length > 0) {
                  queueService.updateBatchStatus(batchId!, 'pending');
              }
          });
      }
  }, [renderQueue, queueService]);

  useEffect(() => {
      GoogleDriveService.initGapi().then(() => {
          console.log("Google API Initialized");
      });
  }, []);

  useEffect(() => {
      const initTemplates = TEMPLATES.map(t => ({
          ...t,
          settings: t.settings || DEFAULT_PROJECT_SETTINGS
      }));
      setProjects(initTemplates);
  }, []);

  const activeAsset = activeProject?.assets.find(a => a.id === currentAssetId);
  const activeDeptConfig = DEPARTMENTS.find(d => d.id === currentDept);

  const editorialState = useMemo(() => {
      if (!activeAsset || currentDept !== DepartmentType.EDITORIAL) return { sequence: null, filterId: null };
      if (activeAsset.parentId) {
          const parent = activeProject?.assets.find(a => a.id === activeAsset.parentId);
          return { sequence: parent || null, filterId: activeAsset.id };
      }
      return { sequence: activeAsset, filterId: null };
  }, [activeAsset, currentDept, activeProject?.assets]);

  const scriptContext = useMemo(() => {
      if (!activeProject) return "";
      const scriptNodes = activeProject.nodes.filter(n => 
          n.department === DepartmentType.WRITERS_ROOM && 
          (n.type === NodeType.TEXT_INPUT || n.type === NodeType.AI_TEXT_GEN && n.data.text)
      );
      
      return scriptNodes.map(n => 
          `[Source: ${n.type === NodeType.TEXT_INPUT ? 'Note' : 'Generated Script'}]\n${n.data.text}`
      ).join('\n\n');
  }, [activeProject?.nodes]);

  const assetThumbnails = useMemo(() => {
      if (!activeProject) return {};
      const map: Record<string, string> = {};
      
      activeProject.assets.forEach(asset => {
          if (asset.thumbnailUrl) {
              map[asset.id] = asset.thumbnailUrl;
          } else {
              const candidates = activeProject.nodes.filter(n => 
                  n.assetId === asset.id && 
                  n.type === NodeType.AI_IMAGE_GEN && 
                  n.data.status === 'approved' && 
                  n.data.imageUrl
              );
              if (candidates.length > 0) {
                   const latest = candidates.sort((a, b) => b.id.localeCompare(a.id))[0];
                   if (latest.data.imageUrl) map[asset.id] = latest.data.imageUrl;
              }
          }
      });
      return map;
  }, [activeProject?.nodes, activeProject?.assets]);
  
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

  const approvedImagesMap = useMemo(() => {
      if (!activeProject) return {};
      const map: Record<string, string[]> = {};
      activeProject.assets.forEach(asset => {
          const images = activeProject.nodes
            .filter(n => n.assetId === asset.id && n.data.status === 'approved' && n.data.imageUrl)
            .map(n => n.data.imageUrl!);
          if (images.length > 0) map[asset.id] = images;
      });
      return map;
  }, [activeProject?.nodes, activeProject?.assets]);

  const handleLoginSuccess = (isMock: boolean) => {
      setIsMockDrive(isMock);
      setIsDriveConnected(true);
      setIsAuthenticated(true);
  };

  const handleConnectDrive = async () => {
      try {
          await GoogleDriveService.signIn();
          if (GoogleDriveService.isMockMode()) {
              setIsMockDrive(true);
          } else {
              setIsMockDrive(false);
          }
          setIsDriveConnected(true);
      } catch (e) {
          console.error("Drive connection failed", e);
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

  useEffect(() => {
      if (activeProject && isDriveConnected) {
          const timer = setTimeout(() => {
              syncToDrive(activeProject);
          }, 3000); 
          return () => clearTimeout(timer);
      }
  }, [activeProject?.assets, isDriveConnected, syncToDrive]);

  const resetProjectModal = () => {
      setNewProjectTitle('');
      setCreationMode('blank');
      setProjectSeedPrompt('');
      setGeneratedSeeds([]);
      setSelectedSeedIdx(null);
      setAutoGenAssets(true);
      setIsCreateProjectOpen(false);
  }

  const [projectSeedPrompt, setProjectSeedPrompt] = useState('');

  const handleRollDice = async () => {
      setIsGeneratingSeeds(true);
      setGeneratedSeeds([]);
      try {
          const seeds = await generateStorySeeds(projectSeedPrompt);
          setGeneratedSeeds(seeds);
      } finally {
          setIsGeneratingSeeds(false);
      }
  }

  const handleCreateProject = async () => {
      let title = newProjectTitle;
      let summary = '';
      let initialAssets: ProjectAsset[] = [];
      let initialNodes: FlowNode[] = [];
      let type: Project['type'] = 'Feature';
      let visualStyle = '';

      if (creationMode === 'blank') {
          if (!newProjectTitle) return;
      } else {
          if (selectedSeedIdx === null || !generatedSeeds[selectedSeedIdx]) return;
          const seed = generatedSeeds[selectedSeedIdx];
          title = seed.title;
          summary = seed.logline;
          visualStyle = seed.visualStyle; 
          
          initialAssets.push({
              id: `asset-bible-${Date.now()}`,
              department: DepartmentType.STORY,
              title: "Story Bible",
              description: `Logline: ${summary}\n\nGenre: ${seed.genre}\n\nStyle Notes: ${visualStyle}`,
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

      let driveData = {};
      if (isDriveConnected) {
          try {
              const struct = await GoogleDriveService.createProjectDriveStructure(title);
              driveData = {
                  driveFolderId: struct.projectId,
                  driveDbId: struct.dbId
              };
              setDriveFolderMap(struct.folders); 
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
          settings: DEFAULT_PROJECT_SETTINGS,
          ...driveData
      };

      setProjects([...projects, newProj]);
      setCurrentProjectId(newProj.id);
      setView('project');
      resetProjectModal();
  };

  const handleUpdateProjectSettings = (settings: ProjectSettings) => {
      if (!currentProjectId) return;
      setProjects(prev => prev.map(p => p.id === currentProjectId ? { ...p, settings } : p));
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
      const newAsset: ProjectAsset = {
          id: newId,
          department: currentDept,
          title: newAssetTitle,
          description: newAssetDesc,
          summary: "Generating AI summary...", 
          parentId: newAssetParentId,
          visualStyle: "",
          status: 'active'
      };

      if (isDriveConnected && activeProject) {
          try {
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

  const handleGenerateConcepts = (count: number, styleId?: string) => {
    if (!activeAsset || !currentProjectId || !activeProject) return;
    
    const contextNodes = activeProject.nodes.filter(n => 
        n.department === currentDept && 
        n.assetId === activeAsset.id &&
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

    const batchId = `batch-concepts-${Date.now()}`;
    const batchLabel = `Concepts: ${activeAsset.title}`;

    const newNodes: FlowNode[] = [];
    const tasks: RenderTask[] = [];
    
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
        const nodeId = `gen-${Date.now()}-${i}`;

        newNodes.push({
            id: nodeId,
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
                tag: 'concept',
                styleId: styleId 
            }
        });
        
        tasks.push({
            id: `task-${Date.now()}-${i}`,
            type: 'image',
            prompt: defaultPrompt,
            assetId: activeAsset.id,
            status: 'pending',
            config: {
                styleId: styleId,
                aspectRatio: defaultRatio,
                model: MODELS.IMAGE_GEN,
                targetNodeId: nodeId 
            },
            batchId,
            batchLabel
        });
    }

    setProjects(prev => prev.map(p => {
        if (p.id === currentProjectId) {
             return { ...p, nodes: [...p.nodes, groupNode, ...newNodes] };
        }
        return p;
    }));

    tasks.forEach(t => queueService.add(t)); 

    setFocusNodeIds([groupId, ...newNodes.map(n => n.id)]);
    setIsRenderQueueOpen(true);
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

      const batchId = `batch-gallery-${Date.now()}`;
      const batchLabel = `Gallery Batch: ${prompt.substring(0, 20)}...`;

      const newNodes: FlowNode[] = [];
      const tasks: RenderTask[] = [];

      for (let i = 0; i < count; i++) {
          const childX = startX + padding + (i * (nodeWidth + gap));
          const childY = startY + 60;
          const nodeId = `gal-gen-${Date.now()}-${i}`;

          newNodes.push({
              id: nodeId,
              type: model.includes('veo') || model.includes('luma') ? NodeType.AI_VIDEO_GEN : NodeType.AI_IMAGE_GEN,
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
                  duration: (model.includes('veo') || model.includes('luma')) ? '5' : undefined,
                  withAudio: false
              }
          });

          tasks.push({
              id: `task-${Date.now()}-${i}`,
              type: (model.includes('veo') || model.includes('luma')) ? 'video' : 'image',
              prompt: prompt,
              assetId: currentAssetId || 'root', 
              status: 'pending',
              config: {
                  model,
                  aspectRatio,
                  targetNodeId: nodeId
              },
              batchId,
              batchLabel
          });
      }
      
      setProjects(prev => prev.map(p => {
        if (p.id === currentProjectId) {
             return { ...p, nodes: [...p.nodes, groupNode, ...newNodes] };
        }
        return p;
      }));
      
      tasks.forEach(t => queueService.add(t));

      setFocusNodeIds([groupId, ...newNodes.map(n => n.id)]);
      setIsRenderQueueOpen(true);
  }

  const handleGenerateVideoFromNode = (node: FlowNode, model: string) => {
      if (!currentProjectId || !activeProject) return;
      if (!node.data.imageUrl && !node.data.videoUrl) return;

      const targetModel = model || MODELS.VIDEO_LUMA; // Default to Luma
      const batchId = `batch-video-${Date.now()}`;
      const batchLabel = `Video from: ${node.data.prompt?.substring(0,20) || 'Image'}`;
      const nodeId = `gen-node-${Date.now()}`;
      
      const newVideoNode: FlowNode = {
          id: nodeId,
          type: NodeType.AI_VIDEO_GEN,
          department: currentDept,
          assetId: node.assetId,
          parentId: node.parentId, 
          position: { x: node.position.x + 50, y: node.position.y + 50 },
          width: 300,
          height: 400,
          data: {
              imageUrl: node.data.imageUrl, 
              prompt: node.data.prompt || "Video from image",
              status: 'generating',
              model: targetModel,
              aspectRatio: node.data.aspectRatio || '16:9'
          }
      };

      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              return { ...p, nodes: [...p.nodes, newVideoNode] };
          }
          return p;
      }));

      queueService.add({
          id: `task-vid-${Date.now()}`,
          type: 'video',
          prompt: node.data.prompt || "Video",
          assetId: node.assetId || 'root',
          status: 'pending',
          startImage: node.data.imageUrl, 
          config: {
              model: targetModel,
              aspectRatio: node.data.aspectRatio,
              targetNodeId: nodeId
          },
          batchId,
          batchLabel
      });
      setIsRenderQueueOpen(true);
  }

  const handleGenerateVideoForClip = (clipId: string, sourceNodeId: string, replace: boolean, model: string) => {
      if (!currentProjectId || !activeProject) return;
      
      const sourceNode = activeProject.nodes.find(n => n.id === sourceNodeId);
      if (!sourceNode || (!sourceNode.data.imageUrl && !sourceNode.data.videoUrl)) return;

      const targetModel = model || MODELS.VIDEO_LUMA; 
      const batchId = `batch-clip-vid-${Date.now()}`;
      const batchLabel = `Timeline Video: ${sourceNode.data.prompt?.substring(0, 20) || 'Clip'}`;

      queueService.add({
          id: `task-clip-vid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'video',
          prompt: sourceNode.data.prompt || "Timeline Video",
          assetId: sourceNode.assetId || 'root',
          status: 'pending',
          startImage: sourceNode.data.imageUrl,
          config: {
              model: targetModel,
              aspectRatio: sourceNode.data.aspectRatio || '16:9',
              replaceClipId: replace ? clipId : undefined 
          },
          batchId,
          batchLabel
      });
      setIsRenderQueueOpen(true);
  }

  const handleOneShotBreakdown = async () => {
      if (!activeProject) return;
      setOneShotItems([]);
      setIsOneShotModalOpen(true);
      setIsAnalyzing(true);

      try {
          const scriptNodes = activeProject.nodes.filter(n => 
              n.department === DepartmentType.WRITERS_ROOM && 
              n.type === NodeType.AI_TEXT_GEN && 
              n.data.status === 'approved' && 
              n.data.text
          );
          const fullText = scriptNodes.map(n => n.data.text).join('\n\n');
          
          if (!fullText) {
              alert("No approved scripts found to analyze. Please mark a script as 'Approved' in the Writers Room.");
              setIsOneShotModalOpen(false);
              return;
          }

          const rawData = await extractOneShotBreakdown(fullText);
          const newItems: OneShotItem[] = [];
          
          rawData.characters.forEach((c: any) => newItems.push({ 
              id: `char-${Math.random()}`, type: 'Character', name: c.name, description: c.description, summary: c.summary, selected: true, autoGenerate: true, autoApprove: false 
          }));
          rawData.locations.forEach((l: any) => newItems.push({ 
              id: `loc-${Math.random()}`, type: 'Location', name: l.name, description: l.description, selected: true, autoGenerate: true, autoApprove: false 
          }));
          rawData.scenes.forEach((s: any) => {
              const sceneId = `scene-${Math.random()}`;
              const shots: OneShotItem[] = s.shots?.map((shot: any) => ({
                  id: `shot-${Math.random()}`, type: 'Shot', name: shot.title, description: shot.description, parentId: sceneId, selected: true, autoGenerate: false, autoApprove: false
              })) || [];
              
              newItems.push({
                  id: sceneId, type: 'Scene', name: s.title, description: s.description, selected: true, autoGenerate: false, autoApprove: false, children: shots
              });
          });

          const existingMap = new Set(activeProject.assets.map(a => a.title.toLowerCase()));
          newItems.forEach(item => {
              if (existingMap.has(item.name.toLowerCase())) {
                  item.selected = false;
                  item.isExisting = true;
                  item.autoGenerate = false; 
              }
          });

          setOneShotItems(newItems);
      } catch(e) {
          console.error("One Shot Error", e);
      } finally {
          setIsAnalyzing(false);
      }
  }

  const handleExecuteOneShot = async (config: { count: number, autoAssemble: boolean }) => {
      if (!currentProjectIdRef.current) return;
      setIsOneShotModalOpen(false);

      const itemsToProcess = oneShotItems.filter(i => i.selected);
      const newAssets: ProjectAsset[] = [];
      const primaryTasks: RenderTask[] = []; 
      const secondaryTasks: RenderTask[] = []; 

      const charBatchId = `batch-char-${Date.now()}`;
      const shotBatchId = `batch-shot-${Date.now()}`;

      const processItem = (item: OneShotItem, parentAssetId?: string) => {
          const dept = item.type === 'Character' ? DepartmentType.CASTING_WARDROBE : 
                       item.type === 'Location' ? DepartmentType.SET_DESIGN :
                       (item.type === 'Scene' || item.type === 'Shot') ? DepartmentType.STORY : DepartmentType.PRODUCTION;
          
          let assetId = `asset-${Date.now()}-${Math.random().toString(36).substr(2,9)}`;
          
          if (item.isExisting) {
               const existingAsset = projectsRef.current
                  .find(p => p.id === currentProjectIdRef.current)?.assets
                  .find(a => a.title.toLowerCase() === item.name.toLowerCase());
                
               if (existingAsset) {
                   assetId = existingAsset.id;
               } 
          } else {
               const asset: ProjectAsset = {
                  id: assetId,
                  department: dept,
                  title: item.name,
                  description: item.description,
                  visualStyle: item.type === 'Character' ? 'Cinematic' : 'Wide Shot',
                  summary: item.summary || 'Auto-detected', 
                  parentId: parentAssetId,
                  status: 'active'
              };
              
              if (item.type === 'Scene') {
                  asset.timelineData = { clips: [], duration: 0 };
              }
    
              newAssets.push(asset);
          }

          if (item.autoGenerate) {
              let prompt = `@${item.name}`;
              if (item.type === 'Shot' && parentAssetId) {
                  const parentItem = oneShotItems.find(p => p.children?.some(c => c.id === item.id)); 
                  if (parentItem) prompt = `@${parentItem.name}.${item.name}`;
              }

              for (let i = 0; i < config.count; i++) {
                  const task: RenderTask = {
                      id: `task-${Date.now()}-${i}-${Math.random()}`,
                      type: 'image',
                      prompt: prompt,
                      assetId: assetId,
                      status: 'pending',
                      config: {
                          count: config.count,
                          autoApprove: item.autoApprove, 
                          autoAssemble: config.autoAssemble,
                          sequenceId: parentAssetId,
                          model: item.model || MODELS.IMAGE_GEN
                      }
                  };
                  
                  if (item.type === 'Character') {
                      task.batchId = charBatchId;
                      task.batchLabel = "One Shot: Cast Generation";
                      task.status = 'pending';
                      primaryTasks.push(task);
                  } else {
                      task.batchId = shotBatchId;
                      task.batchLabel = "One Shot: Shot Production";
                      task.status = 'waiting'; 
                      task.waitingOnBatchId = charBatchId;
                      secondaryTasks.push(task);
                  }
              }
          }

          if (item.children) {
              item.children.filter(c => c.selected).forEach(child => processItem(child, assetId));
          }
      };

      itemsToProcess.forEach(item => processItem(item));

      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectIdRef.current) {
              return { ...p, assets: [...p.assets, ...newAssets] };
          }
          return p;
      }));

      if (primaryTasks.length > 0) {
          primaryTasks.forEach(t => queueService.add(t));
          secondaryTasks.forEach(t => queueService.add(t)); 
      } else {
          secondaryTasks.forEach(t => {
              t.status = 'pending'; 
              t.waitingOnBatchId = undefined;
              queueService.add(t);
          });
      }
      
      if (primaryTasks.length > 0 || secondaryTasks.length > 0) {
          setIsRenderQueueOpen(true); 
      }
  }

  const handleNodesChange = useCallback((value: React.SetStateAction<FlowNode[]>) => {
      if (!currentProjectId) return;
      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              const newNodes = typeof value === 'function' ? value(p.nodes) : value;
              return { ...p, nodes: newNodes };
          }
          return p;
      }));
  }, [currentProjectId]);

  const handleConnectionsChange = useCallback((value: React.SetStateAction<FlowConnection[]>) => {
      if (!currentProjectId) return;
      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              const newConnections = typeof value === 'function' ? value(p.connections) : value;
              return { ...p, connections: newConnections };
          }
          return p;
      }));
  }, [currentProjectId]);

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
    if (currentDept === DepartmentType.CASTING_WARDROBE) setAnalysisType('Characters');
    else if (currentDept === DepartmentType.SET_DESIGN) setAnalysisType('Locations');
    else if (currentDept === DepartmentType.STORY) setAnalysisType('Story');
    else return;

    setDetectedItems([]);
    setIsAnalyzeModalOpen(true);
  };

  const handleRunAnalysis = async () => {
    if (!activeProject) return;
    setIsAnalyzing(true);
    try {
        const scriptNodes = activeProject.nodes.filter(n => n.department === DepartmentType.WRITERS_ROOM && (n.type === NodeType.AI_TEXT_GEN || n.type === NodeType.TEXT_INPUT) && n.data.text);
        const fullText = scriptNodes.map(n => n.data.text).join('\n\n');
        
        if (!fullText) {
             alert("No scripts found in Writers Room to analyze.");
             setIsAnalyzeModalOpen(false);
             return;
        }

        let results: any[] = [];
        if (analysisType === 'Characters') {
            results = await extractCharactersFromScript(fullText);
        } else if (analysisType === 'Locations') {
            results = await extractLocationsFromScript(fullText);
        } else if (analysisType === 'Story') {
            const knownChars = activeProject.assets.filter(a => a.department === DepartmentType.CASTING_WARDROBE).map(a => a.title);
            results = await extractStoryElementsFromScript(fullText, knownChars, autoFindShots);
        }
        
        const items: DetectedItem[] = results.map((r: any) => ({
             name: r.name || r.title,
             description: r.description,
             summary: r.summary, 
             type: r.type || r.role || analysisType, 
             selected: true,
             children: r.shots ? r.shots.map((s:any) => ({
                 name: s.title, description: s.description, type: 'Shot', selected: true
             })) : undefined
        }));

        const existingTitles = new Set(activeProject.assets.map(a => a.title.toLowerCase()));
        items.forEach(i => {
            if (existingTitles.has(i.name.toLowerCase())) {
                i.isDuplicate = true;
                i.selected = false;
            }
        });

        setDetectedItems(items);
    } catch (e) {
        console.error(e);
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleApproveAnalysis = () => {
    if (!currentProjectId) return;
    
    const newAssets: ProjectAsset[] = [];
    detectedItems.filter(i => i.selected).forEach(item => {
        const assetId = `asset-${Date.now()}-${Math.random().toString(36).substr(2,9)}`;
        const asset: ProjectAsset = {
            id: assetId,
            department: currentDept,
            title: item.name,
            description: item.description,
            visualStyle: 'Cinematic',
            summary: item.summary || 'Auto-detected', 
            status: 'active'
        };
        newAssets.push(asset);

        if (item.children) {
            item.children.filter(c => c.selected).forEach(child => {
                newAssets.push({
                    id: `asset-${Date.now()}-${Math.random()}`,
                    department: DepartmentType.PRODUCTION,
                    title: child.name,
                    description: child.description,
                    parentId: assetId,
                    visualStyle: 'Shot',
                    summary: 'Auto-detected shot',
                    status: 'active'
                });
            });
        }
    });

    setProjects(prev => prev.map(p => {
        if (p.id === currentProjectId) {
            return { ...p, assets: [...p.assets, ...newAssets] };
        }
        return p;
    }));
    setIsAnalyzeModalOpen(false);
  };

  const handleDiscoverShots = async (assetId: string) => {
    if (!activeProject) return;
    const asset = activeProject.assets.find(a => a.id === assetId);
    if (!asset) return;

    const storyNode = activeProject.nodes.find(n => n.assetId === assetId && n.data.text);
    const textToAnalyze = storyNode ? storyNode.data.text : asset.description;

    if (!textToAnalyze) return;
    
    const knownChars = activeProject.assets.filter(a => a.department === DepartmentType.CASTING_WARDROBE).map(a => a.title);
    
    try {
        const shots = await extractShotsFromScene(textToAnalyze, knownChars);
        const newAssets = shots.map(s => ({
            id: `shot-${Date.now()}-${Math.random()}`,
            department: DepartmentType.PRODUCTION,
            title: s.title,
            description: s.description,
            parentId: assetId,
            visualStyle: 'Cinematic Shot',
            summary: 'Auto-discovered shot',
            status: 'active' as const
        }));

        setProjects(prev => prev.map(p => {
            if (p.id === currentProjectId) {
                return { ...p, assets: [...p.assets, ...newAssets] };
            }
            return p;
        }));
    } catch (e) {
        console.error("Shot discovery failed", e);
    }
  };

  const handleRefineConcept = (assetId: string, sourceImageUrl?: string) => {
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

      const batchId = `batch-refine-${Date.now()}`;
      const batchLabel = `Refinement: ${asset.title}`;

      const newNodes: FlowNode[] = [];
      const tasks: RenderTask[] = [];

      prompts.forEach((p, i) => {
          const col = i % columns;
          const row = Math.floor(i / columns);
          const childX = startX + padding + (col * (nodeWidth + gap));
          const childY = startY + 60 + (row * (nodeHeight + gap));
          const nodeId = `ref-gen-${Date.now()}-${i}`;

          newNodes.push({
              id: nodeId,
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
                  model: MODELS.IMAGE_GEN, 
                  status: 'generating',
                  tag: 'refinement', 
                  referenceImageUrl: sourceImageUrl 
              }
          });

          tasks.push({
              id: `task-${Date.now()}-${i}`,
              type: 'image',
              prompt: p,
              assetId: assetId,
              status: 'pending',
              config: {
                  model: MODELS.IMAGE_GEN,
                  aspectRatio: "1:1",
                  targetNodeId: nodeId
              },
              batchId,
              batchLabel
          });
      });

      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              return { ...p, nodes: [...p.nodes, groupNode, ...newNodes] };
          }
          return p;
      }));
      
      tasks.forEach(t => queueService.add(t));

      setFocusNodeIds([groupId]);
      setIsRenderQueueOpen(true);
  }

  const handleGenerateOutline = () => {
    if (!currentProjectId || !activeAsset) return;

    const newNode: FlowNode = {
        id: `outline-${Date.now()}`,
        type: NodeType.AI_TEXT_GEN,
        department: DepartmentType.WRITERS_ROOM,
        assetId: activeAsset.id,
        position: { x: 100, y: 100 },
        data: {
            prompt: `Write a detailed outline for @${activeAsset.title}.`,
            status: 'draft'
        }
    };

    setProjects(prev => prev.map(p => {
        if (p.id === currentProjectId) {
            return { ...p, nodes: [...p.nodes, newNode] };
        }
        return p;
    }));
  };

  const handleGalleryTurntable = (node: FlowNode) => {
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
      const nodeId = `vid-turntable-${Date.now()}`;

      const newNode: FlowNode = {
           id: nodeId,
           type: NodeType.AI_VIDEO_GEN,
           department: currentDept,
           assetId: node.assetId,
           parentId: node.parentId,
           position: pos,
           width: width,
           height: height,
           data: {
               prompt: `A smooth 360 degree 3D turntable of a static model, seamless loop, high quality render`,
               imageUrl: node.data.imageUrl, 
               lastFrameImageUrl: supportsLastFrame ? node.data.imageUrl : undefined,
               model: model,
               aspectRatio: '16:9',
               status: 'generating', 
               duration: '5',
               withAudio: false
           }
      };

      setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              return { ...p, nodes: [...p.nodes, newNode] };
          }
          return p;
      }));

      queueService.add({
          id: `task-turntable-${Date.now()}`,
          type: 'video',
          prompt: `A smooth 360 degree 3D turntable of a static model, seamless loop, high quality render`,
          assetId: node.assetId || 'root',
          status: 'pending',
          startImage: node.data.imageUrl,
          config: {
              model: model,
              aspectRatio: '16:9',
              targetNodeId: nodeId
          }
      });

      setFocusNodeIds([newNode.id]);
      setIsRenderQueueOpen(true);
  }

  const handleGalleryExpressions = (node: FlowNode) => {
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
       const tasks: RenderTask[] = [];
       const batchId = `batch-expr-${Date.now()}`;
       const batchLabel = `Expressions: ${activeAsset?.title || 'Character'}`;

       emotions.forEach((emo, idx) => {
           const col = idx % columns;
           const row = Math.floor(idx / columns);
           const childX = 100 + padding + (col * (nodeW + gap));
           const childY = startY + 60 + (row * (nodeH + gap));
           const nodeId = `vid-expr-${Date.now()}-${idx}`;

           newNodes.push({
               id: nodeId,
               type: NodeType.AI_VIDEO_GEN,
               department: currentDept,
               assetId: node.assetId,
               parentId: groupId, 
               position: { x: childX, y: childY },
               width: nodeW,
               height: nodeH,
               data: {
                   prompt: `@${activeAsset?.title || 'Character'}, ${emo.prompt}, neutral background, high quality`,
                   imageUrl: node.data.imageUrl,
                   model: targetModel,
                   aspectRatio: '16:9',
                   status: 'generating',
                   duration: '5', 
                   withAudio: false
               }
           });

           tasks.push({
                id: `task-${Date.now()}-${idx}`,
                type: 'video',
                prompt: `@${activeAsset?.title || 'Character'}, ${emo.prompt}, neutral background, high quality`,
                assetId: node.assetId || 'root',
                status: 'pending',
                config: { 
                    model: targetModel, 
                    aspectRatio: '16:9',
                    targetNodeId: nodeId
                },
                batchId,
                batchLabel
           });
       });
       
       setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
              return { ...p, nodes: [...p.nodes, groupNode, ...newNodes] };
          }
          return p;
      }));
       
       tasks.forEach(t => queueService.add(t));

       setFocusNodeIds([groupId]);
       setIsRenderQueueOpen(true);
  }

  const handleRemoveRef = (imageUrl: string) => {
      if (!currentProjectId || !activeProject) return;
      const node = activeProject.nodes.find(n => n.data.imageUrl === imageUrl);
      if (node) {
          handleUpdateNode(node.id, { tag: undefined });
      }
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (view === 'dashboard') {
    return (
      <div className="w-full h-full bg-background flex flex-col font-sans animate-in fade-in duration-700 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/5 rounded-full blur-[160px] animate-pulse pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/5 rounded-full blur-[160px] animate-pulse delay-1000 pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />

        <header className="flex items-center justify-between p-6 px-8 border-b border-white/5 bg-zinc-950/40 backdrop-blur-md relative z-10">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                    <Sparkles className="text-white" size={20} />
                </div>
                <h1 className="text-2xl font-black tracking-tight text-white">
                    Showrunner<span className="text-blue-500">AI</span>
                </h1>
            </div>
            
            <div className="flex items-center gap-4">
                 {isDriveConnected ? (
                     <div className={`flex items-center gap-2 px-4 py-2 rounded-full border shadow-sm transition-all ${isMockDrive ? 'bg-yellow-900/10 border-yellow-700/30 text-yellow-500' : 'bg-green-900/10 border-green-700/30 text-green-500'}`}>
                         {isMockDrive ? <CloudOff size={16}/> : <Cloud size={16}/>}
                         <span className="text-xs font-bold uppercase tracking-wider">{isMockDrive ? "Offline Mode" : "Drive Synced"}</span>
                     </div>
                 ) : (
                     <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={handleForceOffline} className="text-zinc-400">
                             Go Offline
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handleConnectDrive} icon={Cloud} className="bg-zinc-800/50">
                             Connect Drive
                        </Button>
                     </div>
                 )}
            </div>
        </header>
        
        <main className="flex-1 p-8 px-12 overflow-y-auto relative z-10 custom-scrollbar">
             <div className="max-w-7xl mx-auto mb-12">
                 <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                    <div>
                        <h2 className="text-4xl font-black text-white mb-2 tracking-tight">Welcome Back.</h2>
                        <p className="text-zinc-500 text-lg max-w-xl leading-relaxed">
                            Your creative studio is ready. Pick up where you left off or start a new cinematic journey.
                        </p>
                    </div>
                    <Button 
                        onClick={() => setIsCreateProjectOpen(true)} 
                        size="lg"
                        className="bg-blue-600 hover:bg-blue-500 shadow-2xl shadow-blue-600/30 h-14 px-8 text-base font-bold transition-all active:scale-[0.98]"
                        icon={Plus}
                    >
                        Create New Story
                    </Button>
                 </div>

                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
                    {[
                        { label: 'Total Projects', value: projects.length, icon: Layers, color: 'text-blue-400' },
                        { label: 'Total Assets', value: projects.reduce((acc, p) => acc + p.assets.length, 0), icon: Zap, color: 'text-yellow-400' },
                        { label: 'Active Renders', value: renderQueue.filter(t => t.status === 'processing' || t.status === 'pending').length, icon: Film, color: 'text-purple-400' },
                        { label: 'Stories Told', value: projects.filter(p => p.type === 'Feature').length, icon: Star, color: 'text-green-400' },
                    ].map((stat, i) => (
                        <div key={i} className="bg-surface/40 backdrop-blur-sm border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center text-center group hover:bg-surface/60 transition-colors">
                            <stat.icon className={`${stat.color} mb-3`} size={20} />
                            <div className="text-2xl font-black text-white">{stat.value}</div>
                            <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mt-1">{stat.label}</div>
                        </div>
                    ))}
                 </div>
                 
                 <div className="flex items-center justify-between mb-8">
                     <h3 className="text-sm font-black text-zinc-500 uppercase tracking-[0.2em]">Recent Productions</h3>
                     <div className="h-[1px] flex-1 bg-white/5 mx-6" />
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                     {projects.map(project => (
                         <div 
                            key={project.id}
                            onClick={() => { setCurrentProjectId(project.id); setView('project'); }}
                            className="bg-zinc-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-6 hover:border-blue-500/50 transition-all cursor-pointer group hover:shadow-2xl hover:shadow-blue-500/10 relative overflow-hidden"
                         >
                             <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-blue-600/10 transition-colors" />
                             
                             <div className="flex justify-between items-start mb-6 relative z-10">
                                 <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-900/40 to-purple-900/40 border border-white/10 flex items-center justify-center text-white font-black text-xl group-hover:scale-110 transition-transform">
                                     {project.title.substring(0, 2).toUpperCase()}
                                 </div>
                                 <div className="flex flex-col items-end gap-2">
                                     <span className="text-[10px] font-black uppercase tracking-widest bg-zinc-800 text-zinc-400 px-3 py-1 rounded-full border border-white/5">
                                         {project.type}
                                     </span>
                                     {project.driveDbId && !isMockDrive && (
                                         <div className="text-green-500" title="Synced to Cloud">
                                             <Cloud size={14} />
                                         </div>
                                     )}
                                 </div>
                             </div>

                             <h3 className="font-bold text-xl text-white mb-3 group-hover:text-blue-400 transition-colors line-clamp-1">{project.title}</h3>
                             <p className="text-sm text-zinc-500 line-clamp-2 leading-relaxed mb-6 h-10">{project.summary || "No description provided."}</p>
                             
                             <div className="mt-auto pt-6 border-t border-white/5 flex justify-between items-center text-[10px] font-bold text-zinc-600 uppercase tracking-wider relative z-10">
                                 <div className="flex items-center gap-4">
                                     <span className="flex items-center gap-1.5"><Layout size={12}/> {project.assets.length}</span>
                                     <span className="flex items-center gap-1.5"><Clock size={12}/> {project.updatedAt.toLocaleDateString()}</span>
                                 </div>
                                 <ArrowRight size={16} className="text-zinc-700 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                             </div>
                         </div>
                     ))}
                     
                     {projects.length === 0 && (
                         <div 
                             onClick={() => setIsCreateProjectOpen(true)}
                             className="border-2 border-dashed border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:border-blue-500/50 hover:bg-blue-500/5 transition-all cursor-pointer group"
                         >
                             <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                 <Plus className="text-zinc-600 group-hover:text-blue-400" size={32} />
                             </div>
                             <h4 className="text-lg font-bold text-zinc-400 mb-1 group-hover:text-white">Start Your First Project</h4>
                             <p className="text-sm text-zinc-600">Bring your vision to life today.</p>
                         </div>
                     )}
                 </div>
             </div>
        </main>

        {isCreateProjectOpen && (
             <Modal title="Create New Project" onClose={resetProjectModal}>
                 <div className="space-y-6">
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
                                        value={projectSeedPrompt} 
                                        onChange={(e) => setProjectSeedPrompt(e.target.value)} 
                                        placeholder='e.g. "A cyberpunk detective story in Neo Tokyo"'
                                    />
                                    <Button onClick={handleRollDice} disabled={isGeneratingSeeds} icon={Dice5}>
                                        {isGeneratingSeeds ? '...' : 'Roll'}
                                    </Button>
                                </div>
                            </div>
                            
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
        <Sidebar 
            currentDept={currentDept} 
            onChangeDept={(d) => { setCurrentDept(d); setCurrentAssetId(null); setFocusNodeIds([]); }}
            onBack={() => setView('dashboard')}
            onOpenSettings={() => setIsSettingsOpen(true)}
        />
        
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
            onOneShotDiscovery={handleOneShotBreakdown}
        />

        <div className="flex-1 flex flex-col relative min-w-0">
             <div className="h-14 border-b border-border bg-surface flex items-center justify-between px-6 shrink-0 z-20">
                 <div className="flex items-center gap-4 min-w-0 flex-1">
                     <h2 className="font-bold text-zinc-100 truncate shrink-0">{activeAsset ? activeAsset.title : "General"}</h2>
                     {activeAsset && (
                         <span className="text-xs text-zinc-500 bg-zinc-900 px-2 py-1 rounded border border-zinc-800 truncate min-w-0 flex-1" title={activeAsset.summary}>
                             {activeAsset.summary || "No summary"}
                         </span>
                     )}
                 </div>
                 
                 <div className="flex items-center gap-3 shrink-0 ml-4">
                     {renderQueue.length > 0 && (
                         <button 
                            onClick={() => setIsRenderQueueOpen(!isRenderQueueOpen)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-bold text-zinc-300 transition-colors"
                         >
                             <Layers size={14} className={renderQueue.some(t => t.status === 'processing') ? "animate-pulse text-blue-400" : ""}/>
                             Queue ({renderQueue.filter(t => t.status === 'pending' || t.status === 'processing').length})
                             {queuePaused && <span className="text-[9px] bg-yellow-900/50 text-yellow-500 px-1 rounded">PAUSED</span>}
                         </button>
                     )}

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

             <div className="flex-1 relative bg-black overflow-hidden">
                 {currentDept === DepartmentType.EDITORIAL ? (
                     editorialState.sequence ? (
                         <EditorTimeline 
                             sequenceAsset={editorialState.sequence}
                             filterAssetId={editorialState.filterId}
                             projectAssets={activeProject?.assets || []}
                             projectNodes={activeProject?.nodes || []}
                             onUpdateAsset={handleUpdateAsset}
                             onUpdateNode={handleUpdateNode}
                             onGenerateVideoForClip={handleGenerateVideoForClip} 
                         />
                     ) : (
                         <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
                             <Scissors size={48} className="opacity-20" />
                             <p>Select a Sequence (created in Story) to start editing.</p>
                         </div>
                     )
                 ) : (
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
                            approvedImagesMap={approvedImagesMap} 
                            projectSettings={activeProject?.settings}
                            onGenerateVideo={handleGenerateVideoFromNode} 
                            assetThumbnails={assetThumbnails}
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
                 
                 {currentDept !== DepartmentType.EDITORIAL && <ChatBot scriptContext={scriptContext} />}
             </div>
        </div>

        {isRenderQueueOpen && (
            <RenderQueuePanel 
                queue={renderQueue} 
                assets={activeProject?.assets || []}
                onClose={() => setIsRenderQueueOpen(false)}
                onPauseQueue={queueService.pause}
                onResumeQueue={queueService.resume}
                onStopTask={queueService.stopTask}
                isPaused={queuePaused}
            />
        )}

        {!isRenderQueueOpen && renderQueue.some(t => t.status === 'processing') && (
            <QueueIndicator queue={renderQueue} />
        )}

        {isSettingsOpen && activeProject && (
            <SettingsModal 
                settings={activeProject.settings || DEFAULT_PROJECT_SETTINGS}
                onSave={handleUpdateProjectSettings}
                onClose={() => setIsSettingsOpen(false)}
            />
        )}

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
                    <div className="flex-1 flex justify-end gap-2 pt-4">
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
                     <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {detectedItems.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-4">
                                <p>Analyze scripts in the Writers Room to automatically detect {analysisType}.</p>
                                <Button onClick={handleRunAnalysis} disabled={isAnalyzing}>
                                    {isAnalyzing ? "Analyzing..." : "Start Analysis"}
                                </Button>
                            </div>
                        ) : (
                            <div>
                                <div className="flex items-center justify-between mb-2 px-2">
                                    <span className="text-xs font-bold text-zinc-500 uppercase">{detectedItems.length} Items Detected</span>
                                </div>
                                {detectedItems.map((item, idx) => (
                                    <div key={idx} className={`flex items-start gap-3 p-3 rounded border ${item.isDuplicate ? 'bg-yellow-900/10 border-yellow-900/30' : 'bg-zinc-900 border-zinc-800'}`}>
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
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-sm text-zinc-200">{item.name}</span>
                                                {item.isDuplicate && <span className="text-[9px] bg-yellow-900 text-yellow-500 px-1.5 rounded">Existing</span>}
                                            </div>
                                            <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{item.description}</p>
                                            {item.children && (
                                                <div className="mt-2 pl-2 border-l border-zinc-700">
                                                    <span className="text-[10px] text-zinc-500">{item.children.length} Shots Detected</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                     </div>
                     <div className="p-4 border-t border-zinc-800 flex justify-end gap-2 bg-zinc-900">
                         <Button variant="ghost" onClick={() => setIsAnalyzeModalOpen(false)}>Cancel</Button>
                         <Button onClick={handleApproveAnalysis} disabled={detectedItems.filter(i => i.selected).length === 0}>
                             Import Selected
                         </Button>
                     </div>
                 </div>
             </Modal>
        )}

        {isOneShotModalOpen && (
            <OneShotModal 
                items={oneShotItems} 
                setItems={setOneShotItems} 
                onClose={() => setIsOneShotModalOpen(false)}
                onExecute={handleExecuteOneShot}
                onDiscover={handleOneShotBreakdown}
                isLoading={isAnalyzing}
            />
        )}
        
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
                projectSettings={activeProject?.settings} 
                onRemoveRef={handleRemoveRef} 
            />
        )}
        
    </div>
  );
};

export default App;
