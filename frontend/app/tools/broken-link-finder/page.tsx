'use client';

import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface BrokenFile {
  path: string;
  status: string;
  msg: string;
}

export default function BrokenLinkFinderPage() {
  const [scanning, setScanning] = useState(false);
  const [files, setFiles] = useState<BrokenFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hasScanned, setHasScanned] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/tools/broken-link-finder/scan', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } finally {
      setScanning(false);
      setHasScanned(true);
      setSelected(new Set());
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(files.map((f) => f.path)));
    } else {
      setSelected(new Set());
    }
  };

  const handleSelectOne = (path: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(path);
      } else {
        next.delete(path);
      }
      return next;
    });
  };

  const deleteFiles = async (paths: string[]) => {
    setDeleting(true);
    try {
      const res = await fetch('/api/tools/broken-link-finder/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      });
      if (res.ok) {
        const deletedSet = new Set(paths);
        setFiles((prev) => prev.filter((f) => !deletedSet.has(f.path)));
        setSelected((prev) => {
          const next = new Set(prev);
          paths.forEach((p) => next.delete(p));
          return next;
        });
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSelected = () => {
    deleteFiles(Array.from(selected));
  };

  const handleDeleteAll = () => {
    deleteFiles(files.map((f) => f.path));
  };

  const statusBadgeClass = (status: string) => {
    switch (status.toUpperCase()) {
      case 'BROKEN':
        return 'bg-error-container text-on-error-container';
      case 'UNREADABLE':
        return 'bg-tertiary-container text-on-tertiary-container';
      default:
        return 'bg-secondary-container text-on-secondary-container';
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-surface-dim text-on-surface">
      {/* Header */}
      <div className="shrink-0 border-b border-outline-variant bg-surface-dim">
        <div className="flex items-center justify-between px-4 lg:px-6 pt-5 pb-4">
          <div>
            <h1 className="font-headline font-bold text-sm uppercase tracking-[0.15em] text-on-surface">
              Broken Link Finder
            </h1>
            <p className="text-xs text-on-surface-variant mt-1">
              Scan for broken symlinks and remove them
            </p>
          </div>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-1.5 text-xs font-mono font-semibold bg-primary-fixed-dim text-on-primary-fixed px-4 py-2 hover:bg-primary-container transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
            {scanning ? 'Scanning...' : 'Scan'}
          </button>
        </div>
      </div>

      {/* Main content */}
      {scanning && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="h-6 w-6 animate-spin border-2 border-outline-variant border-t-primary-fixed-dim" />
          <p className="text-xs font-mono text-on-surface-variant mt-3">
            Scanning... this may take a few minutes
          </p>
        </div>
      )}

      {!scanning && !hasScanned && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-outline font-mono text-xs">Click Scan to check for broken links</p>
        </div>
      )}

      {!scanning && hasScanned && files.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-on-surface-variant font-mono text-sm">No broken links found</p>
        </div>
      )}

      {!scanning && hasScanned && files.length > 0 && (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-high text-[10px] font-mono font-bold uppercase tracking-[0.15em] text-outline">
                <th className="px-3 py-2.5 w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === files.length && files.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="accent-primary-fixed-dim"
                  />
                </th>
                <th className="px-3 py-2.5">Path</th>
                <th className="px-3 py-2.5 w-28">Status</th>
                <th className="px-3 py-2.5 w-48">Reason</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr
                  key={file.path}
                  className="border-b border-outline-variant hover:bg-surface-container-low/50 transition-colors"
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(file.path)}
                      onChange={(e) => handleSelectOne(file.path, e.target.checked)}
                      className="accent-primary-fixed-dim"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="text-xs font-mono text-on-surface truncate max-w-[400px] block"
                      title={file.path}
                    >
                      {file.path}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 inline-block ${statusBadgeClass(file.status)}`}
                    >
                      {file.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="text-xs text-on-surface-variant truncate max-w-[300px] block"
                      title={file.msg}
                    >
                      {file.msg}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer bar */}
      <div className="shrink-0 border-t border-outline-variant bg-surface-dim px-4 py-3 flex items-center justify-between">
        <span className="text-xs font-mono text-on-surface-variant">
          {files.length} file{files.length !== 1 ? 's' : ''} found
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDeleteSelected}
            disabled={selected.size === 0 || deleting}
            className="text-xs font-mono font-semibold bg-error-container text-on-error-container px-4 py-2 hover:bg-error transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete Selected ({selected.size})
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={files.length === 0 || deleting}
            className="text-xs font-mono font-semibold bg-error-container text-on-error-container px-4 py-2 hover:bg-error transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete All
          </button>
        </div>
      </div>
    </div>
  );
}
