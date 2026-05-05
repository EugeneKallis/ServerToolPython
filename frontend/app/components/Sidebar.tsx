"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { useTerminal } from "../context/TerminalContext";
import { useMacros, MacroGroup, Macro } from "../context/MacroContext";
import { MacroArgumentsModal } from "./MacroArgumentsModal";

interface QuickLink {
  id: number;
  label: string;
  url: string;
  ord: number;
}

export default function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const { addSystemLine } = useTerminal();
  const { macroGroups, loading } = useMacros();

  const [confirmMacro, setConfirmMacro] = useState<Macro | null>(null);
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([]);

  useEffect(() => {
    fetch('/api/quick-links')
      .then(r => r.ok ? r.json() : [])
      .then(setQuickLinks)
      .catch(() => {});
  }, [isOpen]);

  const handleExecuteMacro = async (macro: Macro, selectedArgs?: Record<string, number[]>) => {
    router.push("/");
    onClose();
    setConfirmMacro(null);

    try {
      const response = await fetch(`/api/macros/${macro.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected_arguments: selectedArgs || {} }),
      });
      if (response.ok) {
        addSystemLine(`▶ ${macro.name}`);
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
      {isOpen && <div className='fixed inset-0 z-40 bg-black/60 lg:hidden' onClick={onClose} />}

      <aside
        className={`
        fixed top-0 left-0 z-50 h-full w-64 bg-surface-container-low text-on-surface transition-transform duration-300 ease-in-out lg:translate-x-0
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
      `}
      >
        {/* Header */}
        <div className='flex h-16 items-center px-4 border-b border-outline-variant'>
          <Link href='/' onClick={onClose} className='flex items-center gap-3 group'>
            <div className='w-1.5 h-5 kinetic-gradient' />
            <span className='font-headline text-sm font-bold tracking-widest uppercase text-primary-fixed group-hover:text-primary-container transition-colors'>
              Server Tool
            </span>
          </Link>
        </div>

        <nav className='h-[calc(100%-4rem)] overflow-y-auto p-4 space-y-6 scrollbar-thin'>
          {loading ? (
            <div className='flex items-center justify-center py-10'>
              <div className='h-5 w-5 animate-spin border-2 border-outline-variant border-t-primary-fixed-dim' />
            </div>
          ) : (
            <>
              <div className='space-y-5'>
                {macroGroups.map((group: MacroGroup) => (
                  <div key={group.id} className='space-y-1'>
                    <h3 className='px-2 text-[10px] font-mono font-bold uppercase tracking-[0.15em] text-outline'>
                      {group.name}
                    </h3>
                    <ul className='space-y-0.5'>
                      {group.macros.map((macro: Macro) => (
                        <li key={macro.id}>
<button
                            onClick={() => setConfirmMacro(macro)}
                            aria-label={`Execute macro: ${macro.name}`}
                            className="w-full px-3 py-2 text-left text-sm font-mono text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary-fixed border-l-2 border-transparent hover:border-primary-fixed-dim"
                          >
                            {macro.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className='pt-4 border-t border-outline-variant'>
                <h3 className='px-2 mb-2 text-[10px] font-mono font-bold uppercase tracking-[0.15em] text-outline'>
                  Tools
                </h3>
                <ul className='space-y-0.5'>
                  {[
                    { href: '/tools/arr-searcher', label: 'Arr Searcher' },
                    { href: '/scraper', label: 'Scraper' },
                    { href: '/tools/special-cleaner', label: 'Special Cleaner' },
                  ].map(({ href, label }) => (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={onClose}
                        className='block px-3 py-2 text-sm font-mono text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary-fixed border-l-2 border-transparent hover:border-primary-fixed-dim'
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className='pt-4 border-t border-outline-variant'>
                <h3 className='px-2 mb-2 text-[10px] font-mono font-bold uppercase tracking-[0.15em] text-outline'>
                  System
                </h3>
                <ul className='space-y-0.5'>
                  {[
                    { href: '/admin', label: 'Admin' },
                    { href: '/run-log', label: 'Run Log' },
                    { href: '/scheduler', label: 'Scheduler' },
                  ].map(({ href, label }) => (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={onClose}
                        className='block px-3 py-2 text-sm font-mono text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary-fixed border-l-2 border-transparent hover:border-primary-fixed-dim'
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              {quickLinks.length > 0 && (
                <div className='pt-4 border-t border-outline-variant'>
                  <h3 className='px-2 mb-2 text-[10px] font-mono font-bold uppercase tracking-[0.15em] text-outline'>
                    Quick Links
                  </h3>
                  <ul className='space-y-0.5'>
                    {quickLinks.map(link => (
                      <li key={link.id}>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={onClose}
                          className='flex items-center justify-between px-3 py-2 text-sm font-mono text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary-fixed border-l-2 border-transparent hover:border-primary-fixed-dim group'
                        >
                          <span className="truncate">{link.label}</span>
                          <ExternalLink className='h-3 w-3 opacity-0 group-hover:opacity-100 flex-shrink-0 ml-2 transition-opacity' />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </nav>
      </aside>

      {confirmMacro && (
        <MacroArgumentsModal macro={confirmMacro} onConfirm={(args) => handleExecuteMacro(confirmMacro, args)} onCancel={() => setConfirmMacro(null)} />
      )}
    </>
  );
}
