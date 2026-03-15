'use client';

import React from 'react';
import { Menu } from 'lucide-react';

export default function Titlebar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-zinc-200 bg-white/80 px-4 backdrop-blur-md dark:border-zinc-800 dark:bg-black/80 lg:px-8">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="rounded-md p-2 text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900 lg:hidden"
          aria-label="Toggle Menu"
        >
          <Menu className="h-6 w-6" />
        </button>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white lg:text-2xl">
          Dashboard
        </h1>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Placeholder for future actions like user profile or notifications */}
        <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800"></div>
      </div>
    </header>
  );
}
