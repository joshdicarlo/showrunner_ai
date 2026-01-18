/**
 * Error Boundary Component
 * 
 * Catches JavaScript errors in child components and displays a fallback UI.
 * Prevents the entire app from crashing due to errors in individual components.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[ErrorBoundary] Caught error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    handleReload = () => {
        window.location.reload();
    };

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="fixed inset-0 bg-background flex items-center justify-center p-8">
                    <div className="max-w-lg w-full bg-surface border border-border rounded-xl p-8 text-center">
                        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                            <AlertTriangle className="text-red-400" size={32} />
                        </div>
                        
                        <h2 className="text-xl font-bold text-white mb-2">
                            Something went wrong
                        </h2>
                        
                        <p className="text-zinc-400 text-sm mb-6">
                            An unexpected error occurred. Your work has been saved to the cloud.
                        </p>

                        {this.state.error && (
                            <details className="mb-6 text-left">
                                <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400">
                                    Error details
                                </summary>
                                <pre className="mt-2 p-3 bg-zinc-900 rounded text-xs text-red-400 overflow-auto max-h-32">
                                    {this.state.error.message}
                                    {this.state.error.stack && (
                                        <span className="block text-zinc-600 mt-2">
                                            {this.state.error.stack.split('\n').slice(0, 5).join('\n')}
                                        </span>
                                    )}
                                </pre>
                            </details>
                        )}

                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={this.handleReset}
                                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                                Try Again
                            </button>
                            <button
                                onClick={this.handleReload}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                            >
                                <RefreshCw size={14} />
                                Reload App
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
