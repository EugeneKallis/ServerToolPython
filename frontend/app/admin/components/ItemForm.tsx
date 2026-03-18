'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';

interface ItemFormProps {
  title: string;
  fields: { name: string; label: string; placeholder?: string; type?: string; options?: { label: string; value: string }[] }[];
  initialValues?: Record<string, string>;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
  submitLabel?: string;
}

export function ItemForm({ title, fields, initialValues = {}, onSubmit, onCancel, submitLabel = "Save" }: ItemFormProps) {
  const [values, setValues] = useState<Record<string, string>>(
    fields.reduce((acc, field) => {
      acc[field.name] = initialValues[field.name] || '';
      return acc;
    }, {} as Record<string, string>)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(values);
  };

  const handleChange = (name: string, value: string) => {
    setValues(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button 
            onClick={onCancel}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((field) => (
            <div key={field.name} className="space-y-1">
              <label htmlFor={field.name} className="block text-sm font-medium text-zinc-300">
                {field.label}
              </label>
              {field.options ? (
                <select
                  id={field.name}
                  value={values[field.name]}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                >
                  <option value="" disabled>Select…</option>
                  {field.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={field.name}
                  type={field.type || "text"}
                  value={values[field.name]}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              )}
            </div>
          ))}

          <div className="mt-6 flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
