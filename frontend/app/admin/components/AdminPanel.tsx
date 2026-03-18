'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus, ChevronLeft, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { SortableListItem } from './SortableListItem';
import { ItemForm } from './ItemForm';
import { useMacros } from '../../context/MacroContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CommandArgument {
  id: number;
  arg_name: string;
  arg_value: string;
}

interface Command {
  id: number;
  command: string;
  ord: number;
  arguments: CommandArgument[];
}

interface Macro {
  id: number;
  name: string;
  ord: number;
  commands: Command[];
}

interface MacroGroup {
  id: number;
  name: string;
  ord: number;
  macros: Macro[];
}

interface ArrInstance {
  id: number;
  name: string;
  type: string;
  url: string;
  api_key: string;
  enabled: boolean;
}

// ─── ArrInstances sub-panel ──────────────────────────────────────────────────

function ArrInstancesPanel({ showSuccess }: { showSuccess: (m: string) => void }) {
  const [instances, setInstances] = useState<ArrInstance[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<ArrInstance | null>(null);

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/arr-instances');
    if (res.ok) setInstances(await res.json());
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
    showSuccess(isEditing ? 'Instance updated.' : 'Instance created.');
  };

  const handleImport = async () => {
    // Split into groups separated by blank lines, filter empty
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
        console.warn(`Skipping '${name}': could not determine type (no 'radarr' or 'sonarr' in name).`);
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
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        console.warn(`Failed to import '${name}': ${err.detail}`);
        skipped++;
      }
    }

    setImporting(false);
    setImportText('');
    setShowImport(false);
    await refresh();
    showSuccess(`Imported ${created} instance(s)${skipped ? `, ${skipped} skipped` : ''}.`);
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
    showSuccess('Instance deleted.');
  };

  const typeColor = (type: string) =>
    type === 'radarr' ? 'text-yellow-400 bg-yellow-500/10' : 'text-blue-400 bg-blue-500/10';

  return (
    <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Arr Instances</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport((v) => !v)}
            className="flex items-center text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded"
          >
            {showImport ? 'Cancel Import' : '↓ Bulk Import'}
          </button>
          <button
            onClick={() => { setEditingInstance(null); setIsModalOpen(true); }}
            className="flex items-center text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-1 rounded"
          >
            <Plus size={14} className="mr-1" /> Add Instance
          </button>
        </div>
      </div>

      {/* Bulk import section */}
      {showImport && (
        <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 space-y-2">
          <p className="text-xs text-zinc-400">
            Paste groups of <span className="text-zinc-200 font-medium">name / URL / API key</span> separated by a blank line.
            Type is auto-detected from the name (<code className="text-yellow-400">radarr</code> or <code className="text-blue-400">sonarr</code>).
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={10}
            placeholder={`radarr\nhttp://192.168.1.111:7878\nyour-api-key\n\nsonarr\nhttp://192.168.1.111:8989\nyour-api-key`}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
          />
          <div className="flex justify-end">
            <button
              onClick={handleImport}
              disabled={importing || !importText.trim()}
              className="px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {importing ? 'Importing…' : 'Import All'}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pr-1 space-y-2">
        {instances.length === 0 && (
          <p className="text-zinc-500 text-sm mt-4 text-center">No arr instances configured.</p>
        )}
        {instances.map((inst) => (
          <div
            key={inst.id}
            className="flex items-center justify-between rounded-lg bg-zinc-800/60 border border-zinc-700/50 px-3 py-2.5 gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${typeColor(inst.type)}`}>
                {inst.type}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-100 truncate">{inst.name}</p>
                <p className="text-xs text-zinc-500 truncate">{inst.url}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Enabled toggle */}
              <button
                onClick={() => handleToggleEnabled(inst)}
                title={inst.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                className={`w-8 h-4 rounded-full transition-colors relative ${inst.enabled ? 'bg-emerald-500' : 'bg-zinc-600'}`}
              >
                <span
                  className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${inst.enabled ? 'left-4' : 'left-0.5'}`}
                />
              </button>
              <button
                onClick={() => { setEditingInstance(inst); setIsModalOpen(true); }}
                className="text-zinc-400 hover:text-blue-400 p-1 rounded hover:bg-zinc-700"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => handleDelete(inst.id)}
                className="text-zinc-400 hover:text-red-400 p-1 rounded hover:bg-zinc-700"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
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

// ─── Main AdminPanel ─────────────────────────────────────────────────────────

export function AdminPanel() {
  const { macroGroups: groups, refreshMacros } = useMacros();
  const [selectedGroup, setSelectedGroup] = useState<MacroGroup | null>(null);
  const [selectedMacro, setSelectedMacro] = useState<Macro | null>(null);

  // Top-level tab
  const [activeTab, setActiveTab] = useState<'macros' | 'arr'>('macros');

  // Modals state
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<MacroGroup | null>(null);

  const [isMacroModalOpen, setIsMacroModalOpen] = useState(false);
  const [editingMacro, setEditingMacro] = useState<Macro | null>(null);

  const [isCommandModalOpen, setIsCommandModalOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<Command | null>(null);

  const [isArgModalOpen, setIsArgModalOpen] = useState(false);
  const [addingArgToCommand, setAddingArgToCommand] = useState<number | null>(null);

  const [view, setView] = useState<'groups' | 'macros' | 'commands'>('groups');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleBackToGroups = () => setView('groups');
  const handleBackToMacros = () => setView('macros');

  useEffect(() => {
    if (selectedGroup) {
      const updatedGroup = groups.find((g: MacroGroup) => g.id === selectedGroup.id);
      setSelectedGroup(updatedGroup || null);
      if (selectedMacro && updatedGroup) {
        const updatedMacro = updatedGroup.macros.find((m: Macro) => m.id === selectedMacro.id);
        setSelectedMacro(updatedMacro || null);
      } else if (selectedMacro) {
        setSelectedMacro(null);
      }
    }
  }, [groups, selectedGroup, selectedMacro]);

  const updateOrder = async (endpoint: string, items: { id: number | string }[]) => {
    try {
      await Promise.all(
        items.map((item, index) =>
          fetch(`/api/${endpoint}/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ord: index }),
          })
        )
      );
      refreshMacros();
    } catch (err) {
      console.error('Failed to update order', err);
    }
  };

  const handleDragEndGroups = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
        const oldIndex = groups.findIndex((i) => i.id === active.id);
        const newIndex = groups.findIndex((i) => i.id === over.id);
        const newItems = arrayMove(groups, oldIndex, newIndex);
        updateOrder('macro-groups', newItems);
    }
  };

  const handleDragEndMacros = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && selectedGroup) {
      const oldIndex = selectedGroup.macros.findIndex((i) => i.id === active.id);
      const newIndex = selectedGroup.macros.findIndex((i) => i.id === over.id);
      const newMacros = arrayMove(selectedGroup.macros, oldIndex, newIndex);
      updateOrder('macros', newMacros);
    }
  };

  const handleDragEndCommands = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && selectedMacro) {
      const oldIndex = selectedMacro.commands.findIndex((i) => i.id === active.id);
      const newIndex = selectedMacro.commands.findIndex((i) => i.id === over.id);
      const newCommands = arrayMove(selectedMacro.commands, oldIndex, newIndex);
      updateOrder('commands', newCommands);
    }
  };

  const handleSaveGroup = async (values: Record<string, string>) => {
    const isEditing = !!editingGroup;
    const method = isEditing ? 'PATCH' : 'POST';
    const url = isEditing ? `/api/macro-groups/${editingGroup.id}` : '/api/macro-groups';
    const body = { 
      name: values.name, 
      ord: isEditing ? editingGroup.ord : groups.length 
    };

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    setIsGroupModalOpen(false);
    setEditingGroup(null);
    refreshMacros();
    showSuccess(isEditing ? 'Macro Group updated successfully.' : 'Macro Group created successfully.');
  };

  const handleDeleteGroup = async (id: number) => {
    if (confirm('Are you sure you want to delete this Macro Group?')) {
      await fetch(`/api/macro-groups/${id}`, { method: 'DELETE' });
      if (selectedGroup?.id === id) setSelectedGroup(null);
      refreshMacros();
      showSuccess('Macro Group deleted successfully.');
    }
  };

  const handleSaveMacro = async (values: Record<string, string>) => {
    if (!selectedGroup) return;
    
    const isEditing = !!editingMacro;
    const method = isEditing ? 'PATCH' : 'POST';
    const url = isEditing ? `/api/macros/${editingMacro.id}` : '/api/macros';
    const body = { 
      name: values.name, 
      macro_group_id: selectedGroup.id,
      ord: isEditing ? editingMacro.ord : selectedGroup.macros.length
    };

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    setIsMacroModalOpen(false);
    setEditingMacro(null);
    refreshMacros();
    showSuccess(isEditing ? 'Macro updated successfully.' : 'Macro created successfully.');
  };

  const handleDeleteMacro = async (id: number) => {
    if (confirm('Are you sure you want to delete this Macro?')) {
      await fetch(`/api/macros/${id}`, { method: 'DELETE' });
      if (selectedMacro?.id === id) setSelectedMacro(null);
      refreshMacros();
      showSuccess('Macro deleted successfully.');
    }
  };

  const handleSaveCommand = async (values: Record<string, string>) => {
    if (!selectedMacro) return;

    const isEditing = !!editingCommand;
    const method = isEditing ? 'PATCH' : 'POST';
    const url = isEditing ? `/api/commands/${editingCommand.id}` : '/api/commands';
    const body = { 
      command: values.command,
      macro_id: selectedMacro.id,
      ord: isEditing ? editingCommand.ord : selectedMacro.commands.length
    };

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    setIsCommandModalOpen(false);
    setEditingCommand(null);
    refreshMacros();
    showSuccess(isEditing ? 'Command updated successfully.' : 'Command created successfully.');
  };

  const handleDeleteCommand = async (id: number) => {
    if (confirm('Are you sure you want to delete this Command?')) {
      await fetch(`/api/commands/${id}`, { method: 'DELETE' });
      refreshMacros();
      showSuccess('Command deleted successfully.');
    }
  };

  const handleSaveArgument = async (values: Record<string, string>) => {
    if (!addingArgToCommand) return;
    
    await fetch(`/api/commands/${addingArgToCommand}/arguments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        arg_name: values.arg_name,
        arg_value: values.arg_value,
      }),
    });

    setIsArgModalOpen(false);
    setAddingArgToCommand(null);
    refreshMacros();
    showSuccess('Optional argument added.');
  };

  const handleDeleteArgument = async (id: number) => {
    if (!confirm('Delete this optional argument?')) return;
    await fetch(`/api/commands/arguments/${id}`, { method: 'DELETE' });
    refreshMacros();
    showSuccess('Argument deleted.');
  };

  return (
    <div className="flex flex-col h-full gap-4 p-4">

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-zinc-800 pb-3">
        {(['macros', 'arr'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs font-semibold rounded uppercase tracking-wider transition-colors ${
              activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            {tab === 'macros' ? 'Macro Groups' : 'Arr Instances'}
          </button>
        ))}
      </div>

      {/* ── Arr Instances Tab ── */}
      {activeTab === 'arr' && (
        <ArrInstancesPanel showSuccess={showSuccess} />
      )}

      {/* ── Macros Tab ── */}
      {activeTab === 'macros' && (
        <div className="flex flex-col flex-1 gap-6 min-h-0">

          {/* Groups Panel */}
          {view === 'groups' && (
            <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Macro Groups</h2>
                <button 
                  onClick={() => { setEditingGroup(null); setIsGroupModalOpen(true); }}
                  className="flex items-center text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-1 rounded"
                >
                  <Plus size={14} className="mr-1" /> Add Group
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndGroups}>
                  <SortableContext items={groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
                    {groups.map((group) => (
                      <SortableListItem
                        key={group.id}
                        id={group.id}
                        name={group.name}
                        subtitle={`${group.macros.length} macro(s)`}
                        isActive={selectedGroup?.id === group.id}
                        onSelect={() => { 
                          setSelectedGroup(group); 
                          setSelectedMacro(null);
                          setView('macros');
                        }}
                        onEdit={() => { setEditingGroup(group); setIsGroupModalOpen(true); }}
                        onDelete={() => handleDeleteGroup(group.id)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                {groups.length === 0 && <p className="text-zinc-500 text-sm mt-4 text-center">No Macro Groups created.</p>}
              </div>
            </div>
          )}

          {/* Macros Panel */}
          {view === 'macros' && (
            <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex flex-col h-full opacity-100 transition-opacity">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button onClick={handleBackToGroups} className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800">
                    <ChevronLeft size={18} />
                  </button>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                    {selectedGroup ? `Macros in ${selectedGroup.name}` : 'Select a Group'}
                  </h2>
                </div>
                {selectedGroup && (
                  <button 
                    onClick={() => { setEditingMacro(null); setIsMacroModalOpen(true); }}
                    className="flex items-center text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-1 rounded"
                  >
                    <Plus size={14} className="mr-1" /> Add Macro
                  </button>
                )}
              </div>

              {!selectedGroup ? (
                <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
                  Select a Macro Group to view its Macros.
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndMacros}>
                    <SortableContext items={selectedGroup.macros.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                      {selectedGroup.macros.map((macro) => (
                        <SortableListItem
                          key={macro.id}
                          id={macro.id}
                          name={macro.name}
                          subtitle={`${macro.commands.length} command(s)`}
                          isActive={selectedMacro?.id === macro.id}
                          onSelect={() => {
                            setSelectedMacro(macro);
                            setView('commands');
                          }}
                          onEdit={() => { setEditingMacro(macro); setIsMacroModalOpen(true); }}
                          onDelete={() => handleDeleteMacro(macro.id)}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                  {selectedGroup.macros.length === 0 && <p className="text-zinc-500 text-sm mt-4 text-center">No Macros in this Group.</p>}
                </div>
              )}
            </div>
          )}

          {/* Commands Panel */}
          {view === 'commands' && (
            <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button onClick={handleBackToMacros} className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800">
                    <ChevronLeft size={18} />
                  </button>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                    {selectedMacro ? `Commands in ${selectedMacro.name}` : 'Select a Macro'}
                  </h2>
                </div>
                {selectedMacro && (
                  <button 
                    onClick={() => { setEditingCommand(null); setIsCommandModalOpen(true); }}
                    className="flex items-center text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-1 rounded"
                  >
                    <Plus size={14} className="mr-1" /> Add Command
                  </button>
                )}
              </div>

              {!selectedMacro ? (
                <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
                  Select a Macro to view its Commands.
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndCommands}>
                    <SortableContext items={selectedMacro.commands.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                      {selectedMacro.commands.map((command) => (
                        <div key={command.id} className="space-y-1">
                          <SortableListItem
                            id={command.id}
                            name={command.command}
                            onEdit={() => { setEditingCommand(command); setIsCommandModalOpen(true); }}
                            onDelete={() => handleDeleteCommand(command.id)}
                          />
                          
                          {/* Arguments list */}
                          <div className="ml-12 flex flex-wrap gap-2 mb-2">
                            {command.arguments?.map(arg => (
                              <div key={arg.id} className="group flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800 border border-zinc-700/50 text-[11px]">
                                <span className="text-zinc-500 font-medium">{arg.arg_name}:</span>
                                <code className="text-zinc-300">{arg.arg_value}</code>
                                <button 
                                  onClick={() => handleDeleteArgument(arg.id)}
                                  className="ml-1 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-opacity"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}
                            <button 
                              onClick={() => { setAddingArgToCommand(command.id); setIsArgModalOpen(true); }}
                              className="flex items-center gap-1 px-2 py-1 rounded border border-dashed border-zinc-700 text-[11px] text-zinc-500 hover:text-blue-400 hover:border-blue-500/50 transition-colors"
                            >
                              <Plus size={12} /> Add Arg
                            </button>
                          </div>
                        </div>
                      ))}
                    </SortableContext>
                  </DndContext>
                  {selectedMacro.commands.length === 0 && <p className="text-zinc-500 text-sm mt-4 text-center">No Commands in this Macro.</p>}
                </div>
              )}
            </div>
          )}

          {/* Modals */}
          {isGroupModalOpen && (
            <ItemForm
              title={editingGroup ? "Edit Macro Group" : "New Macro Group"}
              fields={[{ name: 'name', label: 'Group Name', placeholder: 'e.g. System Tools' }]}
              initialValues={editingGroup ? { name: editingGroup.name } : {}}
              onSubmit={handleSaveGroup}
              onCancel={() => { setIsGroupModalOpen(false); setEditingGroup(null); }}
            />
          )}

          {isMacroModalOpen && (
            <ItemForm
              title={editingMacro ? "Edit Macro" : "New Macro"}
              fields={[{ name: 'name', label: 'Macro Name', placeholder: 'e.g. Restart Docker' }]}
              initialValues={editingMacro ? { name: editingMacro.name } : {}}
              onSubmit={handleSaveMacro}
              onCancel={() => { setIsMacroModalOpen(false); setEditingMacro(null); }}
            />
          )}

          {isCommandModalOpen && (
            <ItemForm
              title={editingCommand ? "Edit Command" : "New Command"}
              fields={[
                { name: 'command', label: 'Shell Command', placeholder: 'e.g. docker restart nginx' }
              ]}
              initialValues={editingCommand ? { command: editingCommand.command } : {}}
              onSubmit={handleSaveCommand}
              onCancel={() => { setIsCommandModalOpen(false); setEditingCommand(null); }}
            />
          )}

          {isArgModalOpen && (
            <ItemForm
              title="Add Optional Argument"
              fields={[
                { name: 'arg_name', label: 'Display Name', placeholder: 'e.g. Force' },
                { name: 'arg_value', label: 'Argument Value', placeholder: 'e.g. --force' }
              ]}
              onSubmit={handleSaveArgument}
              onCancel={() => { setIsArgModalOpen(false); setAddingArgToCommand(null); }}
            />
          )}

        </div>
      )}

      {/* Toast Notification */}
      {successMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-emerald-500/90 backdrop-blur-sm px-4 py-3 text-sm font-semibold text-white shadow-lg border border-emerald-400/20 transition-all duration-300">
          <CheckCircle2 size={18} />
          {successMessage}
        </div>
      )}

    </div>
  );
}
