'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Pencil, RefreshCw, ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { ItemForm } from '../../admin/components/ItemForm';

interface ArrInstance {
  id: number;
  name: string;
  type: string;
  url: string;
  api_key: string;
  enabled: boolean;
}

export default function ArrSearcherPage() {
  const [instances, setInstances] = useState<ArrInstance[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Settings dropdown state
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Form modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<ArrInstance | null>(null);

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  // Global search load state
  const [searchingAll, setSearchingAll] = useState(false);
  const [searchingId, setSearchingId] = useState<number | null>(null);
  
  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/arr-instances');
    if (res.ok) setInstances(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleSave = async (values: Record<string, string>) => {
    const isEditing = !!editingInstance;
    const url = isEditing ? `/api/arr-instances/${editingInstance.id}` : '/api/arr-instances';
    const method = isEditing ? 'PUT' : 'POST';
    const body = {
      name: values.name,
      type: values.type,
      url: values.url,
      api_key: values.api_key,
      enabled: true,
    };

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Error: ${err.detail ?? res.statusText}`);
      return;
    }

    setIsModalOpen(false);
    setEditingInstance(null);
    await refresh();
    showToast(isEditing ? 'Instance updated.' : 'Instance created.');
  };

  const handleImport = async () => {
    const groups = importText
      .split(/\n\s*\n/)
      .map((g) => g.trim().split('\n').map((l) => l.trim()).filter(Boolean))
      .filter((g) => g.length === 3);

    if (groups.length === 0) {
      alert('No valid groups found. Each group needs exactly 3 lines: name, URL, API key.');
      return;
    }

    setImporting(true);
    let created = 0;
    let skipped = 0;

    for (const [name, url, api_key] of groups) {
      const nameLower = name.toLowerCase();
      const type = nameLower.includes('radarr') ? 'radarr'
                 : nameLower.includes('sonarr') ? 'sonarr'
                 : null;

      if (!type) {
        skipped++;
        continue;
      }

      const res = await fetch('/api/arr-instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, url, api_key, enabled: true }),
      });

      if (res.ok) {
        created++;
      } else {
        skipped++;
      }
    }

    setImporting(false);
    setImportText('');
    setShowImport(false);
    await refresh();
    showToast(`Imported ${created} instance(s)${skipped ? `, ${skipped} skipped` : ''}.`);
  };

  const handleToggleEnabled = async (inst: ArrInstance) => {
    await fetch(`/api/arr-instances/${inst.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !inst.enabled }),
    });
    await refresh();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this instance?')) return;
    await fetch(`/api/arr-instances/${id}`, { method: 'DELETE' });
    await refresh();
    showToast('Instance deleted.');
  };

  const handleSearchAll = async () => {
    setSearchingAll(true);
    const res = await fetch('/api/arr-instances/search_all', { method: 'POST' });
    if (res.ok) {
      showToast('Global missing search triggered.');
    } else {
      showToast('Error triggering search.');
    }
    setSearchingAll(false);
  };

  const handleSearchInstance = async (id: number) => {
    setSearchingId(id);
    const res = await fetch(`/api/arr-instances/${id}/search`, { method: 'POST' });
    if (res.ok) {
      showToast('Instance missing search triggered.');
    } else {
      showToast('Error triggering search.');
    }
    setSearchingId(null);
  };

  const typeColor = (type: string) =>
    type === 'radarr' ? 'text-yellow-400 bg-yellow-500/10' : 'text-blue-400 bg-blue-500/10';

  return (
    <div className="flex flex-col w-full h-full bg-surface-dim text-on-surface">
      {/* Header */}
      <div className="shrink-0 border-b border-outline-variant bg-surface-dim relative z-10">
        <div className="flex items-center justify-between px-4 lg:px-6 pt-5 pb-4">
          <h1 className="font-headline font-bold text-sm uppercase tracking-[0.15em] text-on-surface">Arr Searcher</h1>
          <button
            onClick={handleSearchAll}
            disabled={searchingAll || instances.length === 0}
            className="flex items-center gap-1.5 text-xs font-mono font-semibold bg-primary-fixed-dim text-on-primary-fixed px-4 py-2 hover:bg-primary-container transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw size={14} className={searchingAll ? 'animate-spin' : ''} />
            {searchingAll ? 'Triggering...' : 'Search All Missing'}
          </button>
        </div>
      </div>

      {toast && (
        <div className="mx-4 mt-4 px-4 py-3 bg-primary-fixed-dim/10 text-primary-fixed-dim border border-primary-fixed-dim text-xs font-mono text-center">
          {toast}
        </div>
      )}

      {/* Main content scroll */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
        
        {/* Settings collapsible */}
        <div className="border border-outline-variant bg-surface-container">
          <button
            onClick={() => setSettingsOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-container-high transition-colors"
          >
            <div className="flex items-center gap-2">
              <Settings size={14} className="text-outline" />
              <h2 className="text-[10px] font-mono font-bold uppercase tracking-[0.15em] text-outline">Configuration & Instances</h2>
            </div>
            {settingsOpen ? <ChevronDown size={14} className="text-outline" /> : <ChevronRight size={14} className="text-outline" />}
          </button>
          
          {settingsOpen && (
            <div className="p-4 border-t border-outline-variant flex flex-col gap-4 bg-surface-container-low">
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowImport(v => !v)}
                  className="flex items-center text-xs font-mono text-on-surface-variant hover:text-on-surface bg-surface-container-high hover:bg-surface-container-highest px-3 py-1.5 border border-outline-variant transition-colors"
                >
                  {showImport ? 'Cancel Import' : '↓ Bulk Import'}
                </button>
                <button
                  onClick={() => { setEditingInstance(null); setIsModalOpen(true); }}
                  className="flex items-center text-xs font-mono text-primary-fixed hover:text-primary-container bg-surface-container-high hover:bg-surface-container-highest px-3 py-1.5 border border-outline-variant transition-colors"
                >
                  <Plus size={14} className="mr-1" /> Add Instance
                </button>
              </div>

              {showImport && (
                <div className="border border-outline-variant bg-surface-container p-3 space-y-2">
                  <p className="text-xs text-zinc-400">
                    Paste groups of <span className="text-zinc-200 font-medium">name / URL / API key</span> separated by a blank line.
                    Type is auto-detected from the name (<code className="text-yellow-400">radarr</code> or <code className="text-blue-400">sonarr</code>).
                  </p>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={8}
                    className="w-full border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder-outline font-mono focus:border-primary-fixed-dim focus:outline-none resize-y"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleImport}
                      disabled={importing || !importText.trim()}
                      className="px-4 py-2 text-xs font-mono bg-primary-fixed-dim text-on-primary-fixed hover:bg-primary-container disabled:opacity-40 transition-colors"
                    >
                      {importing ? 'Importing…' : 'Import All'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Instances list */}
        <div className="space-y-3">
          {loading && instances.length === 0 && (
            <p className="text-outline text-xs font-mono text-center py-10">Loading instances...</p>
          )}
          {!loading && instances.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-16 border border-dashed border-outline-variant bg-surface-container-low text-outline">
              <p className="text-xs font-mono uppercase tracking-wider">No instances configured</p>
              <button
                onClick={() => { setSettingsOpen(true); setIsModalOpen(true); }}
                className="flex items-center text-xs font-mono text-primary-fixed border border-primary-fixed/30 px-4 py-2 hover:bg-primary-fixed/10 transition-colors"
              >
                <Plus size={14} className="mr-2" /> Add Your First Instance
              </button>
            </div>
          )}

          {instances.map(inst => (
            <div
              key={inst.id}
              className={`flex flex-col sm:flex-row items-start sm:items-center justify-between bg-surface-container border border-outline-variant p-4 gap-4 transition-opacity ${!inst.enabled ? 'opacity-50 grayscale' : ''}`}
            >
              <div className="flex items-center gap-4 min-w-0">
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded tracking-wider shrink-0 ${typeColor(inst.type)}`}>
                  {inst.type}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate tracking-wide">{inst.name}</p>
                  <p className="text-xs text-on-surface-variant truncate mt-0.5">{inst.url}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0 pt-3 sm:pt-0 border-t border-outline-variant sm:border-0 pl-0 sm:pl-4">
                <button
                  onClick={() => handleSearchInstance(inst.id)}
                  disabled={searchingId === inst.id || !inst.enabled}
                  className="mr-auto sm:mr-0 flex items-center gap-1.5 text-xs font-mono text-on-surface-variant hover:text-on-surface bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant px-3 py-1.5 disabled:opacity-40 transition-colors"
                >
                  <RefreshCw size={12} className={searchingId === inst.id ? 'animate-spin' : ''}/>
                  <span className="hidden sm:inline">Search</span> Missing
                </button>
                
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => handleToggleEnabled(inst)}
                    title={inst.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                    className={`w-9 h-5 rounded-full transition-colors relative ${inst.enabled ? 'bg-emerald-500/80' : 'bg-surface-container-highest border border-outline-variant'}`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${inst.enabled ? 'left-[18px]' : 'left-0.5 bg-outline shadow-sm'}`}
                    />
                  </button>
                  <div className="w-px h-6 bg-outline-variant hidden sm:block"></div>
                  <button
                    onClick={() => { setEditingInstance(inst); setIsModalOpen(true); settingsOpen || setSettingsOpen(true); }}
                    className="text-outline hover:text-primary-fixed hover:bg-surface-container-high p-1.5 rounded transition-colors"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(inst.id)}
                    className="text-outline hover:text-error hover:bg-error-container/10 p-1.5 rounded transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isModalOpen && (
        <ItemForm
          title={editingInstance ? 'Edit Instance' : 'New Arr Instance'}
          fields={[
            { name: 'name', label: 'Name', placeholder: 'e.g. Radarr (Main)' },
            { name: 'type', label: 'Type', options: [{ label: 'Radarr', value: 'radarr' }, { label: 'Sonarr', value: 'sonarr' }] },
            { name: 'url', label: 'URL', placeholder: 'http://192.168.1.10:7878' },
            { name: 'api_key', label: 'API Key', placeholder: 'your-api-key' },
          ]}
          initialValues={editingInstance ? {
            name: editingInstance.name,
            type: editingInstance.type,
            url: editingInstance.url,
            api_key: editingInstance.api_key,
          } : {}}
          onSubmit={handleSave}
          onCancel={() => { setIsModalOpen(false); setEditingInstance(null); }}
        />
      )}
    </div>
  );
}
