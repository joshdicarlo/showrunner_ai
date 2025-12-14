
import React from 'react';
import * as Icons from 'lucide-react';
import { Settings } from 'lucide-react';
import { DEPARTMENTS } from '../constants';
import { DepartmentType } from '../types';

interface SidebarProps {
  currentDept: DepartmentType;
  onChangeDept: (dept: DepartmentType) => void;
  onBack: () => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentDept, onChangeDept, onBack, onOpenSettings }) => {
  return (
    <div className="w-16 h-full bg-surface border-r border-border flex flex-col items-center py-4 gap-4 z-20">
        <button 
            onClick={onBack}
            className="p-3 rounded-xl bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white mb-4 transition-all"
            title="Back to Dashboard"
        >
            <Icons.ArrowLeft size={20} />
        </button>

        <div className="w-8 h-[1px] bg-zinc-800" />

        {DEPARTMENTS.map((dept) => {
            // Dynamic Icon Component lookup
            // @ts-ignore
            const IconComponent = Icons[dept.icon];
            const isActive = currentDept === dept.id;

            return (
                <button
                    key={dept.id}
                    onClick={() => onChangeDept(dept.id as DepartmentType)}
                    className={`relative group p-3 rounded-xl transition-all ${isActive ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'}`}
                >
                    {IconComponent && <IconComponent size={24} className={isActive ? dept.color : ''} />}
                    
                    {/* Tooltip */}
                    <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-zinc-900 text-zinc-200 text-xs px-2 py-1 rounded border border-zinc-800 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                        {dept.id}
                    </div>
                    
                    {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full" />
                    )}
                </button>
            )
        })}

        <div className="flex-1" />
        
        <button 
            onClick={onOpenSettings}
            className="p-3 rounded-xl text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-all"
            title="Project Settings"
        >
            <Settings size={20} />
        </button>
    </div>
  );
};
