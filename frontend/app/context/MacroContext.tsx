'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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

interface MacroContextType {
  macroGroups: MacroGroup[];
  loading: boolean;
  refreshMacros: () => Promise<void>;
}

const MacroContext = createContext<MacroContextType | undefined>(undefined);

export function MacroProvider({ children }: { children: React.ReactNode }) {
  const [macroGroups, setMacroGroups] = useState<MacroGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshMacros = useCallback(async () => {
    try {
      const response = await fetch('/api/macro-groups');
      if (response.ok) {
        const data = await response.json();
        // Sort macro groups by ord
        const sortedData = data.sort((a: MacroGroup, b: MacroGroup) => a.ord - b.ord);
        // Sort macros within each group by ord
        sortedData.forEach((group: MacroGroup) => {
          group.macros.sort((a: Macro, b: Macro) => a.ord - b.ord);
          group.macros.forEach((macro: Macro) => {
            macro.commands.sort((a: Command, b: Command) => a.ord - b.ord);
          });
        });
        setMacroGroups(sortedData);
      }
    } catch (error) {
      console.error('Failed to fetch macro groups:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMacros();
  }, [refreshMacros]);

  return (
    <MacroContext.Provider value={{ macroGroups, loading, refreshMacros }}>
      {children}
    </MacroContext.Provider>
  );
}

export function useMacros() {
  const context = useContext(MacroContext);
  if (context === undefined) {
    throw new Error('useMacros must be used within a MacroProvider');
  }
  return context;
}
