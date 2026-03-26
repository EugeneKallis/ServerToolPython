'use client';

import React, { useEffect, useState } from 'react';
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
      if (response.ok) {
        const data = await response.json();
        setSchedules(data);
      }
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  const handleToggleEnabled = async (schedule: MacroSchedule) => {
    try {
      const response = await fetch(`/api/schedules/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !schedule.enabled }),
      });
      if (response.ok) {
        fetchSchedules();
      }
    } catch (error) {
      console.error('Failed to toggle schedule:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    try {
      const response = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      if (response.ok) {
        fetchSchedules();
      }
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
    <div className="p-8 w-full">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Macro Scheduler</h1>
          <p className="text-zinc-400 text-sm">Automate your macros with precision.</p>
        </div>
        <button
          onClick={() => {
            setEditingSchedule(null);
            setIsFormOpen(true);
          }}
          className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg border border-zinc-700 transition-colors flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
            <path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"></path>
          </svg>
          New Schedule
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
        </div>
      ) : (
        <div className="grid gap-4">
          {schedules.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center text-zinc-500">
              No schedules found. Create one to get started.
            </div>
          ) : (
            schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-zinc-700 transition-all hover:shadow-lg hover:shadow-black/50"
              >
                <div className="flex items-center gap-4">
                  <div className={`h-3 w-3 rounded-full ${schedule.enabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-zinc-700'}`} />
                  <div>
                    <h3 className="text-lg font-semibold text-white">{schedule.name}</h3>
                    <p className="text-zinc-400 text-sm mt-1">
                      <span className="text-zinc-500">Macro:</span> {getMacroName(schedule.macro_id)}
                      <span className="mx-2 text-zinc-700">|</span>
                      <span className="text-zinc-500">Interval:</span> {schedule.cron_expression}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggleEnabled(schedule)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      schedule.enabled
                        ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 shadow-inner'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {schedule.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingSchedule(schedule);
                      setIsFormOpen(true);
                    }}
                    className="p-2 text-zinc-400 hover:text-white transition-colors h-9 w-9 flex items-center justify-center rounded-lg hover:bg-zinc-800"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"></path>
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(schedule.id)}
                    className="p-2 text-zinc-400 hover:text-rose-500 transition-colors h-9 w-9 flex items-center justify-center rounded-lg hover:bg-rose-500/10"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"></path>
                    </svg>
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
          onSuccess={() => {
            setIsFormOpen(false);
            fetchSchedules();
          }}
          schedule={editingSchedule}
        />
      )}
    </div>
  );
}
