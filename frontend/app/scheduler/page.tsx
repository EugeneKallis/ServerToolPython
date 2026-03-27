'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useMacros } from '../context/MacroContext';
import ScheduleForm from './components/ScheduleForm';

interface MacroSchedule {
  id: number;
  name: string;
  macro_id: number;
  cron_expression: string;
  enabled: boolean;
  args?: string;
}

export default function SchedulerPage() {
  const { macroGroups } = useMacros();
  const [schedules, setSchedules] = useState<MacroSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<MacroSchedule | null>(null);

  const fetchSchedules = async () => {
    try {
      const response = await fetch('/api/schedules');
      if (response.ok) setSchedules(await response.json());
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSchedules(); }, []);

  const handleToggleEnabled = async (schedule: MacroSchedule) => {
    try {
      const response = await fetch(`/api/schedules/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !schedule.enabled }),
      });
      if (response.ok) fetchSchedules();
    } catch (error) {
      console.error('Failed to toggle schedule:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    try {
      const response = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      if (response.ok) fetchSchedules();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
    }
  };

  const getMacroName = (macroId: number) => {
    for (const group of macroGroups) {
      const macro = group.macros.find((m) => m.id === macroId);
      if (macro) return macro.name;
    }
    return 'Unknown Macro';
  };

  return (
    <div className="p-6 w-full text-on-surface">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-headline font-bold text-on-surface mb-1">Macro Scheduler</h1>
          <p className="text-on-surface-variant text-xs font-mono">Automate your macros with precision.</p>
        </div>
        <button
          onClick={() => { setEditingSchedule(null); setIsFormOpen(true); }}
          className="bg-surface-container-high hover:bg-surface-container-highest text-primary-fixed px-4 py-2 border border-outline-variant transition-colors flex items-center gap-2 text-xs font-mono"
        >
          <Plus size={14} />
          New Schedule
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-outline-variant border-t-primary-fixed-dim" />
        </div>
      ) : (
        <div className="grid gap-2">
          {schedules.length === 0 ? (
            <div className="border border-outline-variant bg-surface-container p-12 text-center text-outline text-xs font-mono">
              No schedules found. Create one to get started.
            </div>
          ) : (
            schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="bg-surface-container border border-outline-variant p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-outline hover:bg-surface-container-high transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`h-2 w-2 ${schedule.enabled ? 'bg-primary-fixed-dim' : 'bg-outline'}`} />
                  <div>
                    <h3 className="text-sm font-mono font-semibold text-on-surface">{schedule.name}</h3>
                    <p className="text-outline text-xs font-mono mt-0.5">
                      <span className="text-outline">Macro:</span> <span className="text-on-surface-variant">{getMacroName(schedule.macro_id)}</span>
                      <span className="mx-2 text-outline-variant">|</span>
                      <span className="text-outline">Interval:</span> <span className="text-primary-fixed-dim">{schedule.cron_expression}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleEnabled(schedule)}
                    className={`px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider border transition-colors ${
                      schedule.enabled
                        ? 'border-primary-fixed-dim/40 text-primary-fixed-dim bg-primary-fixed-dim/10 hover:bg-primary-fixed-dim/20'
                        : 'border-outline-variant text-outline bg-surface-container-high hover:bg-surface-container-highest'
                    }`}
                  >
                    {schedule.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    onClick={() => { setEditingSchedule(schedule); setIsFormOpen(true); }}
                    className="p-2 text-outline hover:text-primary-fixed hover:bg-surface-container-highest transition-colors"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(schedule.id)}
                    className="p-2 text-outline hover:text-error hover:bg-error-container/20 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {isFormOpen && (
        <ScheduleForm
          onClose={() => setIsFormOpen(false)}
          onSuccess={() => { setIsFormOpen(false); fetchSchedules(); }}
          schedule={editingSchedule}
        />
      )}
    </div>
  );
}
