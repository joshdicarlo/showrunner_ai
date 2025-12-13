
import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button, Input } from './UI';
import { sendChatMessage } from '../services/geminiService';

interface ChatBotProps {
    scriptContext?: string;
}

export const ChatBot: React.FC<ChatBotProps> = ({ scriptContext }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{role: 'user'|'model', text: string}[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const toggleChat = () => setIsOpen(!isOpen);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!inputValue.trim()) return;
        const userMsg = inputValue;
        setInputValue('');
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setIsLoading(true);

        try {
            // Convert internal history to API format
            const history = messages.map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            }));
            
            // Inject Script Context into the latest message if available
            // We do this by prepending context to the user's message invisibly for the user but visible for the model
            let promptToSend = userMsg;
            if (scriptContext && messages.length < 2) { 
                promptToSend = `[APP CONTEXT: The user is working on a project with the following script content:\n${scriptContext.substring(0, 5000)}...]\n\nUser Query: ${userMsg}`;
            }

            const responseText = await sendChatMessage(history, promptToSend);
            setMessages(prev => [...prev, { role: 'model', text: responseText || "I'm sorry, I couldn't understand that." }]);
        } catch (e) {
            setMessages(prev => [...prev, { role: 'model', text: "Error connecting to AI." }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSend();
    };

    return (
        <>
            {/* Trigger Button - Absolute positioning relative to Canvas container */}
            <button 
                onClick={toggleChat}
                className={`absolute bottom-6 right-6 p-4 rounded-full shadow-2xl z-50 transition-all ${isOpen ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-500'}`}
            >
                {isOpen ? <X className="text-white" /> : <MessageSquare className="text-white" />}
            </button>

            {/* Chat Window */}
            {isOpen && (
                <div className="absolute bottom-24 right-6 w-80 h-96 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col z-50 overflow-hidden">
                    <div className="p-3 bg-zinc-800 border-b border-zinc-700 font-bold text-sm text-zinc-200 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/>
                        Gemini Assistant
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {messages.length === 0 && (
                            <div className="text-center text-zinc-500 text-xs mt-10 space-y-2">
                                <p>Ask me anything about your story or production.</p>
                                <p className="opacity-70">"What is Zax doing in Scene 1?"</p>
                            </div>
                        )}
                        {messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-2 rounded-lg text-xs overflow-hidden ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-300'}`}>
                                    <ReactMarkdown 
                                        className="markdown-preview [&>p]:mb-1 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4"
                                    >
                                        {msg.text}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                             <div className="flex justify-start">
                                <div className="bg-zinc-800 p-2 rounded-lg text-xs text-zinc-400 italic">
                                    Thinking...
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="p-3 border-t border-zinc-700 flex gap-2 bg-zinc-900">
                        <Input 
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask Gemini..."
                            className="flex-1 text-xs h-8"
                        />
                        <Button size="sm" className="px-2 py-1" onClick={handleSend} disabled={isLoading}>
                            <Send size={14}/>
                        </Button>
                    </div>
                </div>
            )}
        </>
    );
};
