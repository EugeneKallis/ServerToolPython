'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Send, Bot, User, Terminal, ChevronDown, Trash2, XCircle, AlertCircle, Info, Plus, MessageSquare, PanelLeftOpen, PanelLeftClose, Paperclip, FileText, Image as ImageIcon, X } from 'lucide-react';
import { useTerminal, TerminalFeedItem } from '../context/TerminalContext';
import { useAgentCount } from '../hooks/useAgentCount';
import TerminalOutputModal from './TerminalOutputModal';

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
  const [selectedModel, setSelectedModel] = useState('');
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
  const [expandedOutput, setExpandedOutput] = useState<{ lines: string[]; command?: string } | null>(null);

  // Model description lookup — matched by prefix of the model name
  const MODEL_INFO: { match: string; tag: string; desc: string }[] = [
    { match: 'deepseek-r1',       tag: 'Reasoning',  desc: 'Chain-of-thought reasoning, strong at math & logic problems' },
    { match: 'deepseek-coder',    tag: 'Coding',     desc: 'Optimized for code generation, completion, and debugging' },
    { match: 'deepseek',          tag: 'General',    desc: 'DeepSeek general-purpose assistant' },
    { match: 'qwq',               tag: 'Reasoning',  desc: 'Strong reasoning and math, thinks step-by-step before answering' },
    { match: 'qwen2.5-coder',     tag: 'Coding',     desc: 'Alibaba code model — generation, explanation, and refactoring' },
    { match: 'qwen2.5',           tag: 'General',    desc: 'Alibaba general assistant with strong multilingual support' },
    { match: 'qwen',              tag: 'General',    desc: 'Alibaba Qwen general assistant' },
    { match: 'llama3.3',          tag: 'General',    desc: 'Meta Llama 3.3 — well-rounded instruction-following model' },
    { match: 'llama3.2',          tag: 'General',    desc: 'Meta Llama 3.2 — fast and efficient general assistant' },
    { match: 'llama3.1',          tag: 'General',    desc: 'Meta Llama 3.1 — solid all-rounder for chat and reasoning' },
    { match: 'llama3',            tag: 'General',    desc: 'Meta Llama 3 — reliable general-purpose chat model' },
    { match: 'llama2',            tag: 'General',    desc: 'Meta Llama 2 — older but stable general assistant' },
    { match: 'llama',             tag: 'General',    desc: 'Meta Llama general assistant' },
    { match: 'mistral-nemo',      tag: 'General',    desc: 'Mistral Nemo — compact, fast, great for quick tasks' },
    { match: 'mistral-large',     tag: 'General',    desc: 'Mistral Large — high capability, strong at complex reasoning' },
    { match: 'mistral-small',     tag: 'General',    desc: 'Mistral Small — efficient and capable for everyday tasks' },
    { match: 'mistral',           tag: 'General',    desc: 'Mistral general assistant — fast with solid reasoning' },
    { match: 'mixtral',           tag: 'General',    desc: 'Mistral MoE model — high quality, good at long context' },
    { match: 'codellama',         tag: 'Coding',     desc: 'Meta code model built on Llama — code gen and completion' },
    { match: 'codegemma',         tag: 'Coding',     desc: 'Google code model — code generation and completion' },
    { match: 'gemma2',            tag: 'General',    desc: 'Google Gemma 2 — efficient and capable general assistant' },
    { match: 'gemma',             tag: 'General',    desc: 'Google Gemma — lightweight general assistant' },
    { match: 'phi4',              tag: 'General',    desc: 'Microsoft Phi-4 — small but punches above its weight' },
    { match: 'phi3.5',            tag: 'General',    desc: 'Microsoft Phi-3.5 — efficient small model, great for speed' },
    { match: 'phi3',              tag: 'General',    desc: 'Microsoft Phi-3 — compact model with strong reasoning' },
    { match: 'phi',               tag: 'General',    desc: 'Microsoft Phi family — small, fast, surprisingly capable' },
    { match: 'solar',             tag: 'General',    desc: 'Upstage Solar — strong Korean/English bilingual model' },
    { match: 'wizardlm2',         tag: 'General',    desc: 'WizardLM2 — instruction-tuned for complex instructions' },
    { match: 'command-r-plus',    tag: 'General',    desc: 'Cohere Command R+ — RAG-optimized, strong at long docs' },
    { match: 'command-r',         tag: 'General',    desc: 'Cohere Command R — good at retrieval-augmented tasks' },
    { match: 'starcoder2',        tag: 'Coding',     desc: 'BigCode StarCoder2 — multi-language code completion' },
    { match: 'starcoder',         tag: 'Coding',     desc: 'BigCode StarCoder — code generation and completion' },
    { match: 'nomic-embed-text',  tag: 'Embedding',  desc: 'Text embedding model — not for chat, use for vector search' },
    { match: 'mxbai-embed',       tag: 'Embedding',  desc: 'Text embedding model — not for chat, use for vector search' },
    { match: 'all-minilm',        tag: 'Embedding',  desc: 'Sentence embedding — not for chat, use for similarity search' },
    { match: 'llava',             tag: 'Vision',     desc: 'Multimodal — can analyze images alongside text' },
    { match: 'bakllava',          tag: 'Vision',     desc: 'Multimodal — image understanding with Mistral backbone' },
    { match: 'moondream',         tag: 'Vision',     desc: 'Tiny vision model — lightweight image description' },
    { match: 'yi',                tag: 'General',    desc: '01.AI Yi — strong multilingual model, good long context' },
    { match: 'orca-mini',         tag: 'General',    desc: 'Orca Mini — small, fast model for simple tasks' },
    { match: 'vicuna',            tag: 'General',    desc: 'Vicuna — Llama fine-tune, solid conversational model' },
    { match: 'openchat',          tag: 'General',    desc: 'OpenChat — efficient open-source chat model' },
    { match: 'neural-chat',       tag: 'General',    desc: 'Intel Neural Chat — optimized for Intel hardware' },
    { match: 'tinyllama',         tag: 'General',    desc: 'TinyLlama — very small, very fast, limited capability' },
    { match: 'smollm',            tag: 'General',    desc: 'SmolLM — extremely compact, runs anywhere' },
  ];

  const TAG_COLORS: Record<string, string> = {
    Reasoning: 'text-purple-400 bg-purple-500/10',
    Coding:    'text-blue-400 bg-blue-500/10',
    Vision:    'text-pink-400 bg-pink-500/10',
    Embedding: 'text-orange-400 bg-orange-500/10',
    General:   'text-emerald-400 bg-emerald-500/10',
  };

  const getModelInfo = (name: string) => {
    const lower = name.toLowerCase();
    return MODEL_INFO.find(m => lower.startsWith(m.match)) ?? null;
  };

  // Slash commands registry
  const SLASH_COMMANDS = [
    { name: '/shell', description: 'Run a shell command on the agent' },
  ];

  // Shell command history + autocomplete
  const [shellHistory, setShellHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Command picker (shown when input starts with / but no space yet)
  const [cmdPickerIndex, setCmdPickerIndex] = useState(0);

  // Derived display state
  const showCmdPicker = input.startsWith('/') && !input.includes(' ');
  const filteredCmds = SLASH_COMMANDS.filter(c => c.name.startsWith(input));
  const showShellSuggestions = input.startsWith('/shell ') && shellHistory.length > 0 && (input === '/shell ' || historyIndex >= 0);

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

  // Restore persisted model selection on mount (client-only — avoids SSR hydration mismatch)
  useEffect(() => {
    const saved = localStorage.getItem('chatTerminal.model');
    if (saved) setSelectedModel(saved);
  }, []);

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
    fetch('/api/agent/shell/history')
      .then(r => r.ok ? r.json() : [])
      .then(setShellHistory)
      .catch(() => {});
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
        const valid = (m: string) => names.includes(m);
        const pick = (saved && valid(saved)) ? saved : (prev && valid(prev)) ? prev : names[0];
        localStorage.setItem('chatTerminal.model', pick);
        return pick;
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

  const runShellCommand = async (command: string) => {
    setInput('');
    setHistoryIndex(-1);
    // Optimistically update local history so suggestions are instant
    setShellHistory(prev => [command, ...prev.filter(c => c !== command)].slice(0, 100));
    await fetch('/api/agent/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;

    // /shell <command> — dispatch directly to agent, skip LLM
    if (text.startsWith('/shell ')) {
      const command = text.slice(7).trim();
      if (command) await runShellCommand(command);
      return;
    }

    if (isStreaming || !selectedModel) return;

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
    // ── Command picker navigation (e.g. typing /s → shows /shell) ──
    if (showCmdPicker && filteredCmds.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCmdPickerIndex(i => (i - 1 + filteredCmds.length) % filteredCmds.length);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCmdPickerIndex(i => (i + 1) % filteredCmds.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        setInput(filteredCmds[cmdPickerIndex].name + ' ');
        setCmdPickerIndex(0);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setInput('');
        return;
      }
    }

    // ── Shell history navigation (after /shell is chosen) ──
    if (input.startsWith('/shell ')) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = Math.min(historyIndex + 1, Math.min(shellHistory.length - 1, 4));
        setHistoryIndex(next);
        setInput('/shell ' + shellHistory[next]);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex <= 0) { setHistoryIndex(-1); setInput('/shell '); return; }
        const next = historyIndex - 1;
        setHistoryIndex(next);
        setInput('/shell ' + shellHistory[next]);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
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
              <div className="absolute left-0 top-full mt-1 z-50 w-72 sm:w-80 max-w-[calc(100vw-2rem)] border border-outline-variant bg-surface-container-low shadow-xl max-h-96 overflow-y-auto">
                {models.length > 0 ? models.map(m => {
                  const info = getModelInfo(m);
                  const isActive = m === selectedModel;
                  return (
                    <button
                      key={m}
                      onClick={() => selectModel(m)}
                      className={`w-full text-left px-3 py-2.5 transition-colors border-l-2 ${
                        isActive
                          ? 'bg-surface-container-high border-primary-fixed-dim'
                          : 'border-transparent hover:bg-surface-container hover:border-outline-variant'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-xs font-mono truncate ${isActive ? 'text-primary-fixed-dim' : 'text-on-surface-variant'}`}>{m}</span>
                        {info && (
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${TAG_COLORS[info.tag] ?? 'text-outline bg-surface-container-highest'}`}>
                            {info.tag}
                          </span>
                        )}
                      </div>
                      {info && (
                        <p className="text-[10px] font-mono text-outline mt-0.5 leading-snug truncate">{info.desc}</p>
                      )}
                    </button>
                  );
                }) : (
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
                <div key={`terminal-${item.id}`} className="flex items-center gap-2 text-[11px] font-mono text-outline">
                  <span className="h-px flex-1 bg-outline-variant" />
                  <Info size={10} />
                  <span>{item.text}</span>
                  <span className="h-px flex-1 bg-outline-variant" />
                </div>
              );
            }

            // Agent execution block
            return (
              <div key={`terminal-${item.id}`} className="flex gap-2.5">
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
                  <div
                    className="border border-outline-variant bg-surface-container-lowest px-3 py-2 font-mono text-[11px] text-on-surface-variant leading-relaxed max-h-64 overflow-y-auto cursor-pointer hover:border-primary-fixed-dim/50 transition-colors"
                    onClick={() => setExpandedOutput({ lines: item.lines, command: item.command })}
                    title="Click to expand"
                  >
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
            <div key={`chat-${msg.id}`} className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
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
        {/* Slash command picker */}
        {showCmdPicker && filteredCmds.length > 0 && (
          <div className="mb-1 border border-outline-variant bg-surface-container overflow-hidden">
            <div className="px-3 py-1 text-[9px] font-mono text-outline uppercase tracking-wider border-b border-outline-variant">Commands</div>
            {filteredCmds.map((cmd, i) => (
              <button
                key={cmd.name}
                onMouseDown={e => { e.preventDefault(); setInput(cmd.name + ' '); setCmdPickerIndex(0); textareaRef.current?.focus(); }}
                className={`w-full text-left flex items-center gap-3 px-3 py-2 text-xs font-mono transition-colors ${i === cmdPickerIndex ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}
              >
                <span className="text-primary-fixed-dim font-bold shrink-0">{cmd.name}</span>
                <span className="text-outline truncate">{cmd.description}</span>
              </button>
            ))}
          </div>
        )}

        {/* Shell history suggestions */}
        {showShellSuggestions && (
          <div className="mb-1 border border-outline-variant bg-surface-container overflow-hidden max-h-48 overflow-y-auto flex flex-col">
            <div className="px-3 py-1 text-[9px] font-mono text-outline uppercase tracking-wider border-b border-outline-variant shrink-0">Recent commands — ↑↓ to navigate</div>
            {[...shellHistory.slice(0, 5)].reverse().map((cmd, i) => {
              // reversed index relative to shellHistory: bottom item = shellHistory[0] = historyIndex 0
              const visibleCount = Math.min(shellHistory.length, 5);
              const histIdx = visibleCount - 1 - i;
              const isActive = histIdx === historyIndex;
              return (
                <button
                  key={i}
                  onMouseDown={e => { e.preventDefault(); setHistoryIndex(histIdx); setInput('/shell ' + cmd); textareaRef.current?.focus(); }}
                  className={`w-full text-left px-3 py-1.5 text-xs font-mono truncate transition-colors border-l-2 ${
                    isActive
                      ? 'bg-surface-container-high text-on-surface border-primary-fixed-dim'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-transparent'
                  }`}
                >
                  {cmd}
                </button>
              );
            })}
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
            onChange={e => {
              const val = e.target.value;
              setInput(val);
              setHistoryIndex(-1);
              setCmdPickerIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={selectedModel ? `Ask ${selectedModel}… or /shell <command>` : '/shell <command> or connect Ollama to chat…'}
            disabled={false}
            rows={1}
            className="flex-1 resize-none bg-transparent px-3 py-2 text-sm font-mono text-on-surface placeholder-outline focus:outline-none disabled:opacity-50 max-h-32 overflow-y-auto"
            style={{ minHeight: '38px' }}
          />
          <button
            onClick={sendMessage}
            disabled={(!input.trim() && attachments.length === 0) || (!input.trim().startsWith('/shell ') && (!selectedModel || isStreaming))}
            className="flex-shrink-0 px-3 self-stretch flex items-center border-l border-outline-variant text-primary-fixed-dim hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Send"
          >
            <Send size={14} />
          </button>
        </div>
      </div>

      {/* Full-screen output modal */}
      {expandedOutput && (
        <TerminalOutputModal
          lines={expandedOutput.lines}
          command={expandedOutput.command}
          onClose={() => setExpandedOutput(null)}
        />
      )}

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
