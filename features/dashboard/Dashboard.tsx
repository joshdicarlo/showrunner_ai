/**
 * Dashboard.tsx
 * 
 * The main landing page showing:
 * - Project overview cards
 * - Statistics
 * - Create new project button
 * - Drive connection status
 */

import React, { useState, useMemo } from 'react';
import { 
    Sparkles, Cloud, CloudOff, Plus, Layers, Zap, Film, Star, 
    Layout, Clock, ArrowRight, Dice5, Loader2 
} from 'lucide-react';
import { Project, StorySeed, ProjectSettings } from '../../types';
import { Button, Input, Modal } from '../../components/UI';
import { generateStorySeeds } from '../../services/geminiService';
import { DEFAULT_PROJECT_SETTINGS } from '../../constants';

// ============================================================================
// Types
// ============================================================================

interface DashboardProps {
    // Data
    projects: Project[];
    
    // Drive status
    isDriveConnected: boolean;
    isMockDrive: boolean;
    
    // Handlers
    onSelectProject: (projectId: string) => void;
    onCreateProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => void;
    onConnectDrive: () => void;
    onForceOffline: () => void;
}

// ============================================================================
// Component
// ============================================================================

const Dashboard: React.FC<DashboardProps> = ({
    projects,
    isDriveConnected,
    isMockDrive,
    onSelectProject,
    onCreateProject,
    onConnectDrive,
    onForceOffline,
}) => {
    // Modal state
    const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
    const [creationMode, setCreationMode] = useState<'blank' | 'seed'>('blank');
    
    // Blank project state
    const [newProjectTitle, setNewProjectTitle] = useState('');
    
    // Seed project state
    const [projectSeedPrompt, setProjectSeedPrompt] = useState('');
    const [generatedSeeds, setGeneratedSeeds] = useState<StorySeed[]>([]);
    const [selectedSeedIdx, setSelectedSeedIdx] = useState<number | null>(null);
    const [isGeneratingSeeds, setIsGeneratingSeeds] = useState(false);
    const [autoGenAssets, setAutoGenAssets] = useState(true);
    
    // Stats
    const stats = useMemo(() => [
        { label: 'Total Projects', value: projects.length, icon: Layers, color: 'text-blue-400' },
        { label: 'Total Assets', value: projects.reduce((acc, p) => acc + p.assets.length, 0), icon: Zap, color: 'text-yellow-400' },
        { label: 'Active Renders', value: 0, icon: Film, color: 'text-purple-400' }, // TODO: Get from queue
        { label: 'Stories Told', value: projects.filter(p => p.type === 'Feature').length, icon: Star, color: 'text-green-400' },
    ], [projects]);
    
    // Reset modal state
    const resetProjectModal = () => {
        setIsCreateProjectOpen(false);
        setNewProjectTitle('');
        setProjectSeedPrompt('');
        setGeneratedSeeds([]);
        setSelectedSeedIdx(null);
        setCreationMode('blank');
        setAutoGenAssets(true);
    };
    
    // Handle seed generation
    const handleRollDice = async () => {
        if (!projectSeedPrompt.trim()) return;
        setIsGeneratingSeeds(true);
        try {
            const seeds = await generateStorySeeds(projectSeedPrompt);
            setGeneratedSeeds(seeds);
            setSelectedSeedIdx(null);
        } catch (e) {
            console.error("Failed to generate seeds:", e);
        } finally {
            setIsGeneratingSeeds(false);
        }
    };
    
    // Handle project creation
    const handleCreateProject = async () => {
        let title = '';
        let summary = '';
        let type = 'Short';
        
        if (creationMode === 'blank') {
            title = newProjectTitle;
        } else if (selectedSeedIdx !== null && generatedSeeds[selectedSeedIdx]) {
            const seed = generatedSeeds[selectedSeedIdx];
            title = seed.title;
            summary = seed.logline;
            type = seed.genre.includes('Feature') ? 'Feature' : 'Short';
        }
        
        if (!title) return;
        
        const newProject: Omit<Project, 'id' | 'updatedAt'> = {
            title,
            type: type as any,
            summary,
            assets: [],
            nodes: [],
            connections: [],
            settings: DEFAULT_PROJECT_SETTINGS,
        };
        
        onCreateProject(newProject);
        resetProjectModal();
        
        // TODO: If autoGenAssets, generate script and beat sheet
    };
    
    return (
        <div className="w-full h-full bg-background flex flex-col font-sans animate-in fade-in duration-700 relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/5 rounded-full blur-[160px] animate-pulse pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/5 rounded-full blur-[160px] animate-pulse delay-1000 pointer-events-none" />
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />

            {/* Header */}
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
                            <Button variant="ghost" size="sm" onClick={onForceOffline} className="text-zinc-400">
                                Go Offline
                            </Button>
                            <Button variant="secondary" size="sm" onClick={onConnectDrive} icon={Cloud} className="bg-zinc-800/50">
                                Connect Drive
                            </Button>
                        </div>
                    )}
                </div>
            </header>
            
            {/* Main content */}
            <main className="flex-1 p-8 px-12 overflow-y-auto relative z-10 custom-scrollbar">
                <div className="max-w-7xl mx-auto mb-12">
                    {/* Welcome section */}
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

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
                        {stats.map((stat, i) => (
                            <div key={i} className="bg-surface/40 backdrop-blur-sm border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center text-center group hover:bg-surface/60 transition-colors">
                                <stat.icon className={`${stat.color} mb-3`} size={20} />
                                <div className="text-2xl font-black text-white">{stat.value}</div>
                                <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mt-1">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                    
                    {/* Recent projects header */}
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-sm font-black text-zinc-500 uppercase tracking-[0.2em]">Recent Productions</h3>
                        <div className="h-[1px] flex-1 bg-white/5 mx-6" />
                    </div>
                    
                    {/* Projects grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                        {projects.map(project => (
                            <div 
                                key={project.id}
                                onClick={() => onSelectProject(project.id)}
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
                        
                        {/* Empty state */}
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

            {/* Create Project Modal */}
            {isCreateProjectOpen && (
                <Modal title="Create New Project" onClose={resetProjectModal}>
                    <div className="space-y-6">
                        {/* Mode toggle */}
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
};

export default Dashboard;
