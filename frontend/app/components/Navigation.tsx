'use client';

import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';

export default function Navigation({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="flex h-screen w-full overflow-hidden flex-col lg:flex-row">
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

      {/* Mobile top bar — hidden on desktop */}
      <header className="flex lg:hidden h-12 items-center px-4 border-b border-outline-variant bg-surface-container-low flex-shrink-0 z-30">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 rounded-md text-on-surface-variant hover:bg-surface-container-high transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      <main className="flex flex-1 min-h-0 overflow-hidden min-w-0 lg:pl-64 relative bg-surface-dim">
        {children}
      </main>
    </div>
  );
}

