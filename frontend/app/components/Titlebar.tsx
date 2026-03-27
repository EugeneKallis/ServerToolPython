'use client';

import React from 'react';
import { Menu } from 'lucide-react';

export default function Titlebar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface-container-low px-4 lg:px-8">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary-fixed lg:hidden"
          aria-label="Toggle Menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
