'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Settings, ChevronDown, Plus, Trash2, MessageSquare, Paperclip, X, FileText, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface Attachment {
  name: string;
  type: 'image' | 'text';
  dataUrl: string;   // base64 data URL (images) or text content prefix (text)
  base64: string;    // raw base64 without prefix (for Ollama images field)
  textContent?: string; // raw text content for text files
}

interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;           // display text (user's typed text only)
  fullContent?: string;      // full content sent to Ollama (includes file text blocks)
  images?: string[];         // base64 image strings
  attachmentNames?: string[]; // file names shown as chips in the bubble
  timestamp?: number;        // ms since epoch when message was sent / response completed
  duration?: number;         // ms elapsed for assistant response
}

interface Conversation {
  id: number;
  title: string;
  model: string;
  updated_at: string;
  messages: Message[];
}

function Markdown({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  const renderInline = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_)/g;
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      const t = m[0];
      if (t.startsWith('`')) parts.push(<code key={m.index}>{t.slice(1, -1)}</code>);
      else if (t.startsWith('**') || t.startsWith('__')) parts.push(<strong key={m.index}>{t.slice(2, -2)}</strong>);
      else parts.push(<em key={m.index}>{t.slice(1, -1)}</em>);
      last = m.index + t.length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  };

  while (i < lines.length) {
    const line = lines[i];
    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      elements.push(<pre key={i}><code>{codeLines.join('\n')}</code></pre>);
    } else if (/^#{1,4} /.test(line)) {
      const level = line.match(/^(#+)/)?.[1].length ?? 1;
      const text = line.replace(/^#+\s/, '');
      const Tag = `h${Math.min(level, 4)}` as 'h1'|'h2'|'h3'|'h4';
      elements.push(<Tag key={i}>{renderInline(text)}</Tag>);
    } else if (/^[-*] /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(<li key={i}>{renderInline(lines[i].slice(2))}</li>);
        i++;
      }
      elements.push(<ul key={`ul${i}`}>{items}</ul>);
      continue;
    } else if (/^\d+\. /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(<li key={i}>{renderInline(lines[i].replace(/^\d+\. /, ''))}</li>);
        i++;
      }
      elements.push(<ol key={`ol${i}`}>{items}</ol>);
      continue;
    } else if (line.startsWith('> ')) {
      elements.push(<blockquote key={i}>{renderInline(line.slice(2))}</blockquote>);
    } else if (line === '---' || line === '***') {
      elements.push(<hr key={i} />);
    } else if (line.trim() === '') {
      // skip blank lines (rendered as spacing via CSS)
    } else {
      elements.push(<p key={i}>{renderInline(line)}</p>);
    }
    i++;
  }
  return <>{elements}</>;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function ChatPage() {
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState('');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(file => {
      const reader = new FileReader();
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      if (isImage) {
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(',')[1];
          setAttachments(prev => [...prev, { name: file.name, type: 'image', dataUrl, base64 }]);
        };
        reader.readAsDataURL(file);
      } else if (isPdf) {
        const form = new FormData();
        form.append('file', file);
        fetch('/api/chat/extract-pdf', { method: 'POST', body: form })
          .then(async res => {
            if (!res.ok) {
              const err = await res.json().catch(() => ({ detail: 'PDF extraction failed' }));
              setError(err.detail ?? 'PDF extraction failed');
              return;
            }
            const { text } = await res.json();
            setAttachments(prev => [...prev, { name: file.name, type: 'text', dataUrl: '', base64: '', textContent: text }]);
          })
          .catch(() => setError('Failed to extract PDF text'));
      } else {
        reader.onload = () => {
          const textContent = reader.result as string;
          setAttachments(prev => [...prev, { name: file.name, type: 'text', dataUrl: '', base64: '', textContent }]);
        };
        reader.readAsText(file);
      }
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => {
        const url = data.ollama_host || 'http://localhost:11434';
        setOllamaUrl(url);
        fetchModels(url);
      })
      .catch(() => setError('Could not load server config.'));
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
    if ((!text && attachments.length === 0) || isStreaming || !selectedModel) return;

    // Build content: prepend text file contents
    const textFiles = attachments.filter(a => a.type === 'text');
    const imageFiles = attachments.filter(a => a.type === 'image');
    let fullContent = text;
    if (textFiles.length > 0) {
      const fileBlocks = textFiles.map(f => `--- ${f.name} ---\n${f.textContent}`).join('\n\n');
      fullContent = fileBlocks + (text ? '\n\n' + text : '');
    }
    const imageBase64s = imageFiles.map(a => a.base64);

    const attachmentNames = attachments.map(a => a.name);

    setInput('');
    setAttachments([]);
    setIsStreaming(true);
    setError('');

    const sentAt = Date.now();
    const userMsg: Message = {
      role: 'user',
      content: text,             // display: just what the user typed
      fullContent,               // sent to Ollama: includes file blocks
      images: imageBase64s.length ? imageBase64s : undefined,
      attachmentNames: attachmentNames.length ? attachmentNames : undefined,
      timestamp: sentAt,
    };
    const history = [...messages, userMsg];
    setMessages([...history, { role: 'assistant', content: '' }]);

    // Create conversation on first message
    let conv = activeConv;
    if (!conv) {
      const title = (text || attachmentNames[0] || 'Attachment').slice(0, 60);
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

    // Save user message (save fullContent so history is correct in future sessions)
    if (conv) {
      await fetch(`/api/chat/conversations/${conv.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', content: fullContent }),
      });
    }

    // Build Ollama message — use fullContent, include images if present
    const ollamaUserMsg: Record<string, unknown> = { role: 'user', content: fullContent };
    if (imageBase64s.length > 0) ollamaUserMsg.images = imageBase64s;
    // For history, use fullContent (which has file context) falling back to content
    const ollamaHistory = [
      ...messages.map(m => ({
        role: m.role,
        content: m.fullContent ?? m.content,
        ...(m.images ? { images: m.images } : {}),
      })),
      ollamaUserMsg,
    ];

    // Stream from Ollama
    let assistantContent = '';
    try {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, messages: ollamaHistory, stream: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const streamStart = Date.now();

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
      const streamEnd = Date.now();
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          timestamp: streamEnd,
          duration: streamEnd - streamStart,
        };
        return updated;
      });
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
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full bg-surface text-on-surface">

      {/* Conversation list */}
      {isHistoryOpen && (
        <div className="w-56 flex-shrink-0 flex flex-col border-r border-outline-variant bg-surface-container-low">
          <div className="h-16 flex items-center px-3 border-b border-outline-variant">
            <button
              onClick={newChat}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-primary-fixed-dim hover:bg-surface-container-high transition-colors border border-outline-variant"
            >
              <Plus className="h-3.5 w-3.5" /> New Chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={`group w-full flex items-center justify-between px-3 py-2 text-left transition-colors cursor-pointer ${
                  activeConv?.id === conv.id
                    ? 'bg-surface-container-high border-l-2 border-primary-fixed-dim text-on-surface'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate text-xs font-mono">{conv.title}</span>
                </div>
                <button
                  onClick={(e) => deleteConversation(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-outline hover:text-error transition-opacity flex-shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            {conversations.length === 0 && (
              <p className="px-3 py-4 text-xs font-mono text-outline text-center">No conversations yet</p>
            )}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex flex-1 flex-col min-w-0">

        {/* Header */}
        <div className="h-16 border-b border-outline-variant bg-surface-container-low">
          <div className="h-full flex items-center justify-between px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsHistoryOpen(v => !v)}
                className="p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors border border-outline-variant"
                title={isHistoryOpen ? 'Hide history' : 'Show history'}
              >
                {isHistoryOpen
                  ? <PanelLeftClose className="h-4 w-4" />
                  : <PanelLeftOpen className="h-4 w-4" />
                }
              </button>
              <Bot className="h-4 w-4 text-primary-fixed-dim" />
              <span className="font-headline font-bold text-sm tracking-wide text-on-surface uppercase">Chat</span>
              {selectedModel && (
                <span className="hidden sm:inline bg-surface-container-highest px-3 py-0.5 text-[10px] font-mono text-on-surface-variant border border-outline-variant">
                  {selectedModel}
                </span>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setShowSettings(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors border border-outline-variant"
              >
                <Settings className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Settings</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
              </button>

              {showSettings && (
                <div className="absolute right-0 top-full mt-1 z-50 w-64 border border-outline-variant bg-surface-container-low p-4 shadow-xl">
                  <p className="mb-2 text-[10px] font-mono text-outline uppercase tracking-widest">Model</p>
                  {models.length > 0 ? (
                    <select
                      value={selectedModel}
                      onChange={e => { setSelectedModel(e.target.value); setShowSettings(false); }}
                      className="w-full border border-outline-variant bg-surface-container-lowest px-3 py-2 text-xs font-mono text-on-surface focus:border-primary-fixed-dim focus:outline-none"
                    >
                      {models.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  ) : (
                    <p className="text-xs font-mono text-outline">No models found</p>
                  )}
                  {ollamaUrl && (
                    <p className="mt-3 text-[10px] font-mono text-outline truncate" title={ollamaUrl}>
                      {ollamaUrl}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="px-6 py-2 bg-error-container/20 border-b border-error/30 text-sm font-mono text-error">{error}</div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-surface-dim">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-outline gap-3">
              <Bot className="h-10 w-10" />
              <p className="text-xs font-mono uppercase tracking-widest">
                {selectedModel ? `Ask ${selectedModel} anything` : 'Connect to Ollama to get started'}
              </p>
            </div>
          )}
          <div className="w-full px-6 py-6 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`flex-shrink-0 h-7 w-7 flex items-center justify-center mt-1 ${
                  msg.role === 'assistant'
                    ? 'bg-primary-container'
                    : 'bg-surface-container-highest border border-outline-variant'
                }`}>
                  {msg.role === 'assistant'
                    ? <Bot className="h-4 w-4 text-on-primary-container" />
                    : <User className="h-4 w-4 text-on-surface-variant" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`px-4 py-3 text-sm leading-relaxed border border-outline-variant ${
                    msg.role === 'user'
                      ? 'bg-surface-container-highest text-on-surface'
                      : 'bg-surface-container text-on-surface'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <div className="markdown text-sm leading-relaxed">
                        <Markdown content={msg.content} />
                        {isStreaming && i === messages.length - 1 && (
                          <span className="inline-block w-1.5 h-4 ml-0.5 bg-primary-fixed-dim/60 animate-pulse align-middle" />
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {msg.images && msg.images.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {msg.images.map((b64, idx) => (
                              <img key={idx} src={`data:image/png;base64,${b64}`} alt="attachment" className="max-h-48 max-w-xs object-contain border border-outline-variant" />
                            ))}
                          </div>
                        )}
                        {msg.attachmentNames && msg.attachmentNames.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {msg.attachmentNames.map((name, idx) => {
                              const isImg = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
                              return (
                                <span key={idx} className="flex items-center gap-1.5 bg-surface-container-lowest border border-outline-variant px-2 py-1 text-[10px] font-mono text-on-surface-variant">
                                  {isImg
                                    ? <Paperclip className="h-3 w-3 text-primary-fixed-dim" />
                                    : <FileText className="h-3 w-3 text-primary-fixed-dim" />
                                  }
                                  {name}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {msg.content && (
                          <span className="whitespace-pre-wrap font-mono text-xs">{msg.content}</span>
                        )}
                      </div>
                    )}
                  </div>
                  {msg.timestamp && (
                    <div className={`flex items-center gap-2 mt-1 px-1 text-[10px] font-mono text-outline ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <span>{formatTime(msg.timestamp)}</span>
                      {msg.duration !== undefined && (
                        <span className="text-primary-fixed-dim/70">{formatDuration(msg.duration)}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-outline-variant bg-surface-container-low px-4 py-4">
          <div className="w-full">
            {/* Attachment previews */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachments.map((att, i) => (
                  <div key={i} className="relative flex items-center gap-1.5 bg-surface-container border border-outline-variant px-2 py-1 text-xs font-mono text-on-surface-variant">
                    {att.type === 'image'
                      ? <img src={att.dataUrl} alt={att.name} className="h-8 w-8 object-cover" />
                      : <FileText className="h-3.5 w-3.5 text-primary-fixed-dim" />
                    }
                    <span className="max-w-[120px] truncate">{att.name}</span>
                    <button onClick={() => removeAttachment(i)} className="ml-1 text-outline hover:text-error transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,text/*,application/pdf,.md,.json,.csv,.log,.py,.js,.ts,.tsx,.jsx,.sh,.yaml,.yml,.toml,.xml,.html,.css"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!selectedModel || isStreaming}
                className="flex-shrink-0 border border-outline-variant bg-surface-container-high p-3 text-on-surface-variant hover:text-primary-fixed-dim hover:border-primary-fixed-dim disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Attach file"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={selectedModel ? `Message ${selectedModel}…` : 'Connect to Ollama first…'}
                disabled={!selectedModel || isStreaming}
                rows={1}
                className="flex-1 resize-none border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm font-mono text-on-surface placeholder-outline focus:border-primary-fixed-dim focus:outline-none disabled:opacity-50 max-h-40 overflow-y-auto"
                style={{ minHeight: '44px' }}
              />
              <button
                onClick={sendMessage}
                disabled={(!input.trim() && attachments.length === 0) || !selectedModel || isStreaming}
                className="flex-shrink-0 bg-surface-container-high border border-outline-variant p-3 hover:bg-surface-container-highest hover:border-primary-fixed-dim disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-primary-fixed-dim"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] font-mono text-outline uppercase tracking-widest">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  );
}
