import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
}

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', size = 'md', icon: Icon, children, className = '', ...props }) => {
  const base = "flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  
  const sizes = {
      sm: "px-3 py-1 text-xs",
      md: "px-4 py-2 text-sm",
      lg: "px-6 py-3 text-base"
  };

  const variants = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white",
    secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700",
    ghost: "hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100",
    danger: "bg-red-900/50 hover:bg-red-900/70 text-red-200 border border-red-900"
  };

  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {Icon && <Icon size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...props }) => (
  <input 
    className={`w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`}
    {...props}
  />
);

export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className = '', ...props }) => (
  <textarea 
    className={`w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[100px] ${className}`}
    {...props}
  />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', ...props }) => (
    <div className={`relative ${className}`}>
        <select 
            className="w-full appearance-none bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 pr-8"
            {...props}
        >
            {props.children}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-zinc-400">
            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
        </div>
    </div>
);

export const Modal: React.FC<{ title: string; children: React.ReactNode; onClose: () => void; maxWidth?: string }> = ({ title, children, onClose, maxWidth = 'max-w-lg' }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
    <div className={`bg-zinc-900 border border-zinc-800 rounded-lg w-full shadow-2xl ${maxWidth}`}>
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
        <button onClick={onClose} className="text-zinc-500 hover:text-white">✕</button>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  </div>
);

export const ToggleGroup: React.FC<{ options: { value: string, icon?: LucideIcon, label?: string }[], value: string, onChange: (val: string) => void }> = ({ options, value, onChange }) => (
    <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800">
        {options.map(opt => (
            <button
                key={opt.value}
                onClick={() => onChange(opt.value)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    value === opt.value 
                        ? 'bg-zinc-700 text-white shadow-sm' 
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                }`}
                title={opt.label}
            >
                {opt.icon && <opt.icon size={14} />}
                {opt.label && <span>{opt.label}</span>}
            </button>
        ))}
    </div>
);