'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Send, Bot, User, Terminal, ChevronDown, Trash2, XCircle, AlertCircle, Info, Plus, MessageSquare, PanelLeftOpen, PanelLeftClose, Paperclip, FileText, Image as ImageIcon, X } from 'lucide-react';
import { useTerminal, TerminalFeedItem } from '../context/TerminalContext';
import { useAgentCount } from '../hooks/useAgentCount';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  duration?: number;
}

interface Conversation {
  id: number;
  title: string;
  model: string;
  updated_at: string;
  messages: { role: string; content: string }[];
}

type FeedEntry =
  | { kind: 'terminal'; item: TerminalFeedItem }
  | { kind: 'chat'; msg: ChatMessage };

interface Attachment {
  name: string;
  mimeType: string;
  data: string; // base64 (no data-url prefix)
  isImage: boolean;
  objectUrl?: string; // for image previews
}

// ── Markdown ──────────────────────────────────────────────────────────────────

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
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      elements.push(<pre key={i}><code>{codeLines.join('\n')}</code></pre>);
    } else if (/^#{1,4} /.test(line)) {
      const level = line.match(/^(#+)/)?.[1].length ?? 1;
      const text = line.replace(/^#+\s/, '');
      const Tag = `h${Math.min(level, 4)}` as 'h1' | 'h2' | 'h3' | 'h4';
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
    } else if (line.trim() !== '') {
      elements.push(<p key={i}>{renderInline(line)}</p>);
    }
    i++;
  }
  return <>{elements}</>;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ChatTerminalProps {
  className?: string;
  environment?: string;
  dockerTag?: string;
}

export default function ChatTerminal({ className = '', environment = 'Local', dockerTag = 'dev' }: ChatTerminalProps) {
  const { feedItems, status, clearLines } = useTerminal();

  const [ollamaUrl, setOllamaUrl] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('chatTerminal.model') ?? '' : ''
  );
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [killing, setKilling] = useState(false);

  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const msgCounter = useRef(0);
  const agentCount = useAgentCount();

  // Merge terminal feed items and chat messages, sorted by id (timestamp)
  const feed: FeedEntry[] = [
    ...feedItems.map(item => ({ kind: 'terminal' as const, item })),
    ...chatMessages.map(msg => ({ kind: 'chat' as const, msg })),
  ].sort((a, b) => {
    const idA = a.kind === 'terminal' ? a.item.id : a.msg.id;
    const idB = b.kind === 'terminal' ? b.item.id : b.msg.id;
    return idA - idB;
  });

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => {
        const url = data.ollama_host || 'http://localhost:11434';
        setOllamaUrl(url);
        fetchModels(url);
      })
      .catch(() => {});
    loadConversations();
  }, []);

  const loadConversations = async () => {
    const res = await fetch('/api/chat/conversations');
    if (res.ok) setConversations(await res.json());
  };

  const selectConversation = (conv: Conversation) => {
    setActiveConv(conv);
    let counter = Date.now();
    setChatMessages(conv.messages.map(m => ({
      id: counter++,
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })));
  };

  const newChat = () => {
    setActiveConv(null);
    setChatMessages([]);
  };

  const deleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/chat/conversations/${id}`, { method: 'DELETE' });
    if (activeConv?.id === id) newChat();
    await loadConversations();
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feed.length, isStreaming]);

  useEffect(() => {
    if (!isStreaming) textareaRef.current?.focus();
  }, [isStreaming]);

  const selectModel = (name: string) => {
    setSelectedModel(name);
    localStorage.setItem('chatTerminal.model', name);
    setShowModelPicker(false);
  };

  const fetchModels = async (url: string) => {
    try {
      const res = await fetch(`${url}/api/tags`);
      if (!res.ok) return;
      const data = await res.json();
      const names: string[] = (data.models ?? []).map((m: { name: string }) => m.name);
      setModels(names);
      if (names.length > 0) setSelectedModel(prev => {
        const saved = localStorage.getItem('chatTerminal.model');
        const pick = (saved && names.includes(saved)) ? saved : names[0];
        localStorage.setItem('chatTerminal.model', pick);
        return prev || pick;
      });
    } catch {}
  };

  const killAgent = async () => {
    setKilling(true);
    try {
      await fetch('/api/agent/reset', { method: 'POST' });
    } catch {}
    setKilling(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] ?? result;
        const isImage = file.type.startsWith('image/');
        setAttachments(prev => [...prev, {
          name: file.name,
          mimeType: file.type,
          data: base64,
          isImage,
          objectUrl: isImage ? URL.createObjectURL(file) : undefined,
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => {
      const a = prev[idx];
      if (a.objectUrl) URL.revokeObjectURL(a.objectUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const sendMessage = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || isStreaming || !selectedModel) return;

    setInput('');
    const currentAttachments = attachments;
    setAttachments([]);
    setIsStreaming(true);
    setError('');

    // Build the message content: prepend text-file contents, use images array for images
    const textFiles = currentAttachments.filter(a => !a.isImage);
    const imageFiles = currentAttachments.filter(a => a.isImage);

    let fullText = text;
    if (textFiles.length > 0) {
      const fileBlocks = textFiles.map(f =>
        `[${f.name}]\n\`\`\`\n${atob(f.data)}\n\`\`\``
      ).join('\n\n');
      fullText = fullText ? `${fileBlocks}\n\n${fullText}` : fileBlocks;
    }

    const now = Date.now();
    const userMsgId = now + msgCounter.current++;
    const asstMsgId = now + msgCounter.current++;

    // Show attachments inline in user message display
    const displayContent = [
      ...currentAttachments.map(a => `[attachment: ${a.name}]`),
      ...(text ? [text] : []),
    ].join('\n');

    const userMsg: ChatMessage = { id: userMsgId, role: 'user', content: displayContent };
    const asstMsg: ChatMessage = { id: asstMsgId, role: 'assistant', content: '', streaming: true };

    const userOllamaMsg: { role: string; content: string; images?: string[] } = {
      role: 'user',
      content: fullText,
      ...(imageFiles.length > 0 ? { images: imageFiles.map(f => f.data) } : {}),
    };

    const historyForOllama = [
      ...chatMessages.map(m => ({ role: m.role, content: m.content })),
      userOllamaMsg,
    ];

    setChatMessages(prev => [...prev, userMsg, asstMsg]);

    // Create conversation on first message
    let conv = activeConv;
    if (!conv) {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: (fullText || displayContent).slice(0, 60), model: selectedModel }),
      });
      if (res.ok) {
        conv = await res.json();
        setActiveConv(conv!);
        loadConversations();
      }
    }

    if (conv) {
      await fetch(`/api/chat/conversations/${conv.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', content: fullText || displayContent }),
      });
    }

    let assistantContent = '';
    try {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, messages: historyForOllama, stream: true }),
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
              setChatMessages(prev => prev.map(m =>
                m.id === asstMsgId ? { ...m, content: assistantContent } : m
              ));
            }
          } catch {}
        }
      }

      const duration = Date.now() - streamStart;
      setChatMessages(prev => prev.map(m =>
        m.id === asstMsgId ? { ...m, streaming: false, duration } : m
      ));
    } catch (e) {
      setError(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setChatMessages(prev => prev.filter(m => m.id !== asstMsgId));
      setIsStreaming(false);
      return;
    }

    if (conv && assistantContent) {
      await fetch(`/api/chat/conversations/${conv.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'assistant', content: assistantContent }),
      });
      loadConversations();
    }

    setIsStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleClear = () => {
    clearLines();
    setChatMessages([]);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={`flex flex-col h-full bg-surface-container-lowest text-on-surface overflow-hidden border border-outline-variant ${className}`}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-container-low border-b border-outline-variant">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(v => !v)}
            className={`p-1 transition-colors hover:bg-surface-container-high border border-transparent hover:border-outline-variant ${showHistory ? 'text-primary-fixed-dim' : 'text-outline hover:text-on-surface'}`}
            title={showHistory ? 'Hide history' : 'Show chat history'}
          >
            {showHistory ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />}
          </button>
          <div className="w-1.5 h-4 kinetic-gradient" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-[0.15em] text-primary-fixed">
            Terminal
          </span>
          <div className="relative">
            <button
              onClick={() => setShowModelPicker(v => !v)}
              className="flex items-center gap-1 bg-surface-container-highest px-2 py-0.5 text-[9px] font-mono text-on-surface-variant border border-outline-variant hover:border-primary-fixed-dim hover:text-on-surface transition-colors"
              title="Change AI model"
            >
              <span>{selectedModel || 'No model'}</span>
              <ChevronDown size={9} className={`transition-transform ${showModelPicker ? 'rotate-180' : ''}`} />
            </button>
            {showModelPicker && (
              <div className="absolute left-0 top-full mt-1 z-50 w-56 border border-outline-variant bg-surface-container-low shadow-xl">
                {models.length > 0 ? models.map(m => (
                  <button
                    key={m}
                    onClick={() => selectModel(m)}
                    className={`w-full text-left px-3 py-2 text-xs font-mono transition-colors ${
                      m === selectedModel
                        ? 'bg-surface-container-high text-primary-fixed-dim border-l-2 border-primary-fixed-dim'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                    }`}
                  >
                    {m}
                  </button>
                )) : (
                  <p className="px-3 py-2 text-xs font-mono text-outline">No models found</p>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={killAgent}
            disabled={killing}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-error/70 hover:text-error hover:bg-error-container/20 border border-transparent hover:border-error/30 transition-colors disabled:opacity-40"
            title="Kill running task"
          >
            <XCircle size={12} />
            Kill
          </button>
          <button
            onClick={handleClear}
            className="text-outline hover:text-primary-fixed transition-colors p-1 hover:bg-surface-container-high"
            title="Clear all"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-1.5 bg-error-container/20 border-b border-error/30 text-xs font-mono text-error flex items-center gap-2">
          <AlertCircle size={12} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-error/60 hover:text-error">×</button>
        </div>
      )}

      {/* Body: history panel + feed */}
      <div className="flex flex-1 min-h-0">

        {/* History sidebar */}
        {showHistory && (
          <div className="w-52 flex-shrink-0 flex flex-col border-r border-outline-variant bg-surface-container-low">
            <div className="flex items-center justify-between px-3 py-2 border-b border-outline-variant">
              <span className="text-[9px] font-mono uppercase tracking-widest text-outline">History</span>
              <button
                onClick={newChat}
                className="flex items-center gap-1 px-2 py-1 text-[9px] font-mono text-primary-fixed-dim hover:bg-surface-container-high border border-outline-variant transition-colors"
                title="New chat"
              >
                <Plus size={9} /> New
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {conversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => selectConversation(conv)}
                  className={`group flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                    activeConv?.id === conv.id
                      ? 'bg-surface-container-high border-l-2 border-primary-fixed-dim text-on-surface'
                      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <MessageSquare size={10} className="flex-shrink-0" />
                    <span className="truncate text-[11px] font-mono">{conv.title}</span>
                  </div>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-outline hover:text-error transition-opacity flex-shrink-0"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
              {conversations.length === 0 && (
                <p className="px-3 py-4 text-[11px] font-mono text-outline text-center">No conversations yet</p>
              )}
            </div>
          </div>
        )}

        {/* Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-dim min-w-0">
        {feed.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-outline gap-3">
            <Terminal className="h-8 w-8" />
            <p className="text-xs font-mono uppercase tracking-widest">Run a macro or start a chat</p>
          </div>
        )}

        {feed.map(entry => {
          if (entry.kind === 'terminal') {
            const item = entry.item;

            // System message — centered divider
            if (item.type === 'system') {
              return (
                <div key={item.id} className="flex items-center gap-2 text-[11px] font-mono text-outline">
                  <span className="h-px flex-1 bg-outline-variant" />
                  <Info size={10} />
                  <span>{item.text}</span>
                  <span className="h-px flex-1 bg-outline-variant" />
                </div>
              );
            }

            // Agent execution block
            return (
              <div key={item.id} className="flex gap-2.5">
                <div className="flex-shrink-0 h-6 w-6 flex items-center justify-center bg-surface-container-highest border border-outline-variant mt-0.5">
                  <Terminal size={12} className="text-tertiary-fixed-dim" />
                </div>
                <div className="flex-1 min-w-0">
                  {item.command && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono text-primary-fixed-dim">$ {item.command}</span>
                      {!item.done && (
                        <span className="w-1 h-3 bg-primary-fixed-dim/60 animate-pulse" />
                      )}
                      {item.done && item.exitCode !== undefined && item.exitCode !== 0 && (
                        <span className="text-[9px] font-mono text-error">exit {item.exitCode}</span>
                      )}
                      {item.done && (item.exitCode === undefined || item.exitCode === 0) && (
                        <span className="text-[9px] font-mono text-primary-fixed-dim/50">done</span>
                      )}
                    </div>
                  )}
                  <div className="border border-outline-variant bg-surface-container-lowest px-3 py-2 font-mono text-[11px] text-on-surface-variant leading-relaxed max-h-64 overflow-y-auto">
                    {item.lines.map((line, li) => (
                      <div key={li} className="whitespace-pre-wrap">{line}</div>
                    ))}
                    {!item.done && item.lines.length === 0 && (
                      <span className="text-outline animate-pulse">Running…</span>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          // Chat message
          const msg = entry.msg;
          const isUser = msg.role === 'user';
          return (
            <div key={msg.id} className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`flex-shrink-0 h-6 w-6 flex items-center justify-center mt-0.5 ${
                isUser
                  ? 'bg-surface-container-highest border border-outline-variant'
                  : 'bg-primary-container'
              }`}>
                {isUser
                  ? <User size={12} className="text-on-surface-variant" />
                  : <Bot size={12} className="text-on-primary-container" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className={`px-3 py-2 text-sm border border-outline-variant ${
                  isUser
                    ? 'bg-surface-container-highest text-on-surface'
                    : 'bg-surface-container text-on-surface'
                }`}>
                  {isUser ? (
                    <span className="whitespace-pre-wrap font-mono text-xs">{msg.content}</span>
                  ) : (
                    <div className="markdown text-xs leading-relaxed">
                      <Markdown content={msg.content} />
                      {msg.streaming && (
                        <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-primary-fixed-dim/60 animate-pulse align-middle" />
                      )}
                    </div>
                  )}
                </div>
                {!isUser && msg.duration !== undefined && (
                  <div className="mt-0.5 px-1 text-[9px] font-mono text-outline">
                    {msg.duration < 1000 ? `${msg.duration}ms` : `${(msg.duration / 1000).toFixed(1)}s`}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
        </div>{/* end feed */}
      </div>{/* end body */}

      {/* Chat input */}
      <div className="border-t border-outline-variant bg-surface-container-low px-3 py-2.5">
        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {attachments.map((a, idx) => (
              <div key={idx} className="flex items-center gap-1 bg-surface-container-highest border border-outline-variant px-2 py-1 text-[11px] font-mono text-on-surface-variant max-w-[160px]">
                {a.isImage ? (
                  a.objectUrl
                    ? <img src={a.objectUrl} alt={a.name} className="h-5 w-5 object-cover flex-shrink-0" />
                    : <ImageIcon size={12} className="flex-shrink-0" />
                ) : (
                  <FileText size={12} className="flex-shrink-0 text-primary-fixed-dim" />
                )}
                <span className="truncate">{a.name}</span>
                <button
                  onClick={() => removeAttachment(idx)}
                  className="flex-shrink-0 text-outline hover:text-error transition-colors"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center border border-outline-variant bg-surface-container-lowest focus-within:border-primary-fixed-dim transition-colors">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,text/*,.md,.json,.yaml,.yml,.csv,.log,.sh,.py,.js,.ts,.tsx,.jsx"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!selectedModel || isStreaming}
            className="flex-shrink-0 px-3 self-stretch flex items-center text-outline hover:text-on-surface border-r border-outline-variant hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Attach file"
          >
            <Paperclip size={14} />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedModel ? `Ask ${selectedModel}… (Enter to send)` : 'Connect to Ollama to chat…'}
            disabled={!selectedModel || isStreaming}
            rows={1}
            className="flex-1 resize-none bg-transparent px-3 py-2 text-sm font-mono text-on-surface placeholder-outline focus:outline-none disabled:opacity-50 max-h-32 overflow-y-auto"
            style={{ minHeight: '38px' }}
          />
          <button
            onClick={sendMessage}
            disabled={(!input.trim() && attachments.length === 0) || !selectedModel || isStreaming}
            className="flex-shrink-0 px-3 self-stretch flex items-center border-l border-outline-variant text-primary-fixed-dim hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Send"
          >
            <Send size={14} />
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-1.5 bg-surface-container-low border-t border-outline-variant flex items-center justify-between text-[9px] font-mono uppercase tracking-widest text-outline">
        <span className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${
            status === 'connected' ? 'bg-primary-fixed-dim' :
            status === 'connecting' ? 'bg-tertiary-fixed-dim animate-pulse' :
            'bg-error'
          }`} />
          {status}
          {agentCount !== null && (
            <>
              <span className="text-outline/40">·</span>
              <span className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  agentCount === 0 ? 'bg-error' : 'bg-primary-fixed-dim'
                }`} />
                {agentCount === 1 ? '1 AGENT' : `${agentCount} AGENTS`}
              </span>
            </>
          )}
          {agentCount === null && (
            <>
              <span className="text-outline/40">·</span>
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-outline" />
              </span>
            </>
          )}
        </span>
        <span className="text-outline/60">{environment} · {dockerTag}</span>
      </div>
    </div>
  );
}
