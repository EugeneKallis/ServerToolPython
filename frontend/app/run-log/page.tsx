'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

interface ScriptRun {
  id: number;
  macro_name: string;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  success: boolean | null;
  output: string | null;
}

function formatDuration(secs: number | null): string {
  if (secs == null) return '—';
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}m ${s}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'Z');
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function RunLogPage() {
  const [runs, setRuns] = useState<ScriptRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [filter, setFilter] = useState('');

  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    const url = filter ? `/api/script-runs?macro=${encodeURIComponent(filter)}` : '/api/script-runs';
    const res = await fetch(url);
    if (res.ok) setRuns(await res.json());
    setLoading(false);
  }, [filter]);

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/agent/reset', { method: 'POST' });
      if (res.ok) {
        setConfirmReset(false);
        setTimeout(fetchRuns, 1000);
      }
    } catch (err) {
      console.error('Failed to reset agent:', err);
    }
    setResetting(false);
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      const res = await fetch('/api/script-runs', { method: 'DELETE' });
      if (res.ok) {
        setConfirmClear(false);
        setRuns([]);
      }
    } catch (err) {
      console.error('Failed to clear runs:', err);
    }
    setClearing(false);
  };

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 5_000);
    return () => clearInterval(interval);
  }, [fetchRuns]);

  const macroNames = [...new Set(runs.map((r: ScriptRun) => r.macro_name))].sort();

  return (
    <div className="flex w-full min-h-[calc(100vh-1rem)] flex-col p-6 text-on-surface">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-headline font-bold tracking-tight text-on-surface">Run Log</h1>
        <div className="flex items-center gap-3">
          {/* Reset Agent */}
          <div className="relative">
            {!confirmReset ? (
              <button
                onClick={() => setConfirmReset(true)}
                className="flex items-center gap-1.5 border border-error/30 bg-error-container/20 px-3 py-1.5 text-xs font-mono text-error hover:bg-error-container/40 transition-colors"
                title="Kill all running and pending tasks"
              >
                <XCircle size={14} />
                Reset Agent
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="flex items-center gap-1.5 bg-error-container px-3 py-1.5 text-xs font-mono font-semibold text-on-error-container hover:opacity-80 transition-opacity"
                >
                  {resetting ? <RefreshCw size={14} className="animate-spin" /> : <XCircle size={14} />}
                  Confirm Kill
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-1.5 text-xs font-mono text-outline hover:text-on-surface transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-outline-variant mx-1" />

          {/* Clear Log */}
          <div className="relative">
            {!confirmClear ? (
              <button
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1.5 border border-outline-variant bg-surface-container-high px-3 py-1.5 text-xs font-mono text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                title="Clear all run history"
              >
                <XCircle size={14} />
                Clear All
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClearAll}
                  disabled={clearing}
                  className="flex items-center gap-1.5 bg-error-container px-3 py-1.5 text-xs font-mono font-semibold text-on-error-container hover:opacity-80 transition-opacity"
                >
                  {clearing ? <RefreshCw size={14} className="animate-spin" /> : <XCircle size={14} />}
                  Confirm Clear
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="px-3 py-1.5 text-xs font-mono text-outline hover:text-on-surface transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-outline-variant mx-1" />

          {/* Filter */}
          <select
            value={filter}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilter(e.target.value)}
            className="border border-outline-variant bg-surface-container-high px-3 py-1.5 text-xs font-mono text-on-surface focus:border-primary-fixed-dim focus:outline-none"
          >
            <option value="">All macros</option>
            {macroNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          <button
            onClick={fetchRuns}
            className="flex items-center gap-1.5 border border-outline-variant bg-surface-container-high px-3 py-1.5 text-xs font-mono text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 border border-outline-variant bg-surface-container overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[2rem_1fr_1fr_8rem_6rem_6rem] gap-3 px-4 py-2.5 border-b border-outline-variant text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-outline">
          <span />
          <span>Macro</span>
          <span>Started</span>
          <span>Duration</span>
          <span>Status</span>
          <span className="text-right">ID</span>
        </div>

        <div className="overflow-y-auto max-h-[calc(100vh-14rem)]">
          {loading && runs.length === 0 && (
            <div className="flex items-center justify-center py-16 text-outline text-xs font-mono">Loading…</div>
          )}
          {!loading && runs.length === 0 && (
            <div className="flex items-center justify-center py-16 text-outline text-xs font-mono">
              No runs yet. Execute a macro to see history here.
            </div>
          )}
          {runs.map((run: ScriptRun) => (
            <div key={run.id} className={`border-b border-outline-variant/60 ${run.success === null ? 'bg-surface-container-high/30' : ''}`}>
              <button
                onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                className="w-full grid grid-cols-[2rem_1fr_1fr_8rem_6rem_6rem] gap-3 px-4 py-3 text-left hover:bg-surface-container-high transition-colors items-center"
              >
                <span className="text-outline">
                  {expanded === run.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <span className="font-mono text-xs text-on-surface">{run.macro_name}</span>
                <span className="text-xs font-mono text-on-surface-variant">{formatDate(run.started_at)}</span>
                <span className="flex items-center gap-1 text-xs font-mono text-on-surface-variant">
                  <Clock size={12} />
                  {formatDuration(run.duration_seconds)}
                </span>
                <span>
                  {run.success === true && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-primary-fixed-dim">
                      <CheckCircle2 size={12} /> OK
                    </span>
                  )}
                  {run.success === false && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-error">
                      <XCircle size={12} /> Failed
                    </span>
                  )}
                  {run.success === null && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-tertiary-fixed-dim animate-pulse">
                      <RefreshCw size={12} className="animate-spin" /> Running
                    </span>
                  )}
                </span>
                <span className="text-right text-[10px] font-mono text-outline">#{run.id}</span>
              </button>

              {expanded === run.id && (
                <div className="px-4 pb-4">
                  <pre className="border border-outline-variant bg-surface-container-lowest p-4 text-xs text-on-surface-variant font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
                    {run.output || '(no output captured)'}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
