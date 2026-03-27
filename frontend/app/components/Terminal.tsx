'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Trash2, XCircle } from 'lucide-react';
import { useTerminal } from '../context/TerminalContext';

interface TerminalProps {
  className?: string;
  environment?: string;
  dockerTag?: string;
}

export default function Terminal({ className = '', environment = 'Local', dockerTag = 'dev' }: TerminalProps) {
  const { lines, status, clearLines } = useTerminal();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [killing, setKilling] = useState(false);

  const killAgent = async () => {
    setKilling(true);
    try {
      await fetch('/api/agent/reset', { method: 'POST' });
    } catch (e) {
      console.error('Failed to kill agent:', e);
    }
    setKilling(false);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div className={`flex flex-col h-full bg-surface-container-lowest text-on-surface font-mono text-sm overflow-hidden border border-outline-variant ${className}`}>
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-container-low border-b border-outline-variant">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-4 kinetic-gradient" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-[0.15em] text-primary-fixed">
            Console Output
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={killAgent}
            disabled={killing}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-error/70 hover:text-error hover:bg-error-container/20 border border-transparent hover:border-error/30 transition-colors disabled:opacity-40"
            title="Kill running task"
          >
            <XCircle size={12} />
            Kill
          </button>
          <button
            onClick={clearLines}
            className="text-outline hover:text-primary-fixed transition-colors p-1 hover:bg-surface-container-high"
            title="Clear Console"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div
        ref={scrollRef}
        className="flex-1 p-4 overflow-y-auto space-y-0.5"
      >
        {lines.map((line, idx) => (
          <div key={idx} className="flex gap-3">
            <span className="text-outline select-none text-[11px] w-6 shrink-0 text-right">{idx + 1}</span>
            <span className="whitespace-pre-wrap text-on-surface-variant text-[12px] leading-relaxed">{line}</span>
          </div>
        ))}
        <div className="flex gap-3 animate-pulse">
          <span className="text-outline select-none text-[11px] w-6 shrink-0 text-right">{lines.length + 1}</span>
          <span className="w-2 h-4 bg-primary-fixed-dim/60" />
        </div>
      </div>

      {/* Terminal Footer */}
      <div className="px-4 py-2 bg-surface-container-low border-t border-outline-variant flex items-center justify-between text-[9px] font-mono uppercase tracking-widest text-outline">
        <span className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${
            status === 'connected' ? 'bg-primary-fixed-dim' :
            status === 'connecting' ? 'bg-tertiary-fixed-dim animate-pulse' :
            'bg-error'
          }`} />
          {status}
        </span>
        <span className="text-outline/60">{environment} · {dockerTag}</span>
      </div>
    </div>
  );
}
