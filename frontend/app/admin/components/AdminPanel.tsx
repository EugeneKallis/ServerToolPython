'use client';

import React, { useState, useEffect } from 'react';
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
import { Plus, ChevronLeft, CheckCircle2 } from 'lucide-react';
import { SortableListItem } from './SortableListItem';
import { ItemForm } from './ItemForm';
import { useMacros } from '../../context/MacroContext';

interface Command {
  id: number;
  command: string;
  ord: number;
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

export function AdminPanel() {
  const { macroGroups: groups, refreshMacros } = useMacros();
  const [selectedGroup, setSelectedGroup] = useState<MacroGroup | null>(null);
  const [selectedMacro, setSelectedMacro] = useState<Macro | null>(null);

  // Modals state
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<MacroGroup | null>(null);

  const [isMacroModalOpen, setIsMacroModalOpen] = useState(false);
  const [editingMacro, setEditingMacro] = useState<Macro | null>(null);

  const [isCommandModalOpen, setIsCommandModalOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<Command | null>(null);

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

  // Generic Reorder API Call
  // We send individual PATCH requests concurrently
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
      // Refresh to ensure everything matches backend
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

  // CRUD Operations
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

  return (
    <div className="flex flex-col h-full gap-6">
      
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
                    <SortableListItem
                      key={command.id}
                      id={command.id}
                      name={command.command}
                      onEdit={() => { setEditingCommand(command); setIsCommandModalOpen(true); }}
                      onDelete={() => handleDeleteCommand(command.id)}
                    />
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
