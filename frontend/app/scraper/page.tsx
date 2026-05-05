'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Download, EyeOff, Undo2, ChevronDown, ChevronRight } from 'lucide-react';

const SOURCES = ['141jav', 'projectjav', 'pornrips'] as const;
type Source = typeof SOURCES[number];

interface ScrapedItem {
  id: number;
  title: string;
  image_url: string | null;
  magnet_link: string;
  torrent_link: string | null;
  tags: string | null;
  source: string;
  is_hidden: boolean;
  is_downloaded: boolean;
  created_at: string;
}

type BridgeStateValue = 'idle' | 'loading' | 'done' | 'error';

function ItemCard({ item, isActive, onHide }: {
  item: ScrapedItem;
  isActive: boolean;
  onHide: (id: number) => void;
}) {
  const [bridgeStates, setBridgeStates] = React.useState<Record<number, BridgeStateValue>>({});

  const getState = (fileId: number): BridgeStateValue => bridgeStates[fileId] ?? 'idle';
  const setState = (fileId: number, s: BridgeStateValue) =>
    setBridgeStates(prev => ({ ...prev, [fileId]: s }));

  const images = item.image_url ? item.image_url.split(',').map(s => s.trim()).filter(Boolean) : [];
  const mainImage = images[0] ?? null;
  const tags = item.tags ? item.tags.split(',').filter(Boolean) : [];
  const nonProjectjavMagnet = item.source === 'pornrips' ? (item.torrent_link ?? '') : item.magnet_link;
  const showSideBySide = (item.source === 'pornrips' || item.source === 'pornorips') && images.length >= 2;

  const sendToBridge = useCallback(async (magnetLink: string, fileId: number, downloadUncached: boolean) => {
    if (!magnetLink || getState(fileId) === 'loading') return;
    setState(fileId, 'loading');
    try {
      const formData = new FormData();
      formData.append('urls', magnetLink);
      formData.append('downloadUncached', String(downloadUncached));

      const res = await fetch(`/api/magnet-bridge/add`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      setState(fileId, 'done');
      fetch(`/api/scraper/items/${item.id}/downloaded`, { method: 'PATCH' });
      setTimeout(() => onHide(item.id), 800);
    } catch {
      setState(fileId, 'error');
      setTimeout(() => setState(fileId, 'idle'), 3000);
    }
  }, [item.id, onHide]);

  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      if (e.key === 'd' || e.key === 'Enter') {
        e.preventDefault();
        if (nonProjectjavMagnet) {
          if (getState(0) === 'loading' || getState(0) === 'done') return;
          sendToBridge(nonProjectjavMagnet, 0, true);
        }
      } else if (e.key === 'h' || e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        onHide(item.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActive, item.id, nonProjectjavMagnet, onHide, sendToBridge]);

  const stateLabel = (s: BridgeStateValue, fallback: string) =>
    s === 'loading' ? '…' : s === 'done' ? '✓' : s === 'error' ? '✗' : fallback;

  return (
    <div className={`h-full w-full min-w-0 flex flex-col bg-surface-container border-b border-outline-variant overflow-hidden ${item.is_downloaded ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-h-0 bg-black overflow-hidden relative flex">
        {showSideBySide ? (
          <>
            <button
              className="flex-1 min-w-0 cursor-zoom-in relative"
              onClick={() => window.open(images[0], '_blank', 'noopener,noreferrer')}
              tabIndex={-1}
            >
              <img
                src={images[0]}
                alt={item.title}
                className="absolute inset-0 w-full h-full object-contain"
                referrerPolicy="no-referrer"
                onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
              />
            </button>
            <div className="w-px bg-outline-variant shrink-0" />
            <button
              className="flex-1 min-w-0 cursor-zoom-in relative"
              onClick={() => window.open(images[1], '_blank', 'noopener,noreferrer')}
              tabIndex={-1}
            >
              <img
                src={images[1]}
                alt={item.title}
                className="absolute inset-0 w-full h-full object-contain"
                referrerPolicy="no-referrer"
                onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
              />
            </button>
          </>
        ) : mainImage ? (
          <button
            className="absolute inset-0 cursor-zoom-in"
            onClick={() => window.open(mainImage, '_blank', 'noopener,noreferrer')}
            tabIndex={-1}
          >
            <img
              src={mainImage}
              alt={item.title}
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
              onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
            />
          </button>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-outline text-xs font-mono">No image</div>
        )}
      </div>

      <div className="shrink-0 w-full min-w-0 px-3 sm:px-4 pt-3 pb-3 border-t border-outline-variant flex flex-col gap-2">
        <p className={`text-xs sm:text-sm font-mono text-on-surface leading-snug truncate ${item.is_downloaded ? 'line-through text-outline' : ''}`}>
          {item.title}
        </p>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 2).map(tag => (
              <span key={tag} className="text-[9px] font-mono px-1.5 py-0.5 border border-outline-variant text-outline bg-surface-container-high hidden sm:inline shrink-0">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap w-full">
          <div className="flex items-center gap-2 ml-auto">
            {nonProjectjavMagnet && (() => {
              const fs = getState(0);
              return (
                <button
                  onClick={() => sendToBridge(nonProjectjavMagnet, 0, true)}
                  disabled={fs === 'loading' || fs === 'done'}
                  title="Download"
                  className="flex items-center gap-1.5 text-xs font-mono text-primary-fixed-dim hover:text-primary-fixed border border-outline-variant px-3 py-2 sm:py-1.5 hover:bg-surface-container-high transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download size={14} className="shrink-0" />
                  <span className="hidden sm:inline text-[10px]">
                    {stateLabel(fs, 'Download')}
                  </span>
                  <span className="sm:hidden text-[10px]">
                    {stateLabel(fs, '')}
                  </span>
                </button>
              );
            })()}
            <button
              onClick={() => onHide(item.id)}
              title="Hide"
              className="flex items-center gap-1.5 text-xs font-mono text-outline hover:text-error border border-transparent hover:border-error/30 px-3 py-2 sm:py-1.5 hover:bg-error-container/10 transition-colors"
            >
              <EyeOff size={14} className="shrink-0" />
              <span className="hidden sm:inline text-[10px]">Hide</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ScraperPage() {
  const [source, setSource] = useState<Source>('141jav');
  const [items, setItems] = useState<ScrapedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tagFilter, setTagFilter] = useState('');
  const [tagsOpen, setTagsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isScraping, setIsScraping] = useState(false);
  const [modalOpen, setModalOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        setModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/scraper/items?source=${source}`);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, [source]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      if (!el.clientHeight) return;
      const idx = Math.round(el.scrollTop / el.clientHeight);
      setActiveIndex(idx);
    };
    el.addEventListener('scroll', onScroll, { passive: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        el.scrollBy({ top: el.clientHeight, behavior: 'smooth' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        el.scrollBy({ top: -el.clientHeight, behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const triggerScrape = async () => {
    setIsScraping(true);
    await fetch(`https://n8n.ekserver.com/webhook/bbf96bcb-f8e4-4f39-83d0-6123d8fc18ca?source=${source}`);
    setTimeout(() => setIsScraping(false), 1000);
  };

  const handleHide = async (id: number) => {
    await fetch(`/api/scraper/items/${id}/hide`, { method: 'PATCH' });
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleUndoHide = async () => {
    await fetch(`/api/scraper/items/undo-hide?source=${source}`, { method: 'POST' });
    fetchItems();
  };

  const tagMap: Record<string, number> = {};
  items.forEach(item => {
    (item.tags ?? '').split(',').filter(Boolean).forEach(t => {
      tagMap[t] = (tagMap[t] ?? 0) + 1;
    });
  });
  const availableTags = Object.entries(tagMap)
    .filter(([, c]) => c >= 2)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t]) => t);

  const filtered = tagFilter
    ? items.filter(i => (i.tags ?? '').split(',').includes(tagFilter))
    : items;

  return (
    <div className="relative flex-1 min-h-0 flex flex-col w-full max-w-full overflow-x-hidden bg-surface-dim text-on-surface">
      {modalOpen && (
        <div className="absolute inset-0 z-50 bg-black flex items-center justify-center">
          <div className="flex flex-col items-center gap-6 text-center max-w-sm px-6">
            <p className="font-headline text-xl font-bold text-on-surface tracking-wide">
              Scraper Safety Warning
            </p>
            <p className="text-sm font-body text-on-surface-variant leading-relaxed">
              This page contains adult content. Click the button below or press Enter to proceed.
            </p>
            <button
              onClick={() => setModalOpen(false)}
              className="flex items-center gap-2 text-sm font-mono text-primary-fixed-dim border border-primary-fixed-dim px-6 py-3 hover:bg-surface-container-high transition-colors"
            >
              Enter Scraper
            </button>
          </div>
        </div>
      )}

      <div className="shrink-0 flex flex-col gap-2 px-3 sm:px-4 lg:px-6 pt-3 sm:pt-4 lg:pt-5 pb-2 border-b border-outline-variant relative z-10 bg-surface-dim">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="font-headline font-bold text-sm uppercase tracking-[0.15em] text-on-surface mr-auto">Scraper</h1>

          <button
            onClick={handleUndoHide}
            className="flex items-center gap-1.5 text-[10px] font-mono text-on-surface-variant hover:text-on-surface border border-outline-variant px-2.5 py-2 sm:py-1.5 hover:bg-surface-container-high transition-colors"
            title="Undo last hide"
          >
            <Undo2 size={13} />
            <span className="hidden sm:inline">Undo Hide</span>
          </button>

          <button
            onClick={triggerScrape}
            disabled={isScraping}
            className="flex items-center gap-1.5 text-[10px] font-mono text-primary-fixed-dim border border-outline-variant px-2.5 py-2 sm:py-1.5 hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Scrape now"
          >
            <RefreshCw size={13} className={isScraping ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{isScraping ? '...' : 'Scrape Now'}</span>
          </button>
        </div>

        <div className="flex border-b border-outline-variant -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6">
          {SOURCES.map(s => (
            <button
              key={s}
              onClick={() => { setSource(s); setTagFilter(''); }}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs font-mono uppercase tracking-wider border-b-2 -mb-px transition-colors ${
                source === s
                  ? 'border-primary-fixed-dim text-primary-fixed-dim bg-surface-container-high'
                  : 'border-transparent text-outline hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {availableTags.length > 0 && (
          <div>
            <button
              onClick={() => setTagsOpen(o => !o)}
              className="flex items-center gap-1 text-[10px] font-mono text-outline hover:text-on-surface transition-colors py-1"
            >
              {tagsOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              Tags {tagFilter && <span className="text-primary-fixed-dim">· {tagFilter}</span>}
            </button>
            {tagsOpen && (
              <div className="flex flex-wrap gap-1.5 mt-1.5 pb-1">
                <button
                  onClick={() => setTagFilter('')}
                  className={`text-[10px] font-mono px-2 py-1 border transition-colors ${!tagFilter ? 'border-primary-fixed-dim text-primary-fixed-dim bg-surface-container-high' : 'border-outline-variant text-outline hover:text-on-surface'}`}
                >
                  All ({items.length})
                </button>
                {availableTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setTagFilter(tag === tagFilter ? '' : tag)}
                    className={`text-[10px] font-mono px-2 py-1 border transition-colors ${tagFilter === tag ? 'border-primary-fixed-dim text-primary-fixed-dim bg-surface-container-high' : 'border-outline-variant text-outline hover:text-on-surface'}`}
                  >
                    {tag} ({tagMap[tag]})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-scroll overflow-x-hidden snap-y snap-mandatory">
        {loading && (
          <div className="h-full flex items-center justify-center text-outline text-xs font-mono">Loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-outline">
            <p className="text-xs font-mono">No items found.</p>
            <button onClick={triggerScrape} disabled={isScraping} className="text-xs font-mono text-primary-fixed-dim border border-outline-variant px-4 py-2.5 hover:bg-surface-container-high disabled:opacity-40 transition-colors">
              {isScraping ? '...' : 'Trigger Scrape'}
            </button>
          </div>
        )}
        {filtered.map((item, index) => (
          <div key={item.id} className="h-full w-full snap-start overflow-hidden">
            <ItemCard
              item={item}
              isActive={index === activeIndex}
              onHide={handleHide}
            />
          </div>
        ))}
      </div>
    </div>
  );
}