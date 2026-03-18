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
        // Refresh after a short delay to see if status updated
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

  // Initial load + auto-refresh every 5s
  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 5_000);
    return () => clearInterval(interval);
  }, [fetchRuns]);

  const macroNames = [...new Set(runs.map((r: ScriptRun) => r.macro_name))].sort();

  return (
    <div className="flex min-h-[calc(100vh-1rem)] flex-col p-6 text-zinc-100">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Run Log</h1>
        <div className="flex items-center gap-3">
          {/* Reset Agent */}
          <div className="relative">
            {!confirmReset ? (
              <button
                onClick={() => setConfirmReset(true)}
                className="flex items-center gap-1.5 rounded-md border border-red-900/50 bg-red-950/20 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-950/40 transition-colors"
                title="Kill all running and pending tasks"
              >
                <XCircle size={14} />
                Reset Agent
              </button>
            ) : (
              <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 transition-colors shadow-lg shadow-red-900/20"
                >
                  {resetting ? <RefreshCw size={14} className="animate-spin" /> : <XCircle size={14} />}
                  Confirm Kill
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="h-4 w-[1px] bg-zinc-800 mx-1" />

          {/* Clear Log */}
          <div className="relative">
            {!confirmClear ? (
              <button
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                title="Clear all run history"
              >
                <XCircle size={14} />
                Clear All
              </button>
            ) : (
              <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                <button
                  onClick={handleClearAll}
                  disabled={clearing}
                  className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 transition-colors shadow-lg shadow-red-900/20"
                >
                  {clearing ? <RefreshCw size={14} className="animate-spin" /> : <XCircle size={14} />}
                  Confirm Clear
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="h-4 w-[1px] bg-zinc-800 mx-1" />

          {/* Filter */}
          <select
            value={filter}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilter(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="">All macros</option>
            {macroNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          {/* Manual refresh */}
          <button
            onClick={fetchRuns}
            className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[2rem_1fr_1fr_8rem_6rem_6rem] gap-3 px-4 py-2.5 border-b border-zinc-800 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <span />
          <span>Macro</span>
          <span>Started</span>
          <span>Duration</span>
          <span>Status</span>
          <span className="text-right">ID</span>
        </div>

        <div className="overflow-y-auto max-h-[calc(100vh-14rem)]">
          {loading && runs.length === 0 && (
            <div className="flex items-center justify-center py-16 text-zinc-500 text-sm">Loading…</div>
          )}
          {!loading && runs.length === 0 && (
            <div className="flex items-center justify-center py-16 text-zinc-500 text-sm">
              No runs yet. Execute a macro to see history here.
            </div>
          )}
          {runs.map((run: ScriptRun) => (
            <div key={run.id} className={`border-b border-zinc-800/60 ${run.success === null ? 'bg-blue-500/5' : ''}`}>
              {/* Summary row */}
              <button
                onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                className="w-full grid grid-cols-[2rem_1fr_1fr_8rem_6rem_6rem] gap-3 px-4 py-3 text-left hover:bg-zinc-800/40 transition-colors items-center"
              >
                {/* Expand chevron */}
                <span className="text-zinc-500">
                  {expanded === run.id
                    ? <ChevronDown size={14} />
                    : <ChevronRight size={14} />}
                </span>

                {/* Macro name */}
                <span className="font-mono text-sm text-zinc-100">{run.macro_name}</span>

                {/* Started at */}
                <span className="text-sm text-zinc-400">{formatDate(run.started_at)}</span>

                {/* Duration */}
                <span className="flex items-center gap-1 text-sm text-zinc-400">
                  <Clock size={12} />
                  {formatDuration(run.duration_seconds)}
                </span>

                {/* Status badge */}
                <span>
                  {run.success === true && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                      <CheckCircle2 size={13} /> OK
                    </span>
                  )}
                  {run.success === false && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400">
                      <XCircle size={13} /> Failed
                    </span>
                  )}
                  {run.success === null && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400 animate-pulse">
                      <RefreshCw size={13} className="animate-spin" /> Running
                    </span>
                  )}
                </span>

                {/* ID */}
                <span className="text-right text-xs text-zinc-600">#{run.id}</span>
              </button>

              {/* Expanded output */}
              {expanded === run.id && (
                <div className="px-4 pb-4">
                  <pre className="rounded-lg bg-zinc-950 border border-zinc-800 p-4 text-xs text-zinc-300 font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
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
