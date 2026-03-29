'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface TerminalOutputModalProps {
  lines: string[];
  command?: string;
  onClose: () => void;
}

export default function TerminalOutputModal({ lines, command, onClose }: TerminalOutputModalProps) {
  // Prevent background scrolling while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-stretch bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Panel — stop click propagation so backdrop click doesn't close via panel */}
      <div
        className="flex flex-col m-4 lg:m-8 flex-1 bg-surface-container-lowest border border-outline-variant overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-surface-container-low border-b border-outline-variant shrink-0">
          <span className="text-primary-fixed-dim font-mono text-xs truncate">
            {command ? `$ ${command}` : 'Terminal Output'}
          </span>
          <button
            onClick={onClose}
            className="ml-3 shrink-0 text-outline hover:text-on-surface transition-colors p-1 hover:bg-surface-container-high"
            title="Close (ESC)"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {lines.length === 0 ? (
            <span className="text-outline font-mono text-[12px]">No output</span>
          ) : (
            lines.map((line, idx) => (
              <div key={idx} className="flex gap-3">
                <span className="text-outline select-none text-[11px] w-8 shrink-0 text-right leading-relaxed font-mono">
                  {idx + 1}
                </span>
                <div className="whitespace-pre-wrap font-mono text-[12px] text-on-surface-variant leading-relaxed flex-1 min-w-0">
                  {line}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
