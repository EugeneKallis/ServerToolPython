'use client';

import React, { useState, useEffect } from 'react';
import { useMacros } from '../../context/MacroContext';

interface ScheduleFormProps {
  onClose: () => void;
  onSuccess: () => void;
  schedule?: any;
}

const DAYS = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

function parseCron(cron: string) {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, , , dow] = parts;

  if (min.startsWith('*/')) {
    return { type: 'minutes', value: min.replace('*/', ''), hour: '9', minute: '0', day: 1 };
  }
  if (hour.startsWith('*/') && min === '0') {
    return { type: 'hours', value: hour.replace('*/', ''), hour: '9', minute: '0', day: 1 };
  }
  if (dow !== '*') {
    return { type: 'weekly', value: '1', hour: hour === '*' ? '9' : hour, minute: min === '*' ? '0' : min, day: parseInt(dow) };
  }
  return { type: 'daily', value: '1', hour: hour === '*' ? '9' : hour, minute: min === '*' ? '0' : min, day: 1 };
}

export default function ScheduleForm({ onClose, onSuccess, schedule }: ScheduleFormProps) {
  const { macroGroups } = useMacros();
  const [name, setName] = useState(schedule?.name || '');
  const [macroId, setMacroId] = useState(schedule?.macro_id || '');
  const [frequencyType, setFrequencyType] = useState('minutes');
  const [frequencyValue, setFrequencyValue] = useState('5');
  const [schedHour, setSchedHour] = useState('9');
  const [schedMinute, setSchedMinute] = useState('0');
  const [schedDay, setSchedDay] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (schedule?.cron_expression) {
      const parsed = parseCron(schedule.cron_expression);
      if (parsed) {
        setFrequencyType(parsed.type);
        setFrequencyValue(parsed.value);
        setSchedHour(parsed.hour);
        setSchedMinute(String(parsed.minute));
        setSchedDay(parsed.day);
      }
    }
  }, [schedule]);

  const buildCron = () => {
    const h = schedHour;
    const m = schedMinute;
    if (frequencyType === 'minutes') return `*/${frequencyValue} * * * *`;
    if (frequencyType === 'hours')   return `0 */${frequencyValue} * * *`;
    if (frequencyType === 'daily')   return `${m} ${h} * * *`;
    if (frequencyType === 'weekly')  return `${m} ${h} * * ${schedDay}`;
    return '* * * * *';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      name,
      macro_id: parseInt(macroId),
      cron_expression: buildCron(),
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
      if (response.ok) onSuccess();
    } catch (error) {
      console.error('Failed to save schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  const pad = (n: number) => String(n).padStart(2, '0');
  const to12H = (h: number) => {
    const period = h < 12 ? 'AM' : 'PM';
    const display = h % 12 === 0 ? 12 : h % 12;
    return `${display}:00 ${period}`;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          {/* Header */}
          <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
            <h2 className="text-xl font-bold text-white">{schedule ? 'Edit Schedule' : 'New Schedule'}</h2>
            <button onClick={onClose} type="button" className="text-zinc-500 hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256">
                <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"></path>
              </svg>
            </button>
          </div>

          <div className="p-8 space-y-6">
            {/* Name */}
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

            {/* Macro */}
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
                      <option key={macro.id} value={macro.id}>{macro.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Frequency type buttons */}
            <div className="space-y-4">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Frequency</label>
              <div className="grid grid-cols-4 gap-2">
                {['minutes', 'hours', 'daily', 'weekly'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFrequencyType(type)}
                    className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      frequencyType === type
                        ? 'bg-white text-black border-white'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>

              {/* Minutes / Hours interval */}
              {(frequencyType === 'minutes' || frequencyType === 'hours') && (
                <div className="flex items-center gap-4 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                  <span className="text-zinc-400 text-sm">Every</span>
                  <input
                    type="number"
                    min="1"
                    value={frequencyValue}
                    onChange={(e) => setFrequencyValue(e.target.value)}
                    className="w-16 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-center text-white focus:outline-none"
                  />
                  <span className="text-zinc-400 text-sm">{frequencyType}</span>
                </div>
              )}

              {/* Weekly: day-of-week picker */}
              {frequencyType === 'weekly' && (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Day of Week</label>
                  <div className="flex gap-1.5">
                    {DAYS.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => setSchedDay(d.value)}
                        className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-all ${
                          schedDay === d.value
                            ? 'bg-white text-black border-white'
                            : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-600'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Daily / Weekly: time picker */}
              {(frequencyType === 'daily' || frequencyType === 'weekly') && (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Time</label>
                  <div className="flex items-center gap-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                    <span className="text-zinc-400 text-sm">At</span>
                    <select
                      value={schedHour}
                      onChange={(e) => setSchedHour(e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-white focus:outline-none appearance-none"
                    >
                      {hours.map((h) => (
                        <option key={h} value={h}>{to12H(h).split(':')[0]} {to12H(h).split(' ')[1]}</option>
                      ))}
                    </select>
                    <span className="text-zinc-500 font-bold">:</span>
                    <select
                      value={schedMinute}
                      onChange={(e) => setSchedMinute(e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-white focus:outline-none appearance-none text-center"
                    >
                      {minutes.map((m) => (
                        <option key={m} value={m}>{pad(m)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Cron preview */}
              <div className="flex items-center gap-2 text-xs text-zinc-600">
                <span className="font-mono bg-zinc-950 px-2 py-1 rounded border border-zinc-800">{buildCron()}</span>
                <span>cron expression</span>
              </div>
            </div>
          </div>

          {/* Footer */}
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
