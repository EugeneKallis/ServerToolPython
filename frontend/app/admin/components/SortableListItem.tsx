'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Edit2, Trash2, ChevronRight } from 'lucide-react';

export interface SortableListItemProps {
  id: number | string;
  name: string;
  subtitle?: string;
  isActive?: boolean;
  onSelect?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function SortableListItem({ 
  id, 
  name, 
  subtitle, 
  isActive, 
  onSelect, 
  onEdit, 
  onDelete 
}: SortableListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex items-center justify-between rounded-lg border p-3 transition-colors ${
        isDragging 
          ? 'border-blue-500 bg-blue-500/10 shadow-lg' 
          : isActive
          ? 'border-blue-500/50 bg-blue-500/5'
          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
      }`}
    >
      <div className="flex flex-1 items-center gap-3 overflow-hidden">
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab text-zinc-500 hover:text-zinc-300 focus:outline-none"
        >
          <GripVertical size={18} />
        </div>
        
        {/* Content (Clickable if onSelect provided) */}
        <div 
          className={`flex-1 overflow-hidden ${onSelect ? 'cursor-pointer' : ''}`}
          onClick={onSelect}
        >
          <h4 className="truncate font-medium text-zinc-100">{name}</h4>
          {subtitle && (
            <p className="truncate text-xs text-zinc-400">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-blue-400"
          title="Edit"
        >
          <Edit2 size={16} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-red-400"
          title="Delete"
        >
          <Trash2 size={16} />
        </button>
        {onSelect && (
          <div className="ml-1 text-zinc-600">
            <ChevronRight size={18} />
          </div>
        )}
      </div>
    </div>
  );
}
