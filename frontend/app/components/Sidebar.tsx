'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useTerminal } from '../context/TerminalContext';
import { useMacros, MacroGroup, Macro } from '../context/MacroContext';
import { MacroArgumentsModal } from './MacroArgumentsModal';

export default function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const { addSystemLine } = useTerminal();
  const { macroGroups, loading } = useMacros();

  const [confirmMacro, setConfirmMacro] = useState<Macro | null>(null);

  const handleExecuteMacro = async (macro: Macro, selectedArgs?: Record<string, number[]>) => {
    router.push('/');
    onClose();
    setConfirmMacro(null);

    try {
      const response = await fetch(`/api/macros/${macro.id}/execute`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_arguments: selectedArgs || {} })
      });
      if (response.ok) {
        addSystemLine(`Triggering macro: ${macro.name}${selectedArgs ? ' (with optional arguments)' : ''}`);
      } else {
        addSystemLine(`Error: Failed to trigger macro ${macro.name}`);
      }
    } catch (err) {
      addSystemLine(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden" 
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed top-0 left-0 z-50 h-full w-64 bg-zinc-900 text-zinc-100 transition-transform duration-300 ease-in-out lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex h-16 items-center px-6 border-b border-zinc-800">
          <Link href="/" onClick={onClose} className="text-xl font-bold tracking-tight text-white hover:text-zinc-300 transition-colors">
            MacroManager
          </Link>
        </div>

        <nav className="h-[calc(100%-4rem)] overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-zinc-700">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-500 border-t-white"></div>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-6">
                {macroGroups.map((group: MacroGroup) => (
                  <div key={group.id} className="space-y-2">
                    <h3 className="px-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      {group.name}
                    </h3>
                    <ul className="space-y-1">
                      {group.macros.map((macro: Macro) => (
                        <li key={macro.id}>
                          <button 
                            onClick={async () => {
                              setConfirmMacro(macro);
                            }}
                            className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
                          >
                            {macro.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="mt-8 pt-6 border-t border-zinc-800">
                <h3 className="px-2 mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Settings
                </h3>
                <ul className="space-y-1">
                  <li>
                    <Link
                      href="/admin"
                      className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
                      onClick={onClose}
                    >
                      Admin
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/run-log"
                      className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
                      onClick={onClose}
                    >
                      Run Log
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/scheduler"
                      className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
                      onClick={onClose}
                    >
                      Scheduler
                    </Link>
                  </li>
                </ul>
              </div>
            </>
          )}
        </nav>
      </aside>

      {confirmMacro && (
        <MacroArgumentsModal 
          macro={confirmMacro} 
          onConfirm={(args) => handleExecuteMacro(confirmMacro, args)} 
          onCancel={() => setConfirmMacro(null)} 
        />
      )}
    </>
  );
}
