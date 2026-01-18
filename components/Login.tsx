
import React, { useState, useEffect } from 'react';
import { LogIn, Sparkles, CloudOff, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from './UI';
import { useStorage } from '../services/storage';

interface LoginProps {
    onLoginSuccess: (isMock: boolean) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const [isLoading, setIsLoading] = useState(true); // Start loading for session restore
    const [error, setError] = useState<string | null>(null);
    
    const storage = useStorage();

    // Try to restore session on mount
    useEffect(() => {
        const tryRestoreSession = async () => {
            try {
                await storage.initialize('google-drive');
                const restored = await storage.restoreSession();
                
                if (restored) {
                    // Session restored, proceed to app
                    onLoginSuccess(storage.isMockMode);
                } else {
                    // No session, show login screen
                    setIsLoading(false);
                }
            } catch (e) {
                console.warn('Session restore failed:', e);
                setIsLoading(false);
            }
        };
        
        tryRestoreSession();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        setError(null);
        try {
            await storage.authenticate();
            onLoginSuccess(storage.isMockMode);
        } catch (e) {
            console.error("Login Error", e);
            setError("Failed to connect to Google. Please check your connection or try Offline Mode.");
            setIsLoading(false);
        }
    };

    const handleMockLogin = () => {
        storage.enableMockMode();
        onLoginSuccess(true);
    };

    return (
        <div className="fixed inset-0 z-[200] bg-background flex items-center justify-center overflow-hidden">
            {/* Background Decorative Elements */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />
            
            <div className="w-full max-w-md p-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="bg-surface border border-border rounded-2xl shadow-2xl p-8 relative overflow-hidden group">
                    {/* Animated Border Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-purple-500/10 opacity-50" />
                    
                    <div className="relative z-10 flex flex-col items-center text-center">
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-blue-900/20">
                            <Sparkles className="text-white" size={32} />
                        </div>
                        
                        <h1 className="text-3xl font-black text-white mb-2 tracking-tight">
                            Showrunner<span className="text-blue-500">AI</span>
                        </h1>
                        <p className="text-zinc-500 text-sm mb-8 leading-relaxed">
                            The node-based creative workflow for storybuilders and AI visionaries.
                        </p>

                        <div className="w-full space-y-3">
                            <Button 
                                onClick={handleGoogleLogin} 
                                disabled={isLoading}
                                className="w-full h-12 bg-zinc-950 hover:bg-black text-white border-zinc-800 font-bold text-base transition-all active:scale-[0.98]"
                                icon={isLoading ? Loader2 : undefined}
                            >
                                {isLoading ? (
                                    <span className="animate-pulse text-white">Connecting...</span>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        <svg width="20" height="20" viewBox="0 0 48 48">
                                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"/>
                                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                                        </svg>
                                        <span className="text-white">Log in with Google</span>
                                    </div>
                                )}
                            </Button>

                            <Button 
                                onClick={handleMockLogin} 
                                variant="secondary" 
                                className="w-full h-12 bg-zinc-800/50 hover:bg-zinc-800 border-zinc-700 text-zinc-300 font-medium"
                                icon={CloudOff}
                            >
                                Continue Offline
                            </Button>
                        </div>

                        {error && (
                            <div className="mt-4 p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400 text-xs flex items-center gap-2">
                                <ShieldCheck size={14} />
                                {error}
                            </div>
                        )}

                        <div className="mt-8 pt-6 border-t border-border w-full">
                            <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">
                                
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
