'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

export interface AgentFeedItem {
  type: 'agent';
  id: number;
  command?: string;
  lines: string[];
  done: boolean;
  exitCode?: number;
}

export interface SystemFeedItem {
  type: 'system';
  id: number;
  text: string;
}

export type TerminalFeedItem = AgentFeedItem | SystemFeedItem;

interface TerminalContextType {
  lines: string[];
  feedItems: TerminalFeedItem[];
  addSystemLine: (line: string) => void;
  clearLines: () => void;
  status: 'connected' | 'disconnected' | 'connecting';
}

const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<string[]>(['Initializing terminal...']);
  const [feedItems, setFeedItems] = useState<TerminalFeedItem[]>([]);
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');
  const ws = useRef<WebSocket | null>(null);
  // Maps run_id (UUID from agent) → feed item id (Date.now() timestamp).
  // Allows concurrent macros on different agents to route messages to the
  // correct card independently, without a single "current" pointer.
  const runIdToFeedId = useRef<Map<string, number>>(new Map());

  const connect = useCallback(function doConnect() {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/terminal`);

    socket.onopen = () => {
      console.log('Connected to terminal WebSocket');
      setStatus('connected');
      setLines(prev => [...prev, '[System] Connected to backend.']);
      setFeedItems(prev => [...prev, { type: 'system', id: Date.now(), text: 'Connected to backend.' }]);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const runId: string | undefined = data.run_id;

        if (data.status === 'started') {
          setLines(prev => [...prev, `$ ${data.command}`]);
          const id = Date.now();
          if (runId) runIdToFeedId.current.set(runId, id);
          setFeedItems(prev => [...prev, { type: 'agent', id, command: data.command, lines: [], done: false }]);
        } else if (data.status === 'completed') {
          if (data.exit_code !== 0) {
            setLines(prev => [...prev, `✗ exit ${data.exit_code}`]);
          }
          const agentId = runId ? runIdToFeedId.current.get(runId) : undefined;
          if (agentId !== undefined) {
            setFeedItems(prev => prev.map(item =>
              item.type === 'agent' && item.id === agentId
                ? { ...item, done: true, exitCode: data.exit_code }
                : item
            ));
            if (runId) runIdToFeedId.current.delete(runId);
          }
        } else if (data.status === 'streaming') {
          const message = data.message || data.error;
          setLines(prev => [...prev, message]);
          const agentId = runId ? runIdToFeedId.current.get(runId) : undefined;
          if (agentId !== undefined) {
            setFeedItems(prev => prev.map(item =>
              item.type === 'agent' && item.id === agentId
                ? { ...item, lines: [...item.lines, message] }
                : item
            ));
          }
        } else if (data.status === 'error') {
          setLines(prev => [...prev, `[Error] ${data.error}`]);
          const agentId = runId ? runIdToFeedId.current.get(runId) : undefined;
          if (agentId !== undefined) {
            setFeedItems(prev => prev.map(item =>
              item.type === 'agent' && item.id === agentId
                ? { ...item, lines: [...item.lines, `[Error] ${data.error}`], done: true }
                : item
            ));
            if (runId) runIdToFeedId.current.delete(runId);
          }
        } else if (data.status === 'reset') {
          setLines(prev => [...prev, `[System] ${data.message}`]);
          setFeedItems(prev => [...prev, { type: 'system', id: Date.now(), text: data.message }]);
        } else {
          setLines(prev => [...prev, `[Agent] ${data.message || event.data}`]);
        }
      } catch {
        setLines(prev => [...prev, `[Raw] ${event.data}`]);
      }
    };

    socket.onclose = () => {
      console.log('Disconnected from terminal WebSocket');
      setStatus('disconnected');
      setLines(prev => [...prev, '[System] Disconnected. Retrying in 5s...']);
      setFeedItems(prev => [...prev, { type: 'system', id: Date.now(), text: 'Disconnected. Retrying in 5s...' }]);
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
    setFeedItems(prev => [...prev, { type: 'system', id: Date.now(), text: line }]);
  }, []);

  const clearLines = useCallback(() => {
    setLines([]);
    setFeedItems([]);
    runIdToFeedId.current.clear();
  }, []);

  return (
    <TerminalContext.Provider value={{ lines, feedItems, addSystemLine, clearLines, status }}>
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
