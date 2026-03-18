'use client';

import React, { useState, useEffect } from 'react';
import { useMacros } from '../../context/MacroContext';

interface ScheduleFormProps {
  onClose: () => void;
  onSuccess: () => void;
  schedule?: any;
}

export default function ScheduleForm({ onClose, onSuccess, schedule }: ScheduleFormProps) {
  const { macroGroups } = useMacros();
  const [name, setName] = useState(schedule?.name || '');
  const [macroId, setMacroId] = useState(schedule?.macro_id || '');
  const [frequencyType, setFrequencyType] = useState('minutes');
  const [frequencyValue, setFrequencyValue] = useState('5');
  const [loading, setLoading] = useState(false);

  // Parse cron expression to set initial frequency state if editing
  useEffect(() => {
    if (schedule?.cron_expression) {
      const cron = schedule.cron_expression;
      if (cron.startsWith('*/')) {
        const value = cron.split(' ')[0].replace('*/', '');
        setFrequencyType('minutes');
        setFrequencyValue(value);
      } else if (cron.includes(' 0 * * * *')) {
        // simple hour check... this is a placeholder for real logic
      }
    }
  }, [schedule]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    let cron = '';
    if (frequencyType === 'minutes') {
      cron = `*/${frequencyValue} * * * *`;
    } else if (frequencyType === 'hours') {
      cron = `0 */${frequencyValue} * * *`;
    } else if (frequencyType === 'daily') {
      cron = `0 0 * * *`; // Default to midnight
    } else if (frequencyType === 'weekly') {
      cron = `0 0 * * 0`; // Default to Sunday midnight
    }

    const payload = {
      name,
      macro_id: parseInt(macroId),
      cron_expression: cron,
      enabled: schedule ? schedule.enabled : true,
      args: '{}',
    };

    try {
      const url = schedule ? `/api/schedules/${schedule.id}` : '/api/schedules';
      const response = await fetch(url, {
        method: schedule ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        onSuccess();
      }
    } catch (error) {
      console.error('Failed to save schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
            <h2 className="text-xl font-bold text-white">{schedule ? 'Edit Schedule' : 'New Schedule'}</h2>
            <button onClick={onClose} type="button" className="text-zinc-500 hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256">
                <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"></path>
              </svg>
            </button>
          </div>

          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Schedule Name</label>
              <input
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Daily Cleanup"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-700 focus:border-transparent transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Macro to Execute</label>
              <select
                required
                value={macroId}
                onChange={(e) => setMacroId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-zinc-700 transition-all appearance-none"
              >
                <option value="">Select a macro...</option>
                {macroGroups.map((group) => (
                  <optgroup key={group.id} label={group.name}>
                    {group.macros.map((macro) => (
                      <option key={macro.id} value={macro.id}>
                        {macro.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Frequency</label>
              <div className="grid grid-cols-2 gap-3">
                {['minutes', 'hours', 'daily', 'weekly'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFrequencyType(type)}
                    className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      frequencyType === type
                        ? 'bg-white text-black border-white'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
              {(frequencyType === 'minutes' || frequencyType === 'hours') && (
                <div className="flex items-center gap-4 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                  <span className="text-zinc-400 text-sm">Every</span>
                  <input
                    type="number"
                    value={frequencyValue}
                    onChange={(e) => setFrequencyValue(e.target.value)}
                    className="w-16 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-center text-white focus:outline-none"
                  />
                  <span className="text-zinc-400 text-sm">{frequencyType}</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-6 bg-zinc-950/50 border-t border-zinc-800 flex gap-3">
            <button
              onClick={onClose}
              type="button"
              className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-zinc-400 hover:bg-zinc-900 transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={loading}
              type="submit"
              className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-black"></div>
                  Saving...
                </div>
              ) : (
                schedule ? 'Update Schedule' : 'Create Schedule'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
