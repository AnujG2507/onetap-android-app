import { useState, useCallback, useEffect } from 'react';

export interface DebugEntry {
  id: string;
  timestamp: number;
  shortcutName: string;
  uriScheme: string;
  uri: string;
  mimeType: string;
  detectedSize: number; // bytes, 0 if unknown
  playbackPath: 'internal' | 'external' | 'unknown';
  notes?: string;
}

const STORAGE_KEY = 'onetap_debug_log';
const MAX_ENTRIES = 50;

function loadEntries(): DebugEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: DebugEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function useDebugLog() {
  const [entries, setEntries] = useState<DebugEntry[]>(loadEntries);

  useEffect(() => {
    saveEntries(entries);
  }, [entries]);

  const addEntry = useCallback((entry: Omit<DebugEntry, 'id' | 'timestamp'>) => {
    const newEntry: DebugEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    setEntries((prev) => [newEntry, ...prev].slice(0, MAX_ENTRIES));
  }, []);

  const clearLog = useCallback(() => {
    setEntries([]);
  }, []);

  return { entries, addEntry, clearLog };
}

// Global singleton for adding entries from anywhere (e.g., native callbacks)
let globalAddEntry: ((entry: Omit<DebugEntry, 'id' | 'timestamp'>) => void) | null = null;

export function setGlobalDebugLogger(fn: typeof globalAddEntry) {
  globalAddEntry = fn;
}

export function logDebugEntry(entry: Omit<DebugEntry, 'id' | 'timestamp'>) {
  if (globalAddEntry) {
    globalAddEntry(entry);
  } else {
    // Fallback: persist directly
    const entries = loadEntries();
    const newEntry: DebugEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    saveEntries([newEntry, ...entries]);
  }
}
