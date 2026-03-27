'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Bot, User, Settings, ChevronDown, Plus, Trash2, MessageSquare } from 'lucide-react';

interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  id: number;
  title: string;
  model: string;
  updated_at: string;
  messages: Message[];
}

export default function ChatPage() {
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [urlInput, setUrlInput] = useState('http://localhost:11434');
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState('');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const saved = localStorage.getItem('ollama_url');
    if (saved) { setOllamaUrl(saved); setUrlInput(saved); fetchModels(saved); }
    else fetchModels(ollamaUrl);
    loadConversations();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // ── Ollama ────────────────────────────────────────────────────────────────

  const fetchModels = async (url: string) => {
    setError('');
    try {
      const res = await fetch(`${url}/api/tags`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const names: string[] = (data.models ?? []).map((m: { name: string }) => m.name);
      setModels(names);
      if (names.length > 0) setSelectedModel(prev => prev || names[0]);
    } catch {
      setError(`Could not connect to Ollama at ${url}.`);
      setModels([]);
    }
  };

  const handleSaveUrl = () => {
    const trimmed = urlInput.trim().replace(/\/$/, '');
    setOllamaUrl(trimmed);
    localStorage.setItem('ollama_url', trimmed);
    setShowSettings(false);
    fetchModels(trimmed);
  };

  // ── Conversations API ─────────────────────────────────────────────────────

  const loadConversations = async () => {
    const res = await fetch('/api/chat/conversations');
    if (res.ok) setConversations(await res.json());
  };

  const selectConversation = (conv: Conversation) => {
    setActiveConv(conv);
    setMessages(conv.messages);
    setSelectedModel(conv.model);
  };

  const newChat = () => {
    setActiveConv(null);
    setMessages([]);
  };

  const deleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/chat/conversations/${id}`, { method: 'DELETE' });
    if (activeConv?.id === id) newChat();
    await loadConversations();
  };

  // ── Sending messages ──────────────────────────────────────────────────────

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isStreaming || !selectedModel) return;

    setInput('');
    setIsStreaming(true);
    setError('');

    const userMsg: Message = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages([...history, { role: 'assistant', content: '' }]);

    // Create conversation on first message
    let conv = activeConv;
    if (!conv) {
      const title = text.slice(0, 60);
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, model: selectedModel }),
      });
      if (res.ok) {
        conv = await res.json();
        setActiveConv(conv!);
        await loadConversations();
      }
    }

    // Save user message
    if (conv) {
      await fetch(`/api/chat/conversations/${conv.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', content: text }),
      });
    }

    // Stream from Ollama
    let assistantContent = '';
    try {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, messages: history, stream: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              assistantContent += parsed.message.content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (e) {
      setError(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setMessages(prev => prev.slice(0, -1));
      setIsStreaming(false);
      return;
    }

    // Save assistant message
    if (conv && assistantContent) {
      await fetch(`/api/chat/conversations/${conv.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'assistant', content: assistantContent }),
      });
      await loadConversations();
    }

    setIsStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full bg-zinc-950 text-zinc-100">

      {/* Conversation list */}
      <div className="w-56 flex-shrink-0 flex flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="p-3 border-b border-zinc-800">
          <button
            onClick={newChat}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <Plus className="h-4 w-4" /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => selectConversation(conv)}
              className={`group w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                activeConv?.id === conv.id
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate text-xs">{conv.title}</span>
              </div>
              <button
                onClick={(e) => deleteConversation(conv.id, e)}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-500 hover:text-red-400 transition-opacity flex-shrink-0"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </button>
          ))}
          {conversations.length === 0 && (
            <p className="px-3 py-4 text-xs text-zinc-600 text-center">No conversations yet</p>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-zinc-400" />
            <span className="font-semibold text-sm">Chat</span>
            {selectedModel && (
              <span className="rounded-full bg-zinc-800 px-3 py-0.5 text-xs text-zinc-400">
                {selectedModel}
              </span>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setShowSettings(v => !v)}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            >
              <Settings className="h-3.5 w-3.5" />
              Settings
              <ChevronDown className={`h-3 w-3 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
            </button>

            {showSettings && (
              <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl">
                <p className="mb-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Ollama URL</p>
                <input
                  type="text"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveUrl()}
                  placeholder="http://localhost:11434"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
                />
                <div className="mt-3 flex gap-2">
                  <button onClick={handleSaveUrl} className="flex-1 rounded-md bg-zinc-700 px-3 py-1.5 text-sm font-medium hover:bg-zinc-600 transition-colors">
                    Connect
                  </button>
                  <button onClick={() => setShowSettings(false)} className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                    Cancel
                  </button>
                </div>
                {models.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Model</p>
                    <select
                      value={selectedModel}
                      onChange={e => setSelectedModel(e.target.value)}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
                    >
                      {models.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="px-6 py-2 bg-red-950 border-b border-red-800 text-sm text-red-300">{error}</div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3">
              <Bot className="h-10 w-10" />
              <p className="text-sm">
                {selectedModel ? `Ask ${selectedModel} anything` : 'Connect to Ollama to get started'}
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-zinc-800 flex items-center justify-center mt-1">
                  <Bot className="h-4 w-4 text-zinc-400" />
                </div>
              )}
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-zinc-700 text-zinc-100 rounded-br-sm'
                  : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
              }`}>
                {msg.content}
                {msg.role === 'assistant' && isStreaming && i === messages.length - 1 && (
                  <span className="inline-block w-1.5 h-4 ml-0.5 bg-zinc-400 animate-pulse rounded-sm align-middle" />
                )}
              </div>
              {msg.role === 'user' && (
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-zinc-700 flex items-center justify-center mt-1">
                  <User className="h-4 w-4 text-zinc-300" />
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-zinc-800 bg-zinc-900 px-4 py-4">
          <div className="flex items-end gap-3 max-w-4xl mx-auto">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedModel ? `Message ${selectedModel}…` : 'Connect to Ollama first…'}
              disabled={!selectedModel || isStreaming}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none disabled:opacity-50 max-h-40 overflow-y-auto"
              style={{ minHeight: '44px' }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || !selectedModel || isStreaming}
              className="flex-shrink-0 rounded-xl bg-zinc-700 p-3 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-zinc-600">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  );
}
