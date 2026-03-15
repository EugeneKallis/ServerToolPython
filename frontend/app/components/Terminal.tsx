'use client';

import React, { useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { useTerminal } from '../context/TerminalContext';

interface TerminalProps {
  className?: string;
}

export default function Terminal({ className = '' }: TerminalProps) {
  const { lines, status, clearLines } = useTerminal();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);


  return (
    <div className={`flex flex-col h-full bg-zinc-950 text-zinc-300 font-mono text-sm overflow-hidden border border-zinc-800 rounded-xl shadow-2xl ${className}`}>
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
        <div className="flex gap-2 w-12">
          <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
          <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
          <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
        </div>
        <div className="text-xs text-zinc-500 font-sans font-medium uppercase tracking-widest flex-1 text-center">
          Console Output
        </div>
        <div className="flex justify-end w-12">
          <button 
            onClick={clearLines} 
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-md hover:bg-zinc-800"
            title="Clear Console"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div 
        ref={scrollRef}
        className="flex-1 p-4 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent"
      >
        {lines.map((line, idx) => (
          <div key={idx} className="flex gap-3">
            <span className="text-zinc-600 select-none">{idx + 1}</span>
            <span className="whitespace-pre-wrap">{line}</span>
          </div>
        ))}
        <div className="flex gap-3 animate-pulse">
            <span className="text-zinc-600 select-none">{lines.length + 1}</span>
            <span className="w-2 h-5 bg-emerald-500/50"></span>
        </div>
      </div>

      {/* Terminal Footer */}
      <div className="px-4 py-2 bg-zinc-900/50 border-t border-zinc-800 flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-tighter">
        <span className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-500' : status === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}`}></div>
          Status: {status}
        </span>
        <span>Environment: Development</span>
      </div>
    </div>
  );
}
