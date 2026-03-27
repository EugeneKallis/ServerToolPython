'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, EyeOff, Undo2, Magnet, Trash2, CheckCircle2 } from 'lucide-react';

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
    const sa = parseSize(a.file_size ?? '');
    const sb = parseSize(b.file_size ?? '');
    if (sa !== sb) return sb - sa;
    return (b.seeds ?? 0) - (a.seeds ?? 0);
  })[0];
}

function ItemCard({ item, onHide, onDownloaded }: {
  item: ScrapedItem;
  onHide: (id: number) => void;
  onDownloaded: (id: number) => void;
}) {
  const images = item.image_url ? item.image_url.split(',') : [];
  const mainImage = images[0] ?? null;
  const tags = item.tags ? item.tags.split(',').filter(Boolean) : [];
  const magnet = item.source === 'projectjav' ? bestFile(item.files)?.magnet_link ?? '' : item.magnet_link;
  const best = item.source === 'projectjav' ? bestFile(item.files) : null;

  return (
    <div className={`flex gap-3 border border-outline-variant bg-surface-container p-3 transition-opacity ${item.is_downloaded ? 'opacity-50' : ''}`}>
      {/* Thumbnail */}
      <div className="shrink-0 w-36 h-24 bg-surface-container-highest border border-outline-variant overflow-hidden">
        {mainImage ? (
          <img
            src={mainImage}
            alt={item.title}
            className="w-full h-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-outline text-[10px] font-mono">No image</div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <p className={`text-xs font-mono text-on-surface leading-snug line-clamp-2 ${item.is_downloaded ? 'line-through text-outline' : ''}`}>
            {item.title}
          </p>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {tags.slice(0, 6).map(tag => (
                <span key={tag} className="text-[9px] font-mono px-1.5 py-0.5 border border-outline-variant text-outline bg-surface-container-high">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {best && (
            <p className="text-[10px] font-mono text-outline mt-1">
              {best.file_size && <span className="text-primary-fixed-dim">{best.file_size}</span>}
              {best.seeds != null && <span className="ml-2">S:{best.seeds}</span>}
              {best.leechers != null && <span className="ml-1">L:{best.leechers}</span>}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-2">
          {magnet && (
            <a
              href={magnet}
              title="Open magnet"
              className="flex items-center gap-1 text-[10px] font-mono text-primary-fixed-dim hover:text-primary-fixed border border-outline-variant px-2 py-1 hover:bg-surface-container-high transition-colors"
            >
              <Magnet size={11} /> Magnet
            </a>
          )}
          {item.torrent_link && (
            <a
              href={item.torrent_link}
              title="Download torrent"
              className="flex items-center gap-1 text-[10px] font-mono text-on-surface-variant hover:text-on-surface border border-outline-variant px-2 py-1 hover:bg-surface-container-high transition-colors"
            >
              <Download size={11} /> Torrent
            </a>
          )}
          {!item.is_downloaded && (
            <button
              onClick={() => onDownloaded(item.id)}
              title="Mark as downloaded"
              className="flex items-center gap-1 text-[10px] font-mono text-on-surface-variant hover:text-primary-fixed-dim border border-outline-variant px-2 py-1 hover:bg-surface-container-high transition-colors"
            >
              <CheckCircle2 size={11} /> Downloaded
            </button>
          )}
          <button
            onClick={() => onHide(item.id)}
            title="Hide"
            className="flex items-center gap-1 text-[10px] font-mono text-outline hover:text-error border border-transparent hover:border-error/30 px-2 py-1 hover:bg-error-container/10 transition-colors ml-auto"
          >
            <EyeOff size={11} /> Hide
          </button>
        </div>
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
  const [confirmRefresh, setConfirmRefresh] = useState(false);

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

  const triggerScrape = async () => {
    await fetch(`/api/scraper/trigger?source=${source}`, { method: 'POST' });
    fetchStatus();
  };

  const handleHide = async (id: number) => {
    await fetch(`/api/scraper/items/${id}/hide`, { method: 'PATCH' });
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleDownloaded = async (id: number) => {
    await fetch(`/api/scraper/items/${id}/downloaded`, { method: 'PATCH' });
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_downloaded: true } : i));
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
    <div className="flex flex-col h-full p-4 lg:p-6 gap-4 bg-surface-dim text-on-surface">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-headline font-bold text-sm uppercase tracking-[0.15em] text-on-surface">Scraper</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndoHide}
            className="flex items-center gap-1.5 text-[10px] font-mono text-on-surface-variant hover:text-on-surface border border-outline-variant px-2 py-1.5 hover:bg-surface-container-high transition-colors"
            title="Undo last hide"
          >
            <Undo2 size={12} /> Undo Hide
          </button>
          {!confirmRefresh ? (
            <button
              onClick={() => setConfirmRefresh(true)}
              className="flex items-center gap-1.5 text-[10px] font-mono text-on-surface-variant hover:text-error border border-outline-variant hover:border-error/30 px-2 py-1.5 hover:bg-error-container/10 transition-colors"
            >
              <Trash2 size={12} /> Refresh Source
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-error">Delete all & rescrape?</span>
              <button onClick={handleRefresh} className="text-[10px] font-mono bg-error-container text-on-error-container px-2 py-1.5 hover:opacity-80 transition-opacity">Confirm</button>
              <button onClick={() => setConfirmRefresh(false)} className="text-[10px] font-mono text-outline hover:text-on-surface px-2 py-1.5 transition-colors">Cancel</button>
            </div>
          )}
          <button
            onClick={triggerScrape}
            disabled={isScraping}
            className="flex items-center gap-1.5 text-[10px] font-mono text-primary-fixed-dim border border-outline-variant px-2 py-1.5 hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw size={12} className={isScraping ? 'animate-spin' : ''} />
            {isScraping ? 'Scraping…' : 'Scrape Now'}
          </button>
        </div>
      </div>

      {/* Source tabs */}
      <div className="flex gap-0 border-b border-outline-variant">
        {SOURCES.map(s => (
          <button
            key={s}
            onClick={() => { setSource(s); setTagFilter(''); }}
            className={`px-4 py-2 text-xs font-mono uppercase tracking-wider border-b-2 -mb-px transition-colors ${
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
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setTagFilter('')}
            className={`text-[10px] font-mono px-2 py-0.5 border transition-colors ${!tagFilter ? 'border-primary-fixed-dim text-primary-fixed-dim bg-surface-container-high' : 'border-outline-variant text-outline hover:text-on-surface'}`}
          >
            All ({items.length})
          </button>
          {availableTags.map(tag => (
            <button
              key={tag}
              onClick={() => setTagFilter(tag === tagFilter ? '' : tag)}
              className={`text-[10px] font-mono px-2 py-0.5 border transition-colors ${tagFilter === tag ? 'border-primary-fixed-dim text-primary-fixed-dim bg-surface-container-high' : 'border-outline-variant text-outline hover:text-on-surface'}`}
            >
              {tag} ({tagMap[tag]})
            </button>
          ))}
        </div>
      )}

      {/* Items grid */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-16 text-outline text-xs font-mono">Loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-outline">
            <p className="text-xs font-mono">No items found.</p>
            <button onClick={triggerScrape} disabled={isScraping} className="text-[10px] font-mono text-primary-fixed-dim border border-outline-variant px-3 py-1.5 hover:bg-surface-container-high disabled:opacity-40 transition-colors">
              {isScraping ? 'Scraping…' : 'Trigger Scrape'}
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              onHide={handleHide}
              onDownloaded={handleDownloaded}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
