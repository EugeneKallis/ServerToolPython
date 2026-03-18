'use client';

import React, { useState } from 'react';
import { X, Play } from 'lucide-react';
import { Macro, Command } from '../context/MacroContext';

interface MacroArgumentsModalProps {
  macro: Macro;
  onConfirm: (selectedArgs: Record<string, number[]>) => void;
  onCancel: () => void;
}

export function MacroArgumentsModal({ macro, onConfirm, onCancel }: MacroArgumentsModalProps) {
  // commandId -> list of argIds
  const [selectedArgs, setSelectedArgs] = useState<Record<string, number[]>>({});

  const toggleArg = (commandId: number, argId: number) => {
    setSelectedArgs(prev => {
      const current = prev[commandId] || [];
      const next = current.includes(argId)
        ? current.filter(id => id !== argId)
        : [...current, argId];
      return { ...prev, [commandId]: next };
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/50 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4 bg-zinc-900/50">
          <div>
            <h2 className="text-lg font-bold text-white">{macro.name}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Confirm execution and select optional arguments</p>
          </div>
          <button onClick={onCancel} className="text-zinc-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto p-5 space-y-6">
          <div className="space-y-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-600 px-1">Commands to run:</h3>
            {macro.commands.map((cmd, idx) => (
              <div key={cmd.id} className="space-y-3 pb-4 border-b border-zinc-800/50 last:border-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-500">
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <code className="text-[13px] text-zinc-300 font-mono break-all bg-black/30 px-2 py-1 rounded inline-block w-full">{cmd.command}</code>
                  </div>
                </div>
                
                {cmd.arguments && cmd.arguments.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 pl-8">
                    {cmd.arguments.map(arg => (
                      <label 
                        key={arg.id} 
                        className={`
                          flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-all
                          ${selectedArgs[cmd.id]?.includes(arg.id) 
                            ? 'bg-blue-600/10 border-blue-500/50 text-blue-100' 
                            : 'bg-zinc-800/40 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'}
                        `}
                      >
                        <div className="relative flex items-center">
                          <input
                            type="checkbox"
                            className="peer h-4 w-4 opacity-0 absolute"
                            checked={selectedArgs[cmd.id]?.includes(arg.id) || false}
                            onChange={() => toggleArg(cmd.id, arg.id)}
                          />
                          <div className={`
                            h-4 w-4 rounded border transition-colors flex items-center justify-center
                            ${selectedArgs[cmd.id]?.includes(arg.id) 
                              ? 'bg-blue-500 border-blue-500' 
                              : 'bg-zinc-900 border-zinc-700 peer-hover:border-zinc-500'}
                          `}>
                             {selectedArgs[cmd.id]?.includes(arg.id) && (
                               <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                                 <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                               </svg>
                             )}
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold">{arg.arg_name}</span>
                          <span className="text-[9px] opacity-60 font-mono">{arg.arg_value}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 p-5 bg-zinc-900/50 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-400 hover:bg-zinc-800 hover:text-white transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selectedArgs)}
            className="flex-[2] flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500 active:scale-[0.98] transition-all"
          >
            <Play size={16} fill="currentColor" />
            Run Macro
          </button>
        </div>
      </div>
    </div>
  );
}
