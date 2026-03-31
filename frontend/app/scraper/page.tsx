'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Download, EyeOff, Undo2, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

const SOURCES = ['141jav', 'projectjav', 'pornrips'] as const;
type Source = typeof SOURCES[number];

interface ScrapedFile {
  id: number;
  magnet_link: string;
  file_size: string | null;
  seeds: number | null;
  leechers: number | null;
}

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
  files: ScrapedFile[];
}

function parseSize(s: string): number {
  const lower = s.toLowerCase().trim();
  const num = parseFloat(lower);
  if (lower.endsWith('gb')) return num * 1024 ** 3;
  if (lower.endsWith('mb')) return num * 1024 ** 2;
  if (lower.endsWith('kb')) return num * 1024;
  return num;
}

function bestFile(files: ScrapedFile[]): ScrapedFile | null {
  if (!files.length) return null;
  return [...files].sort((a, b) => {
    const seedDiff = (b.seeds ?? 0) - (a.seeds ?? 0);
    if (seedDiff !== 0) return seedDiff;
    const sa = parseSize(a.file_size ?? '');
    const sb = parseSize(b.file_size ?? '');
    return sb - sa;
  })[0];
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

  const images = item.image_url ? item.image_url.split(',') : [];
  const mainImage = images[0] ?? null;
  const tags = item.tags ? item.tags.split(',').filter(Boolean) : [];
  const isProjectjav = item.source === 'projectjav';
  const best = isProjectjav ? bestFile(item.files) : null;
  // pornrips uses torrent_link (HTTP URL) — magnet_link is the page URL
  const nonProjectjavMagnet = item.source === 'pornrips' ? (item.torrent_link ?? '') : item.magnet_link;

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, onHide, bridgeStates]);

  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      if (e.key === 'd' || e.key === 'Enter') {
        e.preventDefault();
        if (isProjectjav && best) {
          if (getState(best.id) === 'loading' || getState(best.id) === 'done') return;
          sendToBridge(best.magnet_link, best.id, false);
        } else if (!isProjectjav && nonProjectjavMagnet) {
          if (getState(0) === 'loading' || getState(0) === 'done') return;
          sendToBridge(nonProjectjavMagnet, 0, false);
        }
      } else if (e.key === 'h' || e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        onHide(item.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, item.id, nonProjectjavMagnet, isProjectjav, best, onHide, sendToBridge, bridgeStates]);

  const stateLabel = (s: BridgeStateValue, fallback: string) =>
    s === 'loading' ? '…' : s === 'done' ? '✓' : s === 'error' ? '✗' : fallback;

  return (
    <div className={`h-full w-full min-w-0 flex flex-col bg-surface-container border-b border-outline-variant overflow-hidden transition-opacity ${item.is_downloaded ? 'opacity-50' : ''}`}>
      {/* Image */}
      <div className="flex-1 min-h-0 bg-black overflow-hidden relative">
        {mainImage ? (
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

      {/* Footer */}
      <div className="shrink-0 w-full min-w-0 px-3 sm:px-4 pt-3 pb-3 border-t border-outline-variant flex flex-col gap-2">
        {/* Title */}
        <p className={`text-xs sm:text-sm font-mono text-on-surface leading-snug truncate ${item.is_downloaded ? 'line-through text-outline' : ''}`}>
          {item.title}
        </p>

        {isProjectjav && item.files.length > 0 ? (
          <>
            {/* Tags for projectjav */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.slice(0, 2).map(tag => (
                  <span key={tag} className="text-[9px] font-mono px-1.5 py-0.5 border border-outline-variant text-outline bg-surface-container-high hidden sm:inline shrink-0">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {/* Per-file list */}
            <div className={`flex flex-col ${item.files.length > 5 ? 'max-h-[160px] overflow-y-auto' : ''}`}>
              {item.files.map(file => {
                const fs = getState(file.id);
                return (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 text-[10px] font-mono py-1 border-b border-outline-variant/30 last:border-0"
                  >
                    <span className="text-primary-fixed-dim shrink-0">{file.file_size ?? '?'}</span>
                    <span className="text-outline shrink-0">S:{file.seeds ?? 0}</span>
                    <span className="text-outline shrink-0">L:{file.leechers ?? 0}</span>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <button
                        onClick={() => sendToBridge(file.magnet_link, file.id, false)}
                        disabled={fs === 'loading' || fs === 'done'}
                        title="Download (cached)"
                        className="flex items-center gap-1 text-[10px] font-mono text-primary-fixed-dim hover:text-primary-fixed border border-outline-variant px-2 py-1 hover:bg-surface-container-high transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Download size={12} className="shrink-0" />
                        <span>{stateLabel(fs, '')}</span>
                      </button>
                      <button
                        onClick={() => sendToBridge(file.magnet_link, file.id, true)}
                        disabled={fs === 'loading' || fs === 'done'}
                        title="Download (force uncached)"
                        className="flex items-center gap-1 text-[10px] font-mono text-on-surface-variant hover:text-on-surface border border-outline-variant px-2 py-1 hover:bg-surface-container-high transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Download size={12} className="shrink-0" />
                        <span>-C</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Hide button */}
            <div className="flex justify-end">
              <button
                onClick={() => onHide(item.id)}
                title="Hide"
                className="flex items-center gap-1.5 text-xs font-mono text-outline hover:text-error border border-transparent hover:border-error/30 px-3 py-1.5 hover:bg-error-container/10 transition-colors"
              >
                <EyeOff size={14} className="shrink-0" />
                <span className="hidden sm:inline text-[10px]">Hide</span>
              </button>
            </div>
          </>
        ) : (
          /* Non-projectjav (or projectjav with no files) — original layout */
          <div className="flex items-center gap-2 flex-wrap w-full">
            {/* Meta info for non-projectjav */}
            {tags.slice(0, 2).map(tag => (
              <span key={tag} className="text-[9px] font-mono px-1.5 py-0.5 border border-outline-variant text-outline bg-surface-container-high hidden sm:inline shrink-0">
                {tag}
              </span>
            ))}
            {/* Buttons — push to right */}
            <div className="flex items-center gap-2 ml-auto">
              {nonProjectjavMagnet && (() => {
                const fs = getState(0);
                return (
                  <>
                    <button
                      onClick={() => sendToBridge(nonProjectjavMagnet, 0, false)}
                      disabled={fs === 'loading' || fs === 'done'}
                      title="Download (cached)"
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
                    <button
                      onClick={() => sendToBridge(nonProjectjavMagnet, 0, true)}
                      disabled={fs === 'loading' || fs === 'done'}
                      title="Download (force uncached)"
                      className="flex items-center gap-1.5 text-xs font-mono text-on-surface-variant hover:text-on-surface border border-outline-variant px-3 py-2 sm:py-1.5 hover:bg-surface-container-high transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Download size={14} className="shrink-0" />
                      <span className="text-[10px]">-C</span>
                    </button>
                  </>
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
        )}
      </div>
    </div>
  );
}

export default function ScraperPage() {
  const [source, setSource] = useState<Source>('141jav');
  const [items, setItems] = useState<ScrapedItem[]>([]);
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [tagFilter, setTagFilter] = useState('');
  const [tagsOpen, setTagsOpen] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/scraper/items?source=${source}`);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, [source]);

  const fetchStatus = useCallback(async () => {
    const res = await fetch('/api/scraper/status');
    if (res.ok) setStatus(await res.json());
  }, []);

  useEffect(() => {
    fetchItems();
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchItems, fetchStatus]);

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
    await fetch(`/api/scraper/trigger?source=${source}`, { method: 'POST' });
    fetchStatus();
  };

  const handleHide = async (id: number) => {
    await fetch(`/api/scraper/items/${id}/hide`, { method: 'PATCH' });
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleUndoHide = async () => {
    await fetch(`/api/scraper/items/undo-hide?source=${source}`, { method: 'POST' });
    fetchItems();
  };

  const handleRefresh = async () => {
    setConfirmRefresh(false);
    await fetch(`/api/scraper/refresh?source=${source}`, { method: 'POST' });
    setItems([]);
    fetchStatus();
  };

  // Tag counts
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

  const isScraping = status[source] ?? false;

  return (
    <div className="flex flex-col h-full w-full max-w-full overflow-x-hidden bg-surface-dim text-on-surface">

      {/* Controls */}
      <div className="shrink-0 flex flex-col gap-2 px-3 sm:px-4 lg:px-6 pt-3 sm:pt-4 lg:pt-5 pb-2 border-b border-outline-variant relative z-10 bg-surface-dim">

        {/* Header row */}
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

          {!confirmRefresh ? (
            <button
              onClick={() => setConfirmRefresh(true)}
              className="flex items-center gap-1.5 text-[10px] font-mono text-on-surface-variant hover:text-error border border-outline-variant hover:border-error/30 px-2.5 py-2 sm:py-1.5 hover:bg-error-container/10 transition-colors"
              title="Refresh source"
            >
              <Trash2 size={13} />
              <span className="hidden sm:inline">Refresh Source</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-error hidden sm:inline">Delete all &amp; rescrape?</span>
              <button onClick={handleRefresh} className="text-[10px] font-mono bg-error-container text-on-error-container px-2.5 py-2 sm:py-1.5 hover:opacity-80 transition-opacity">Confirm</button>
              <button onClick={() => setConfirmRefresh(false)} className="text-[10px] font-mono text-outline hover:text-on-surface px-2.5 py-2 sm:py-1.5 transition-colors">Cancel</button>
            </div>
          )}

          <button
            onClick={triggerScrape}
            disabled={isScraping}
            className="flex items-center gap-1.5 text-[10px] font-mono text-primary-fixed-dim border border-outline-variant px-2.5 py-2 sm:py-1.5 hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Scrape now"
          >
            <RefreshCw size={13} className={isScraping ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{isScraping ? 'Scraping…' : 'Scrape Now'}</span>
          </button>
        </div>

        {/* Source tabs */}
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
              {status[s] && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-primary-fixed-dim animate-pulse align-middle" />}
            </button>
          ))}
        </div>

        {/* Tag filter */}
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

      </div>{/* end controls */}

      {/* Items — snap scroll */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-scroll overflow-x-hidden snap-y snap-mandatory">
        {loading && (
          <div className="h-full flex items-center justify-center text-outline text-xs font-mono">Loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-outline">
            <p className="text-xs font-mono">No items found.</p>
            <button onClick={triggerScrape} disabled={isScraping} className="text-xs font-mono text-primary-fixed-dim border border-outline-variant px-4 py-2.5 hover:bg-surface-container-high disabled:opacity-40 transition-colors">
              {isScraping ? 'Scraping…' : 'Trigger Scrape'}
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
