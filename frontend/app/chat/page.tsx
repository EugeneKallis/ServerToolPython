'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Settings, ChevronDown } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatPage() {
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [urlInput, setUrlInput] = useState('http://localhost:11434');
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('ollama_url');
    if (saved) {
      setOllamaUrl(saved);
      setUrlInput(saved);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const fetchModels = async (url: string) => {
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch(`${url}/api/tags`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const names: string[] = (data.models ?? []).map((m: { name: string }) => m.name);
      setModels(names);
      if (names.length > 0) setSelectedModel(names[0]);
    } catch (e) {
      setError(`Could not connect to Ollama at ${url}. Check the URL and ensure Ollama is running.`);
      setModels([]);
      setSelectedModel('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveUrl = () => {
    const trimmed = urlInput.trim().replace(/\/$/, '');
    setOllamaUrl(trimmed);
    localStorage.setItem('ollama_url', trimmed);
    setShowSettings(false);
    fetchModels(trimmed);
  };

  useEffect(() => {
    fetchModels(ollamaUrl);
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isStreaming || !selectedModel) return;

    const userMessage: Message = { role: 'user', content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsStreaming(true);
    setError('');

    // Placeholder for streaming assistant response
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: updatedMessages,
          stream: true,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
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
      setMessages(prev => prev.slice(0, -1)); // remove empty assistant message
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-zinc-400" />
          <span className="font-semibold text-sm text-zinc-100">Chat</span>
          {selectedModel && (
            <span className="flex items-center gap-1 rounded-full bg-zinc-800 px-3 py-0.5 text-xs text-zinc-400">
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
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleSaveUrl}
                  className="flex-1 rounded-md bg-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:bg-zinc-600 transition-colors"
                >
                  Connect
                </button>
                <button
                  onClick={() => setShowSettings(false)}
                  className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                >
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
                    {models.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-6 py-2 bg-red-950 border-b border-red-800 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 && !isLoading && (
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
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-zinc-700 text-zinc-100 rounded-br-sm'
                  : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
              }`}
            >
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
            ref={textareaRef}
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
            className="flex-shrink-0 rounded-xl bg-zinc-700 p-3 text-zinc-100 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-zinc-600">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
