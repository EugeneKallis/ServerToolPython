'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

interface TerminalContextType {
  lines: string[];
  addSystemLine: (line: string) => void;
  clearLines: () => void;
  status: 'connected' | 'disconnected' | 'connecting';
}

const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<string[]>(['Initializing terminal...']);
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');
  const ws = useRef<WebSocket | null>(null);

  const connect = useCallback(function doConnect() {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/terminal`);

    socket.onopen = () => {
      console.log('Connected to terminal WebSocket');
      setStatus('connected');
      setLines(prev => [...prev, '[System] Connected to backend.']);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const prefix = data.command ? `[${data.command}]` : '[Agent]';
        
        if (data.status === 'started' || data.status === 'completed') {
           setLines(prev => [...prev, `${prefix} ${data.message}`]);
        } else if (data.message) {
          setLines(prev => [...prev, `${prefix} ${data.message}`]);
        } else if (data.error) {
          setLines(prev => [...prev, `${prefix} [Error] ${data.error}`]);
        } else {
          setLines(prev => [...prev, `[MissingData] ${event.data}`]);
        }
      } catch {
        setLines(prev => [...prev, `[Raw] ${event.data}`]);
      }
    };

    socket.onclose = () => {
      console.log('Disconnected from terminal WebSocket');
      setStatus('disconnected');
      setLines(prev => [...prev, '[System] Disconnected. Retrying in 5s...']);
      setTimeout(doConnect, 5000);
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      socket.close();
    };

    ws.current = socket;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      ws.current?.close();
    };
  }, [connect]);

  const addSystemLine = useCallback((line: string) => {
    setLines(prev => [...prev, `[System] ${line}`]);
  }, []);

  const clearLines = useCallback(() => {
    setLines([]);
  }, []);

  return (
    <TerminalContext.Provider value={{ lines, addSystemLine, clearLines, status }}>
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminal() {
  const context = useContext(TerminalContext);
  if (context === undefined) {
    throw new Error('useTerminal must be used within a TerminalProvider');
  }
  return context;
}
