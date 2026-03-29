'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import type { AgentFeedItem } from '../../context/TerminalContext';

export default function SpecialCleanerPage() {
  const { feedItems } = useTerminal();

  const [minSizeMb, setMinSizeMb] = useState(75);
  const [dryRun, setDryRun] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [feedStartIndex, setFeedStartIndex] = useState<number | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Determine relevant feed items from this run
  const runFeedItems = feedStartIndex !== null
    ? feedItems.slice(feedStartIndex).filter((i): i is AgentFeedItem => i.type === 'agent')
    : [];

  const allLines = runFeedItems.flatMap((item) => item.lines);
  const latestDone = runFeedItems.length > 0 && runFeedItems[runFeedItems.length - 1].done;

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (allLines.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [allLines.length]);

  // Detect completion
  useEffect(() => {
    if (isRunning && latestDone) {
      setIsRunning(false);
    }
  }, [isRunning, latestDone]);

  const triggerRun = async (dryRun: boolean) => {
    setFeedStartIndex(feedItems.length);
    setHasRun(true);
    setIsRunning(true);
    setConfirmDelete(false);

    try {
      const res = await fetch('/api/tools/special-cleaner/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: dryRun, min_size_mb: minSizeMb }),
      });
      if (!res.ok) {
        setIsRunning(false);
      }
    } catch {
      setIsRunning(false);
    }
  };

  const handleExecuteClick = () => {
    if (!dryRun && !confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setConfirmDelete(false);
    triggerRun(dryRun);
  };

  return (
    <div className="flex flex-col w-full h-full bg-surface-dim text-on-surface">
      {/* Header */}
      <div className="shrink-0 border-b border-outline-variant bg-surface-dim">
        <div className="px-4 lg:px-6 pt-5 pb-4">
          <h1 className="font-headline font-bold text-sm uppercase tracking-[0.15em] text-on-surface">
            Special Cleaner
          </h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Remove archives, small files, and empty directories from special media folders
          </p>
        </div>
      </div>

      {/* Controls row */}
      <div className="shrink-0 px-4 py-3 flex items-center gap-4 flex-wrap border-b border-outline-variant bg-surface-dim">
        <div className="flex items-center gap-2">
          <label className="text-xs font-mono text-on-surface-variant whitespace-nowrap">
            Min File Size (MB)
          </label>
          <input
            type="number"
            value={minSizeMb}
            onChange={(e) => setMinSizeMb(Math.max(1, parseInt(e.target.value) || 1))}
            disabled={isRunning}
            className="w-20 bg-surface-container-lowest border border-outline-variant text-on-surface font-mono text-sm px-3 py-1.5 focus:border-primary-fixed-dim focus:outline-none disabled:opacity-40"
          />
        </div>

        <div className="flex items-center gap-2 cursor-pointer" onClick={() => { if (!isRunning) { setDryRun(!dryRun); setConfirmDelete(false); }}}>
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => { setDryRun(e.target.checked); setConfirmDelete(false); }}
            disabled={isRunning}
            className="w-4 h-4 cursor-pointer disabled:opacity-40"
          />
          <label className="text-xs font-mono font-semibold text-primary-fixed-dim cursor-pointer whitespace-nowrap">
            Dry Run
          </label>
        </div>

        <button
          onClick={handleExecuteClick}
          disabled={isRunning}
          className={`text-xs font-mono font-semibold px-4 py-2 transition-colors disabled:opacity-40 ${(!dryRun && confirmDelete) ? 'bg-error-container text-on-error-container hover:bg-error' : 'bg-primary-fixed text-on-primary-fixed hover:bg-primary-fixed-dim'}`}
        >
          {(!dryRun && confirmDelete) ? 'Confirm Execute (Live)' : 'Execute'}
        </button>
      </div>

      {/* Confirmation warning banner */}
      {!dryRun && confirmDelete && (
        <div className="shrink-0 bg-error-container/20 border border-error/30 px-4 py-2 text-xs font-mono text-error">
          This will permanently delete files. Click &apos;Confirm Execute (Live)&apos; again to confirm.
        </div>
      )}

      {/* Terminal output panel */}
      <div className="flex-1 overflow-y-auto mx-4 my-4 bg-surface-container-lowest border border-outline-variant p-4 font-mono text-xs text-on-surface-variant relative">
        {!hasRun && (
          <div className="flex items-center justify-center h-full text-outline font-mono text-xs">
            Run the cleaner to see output here
          </div>
        )}

        {hasRun && allLines.length === 0 && isRunning && (
          <div className="flex items-center justify-center h-full">
            <div className="h-5 w-5 animate-spin border-2 border-outline-variant border-t-primary-fixed-dim" />
          </div>
        )}

        {allLines.map((line, i) => (
          <div key={i} className="leading-5 whitespace-pre-wrap break-all">
            {line}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
