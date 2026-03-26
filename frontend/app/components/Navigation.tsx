'use client';

import React, { useState } from 'react';
import Sidebar from './Sidebar';

export default function Navigation({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

      <main className="flex flex-1 min-h-0 overflow-hidden min-w-0 lg:pl-64 relative bg-zinc-50 dark:bg-zinc-950">
        {children}
      </main>
    </div>
  );
}
