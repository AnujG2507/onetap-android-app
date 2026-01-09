import { useState, useCallback } from 'react';
import type { ShortcutData, ContentSource, ShortcutIcon } from '@/types/shortcut';

const STORAGE_KEY = 'quicklaunch_shortcuts';

export function useShortcuts() {
  const [shortcuts, setShortcuts] = useState<ShortcutData[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const saveShortcuts = useCallback((data: ShortcutData[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setShortcuts(data);
  }, []);

  const createShortcut = useCallback((
    source: ContentSource,
    name: string,
    icon: ShortcutIcon
  ): ShortcutData => {
    const shortcut: ShortcutData = {
      id: crypto.randomUUID(),
      name,
      type: source.type === 'url' || source.type === 'share' ? 'link' : 'file',
      contentUri: source.uri,
      icon,
      createdAt: Date.now(),
      usageCount: 0,
    };

    const updated = [...shortcuts, shortcut];
    saveShortcuts(updated);
    return shortcut;
  }, [shortcuts, saveShortcuts]);

  const deleteShortcut = useCallback((id: string) => {
    const updated = shortcuts.filter(s => s.id !== id);
    saveShortcuts(updated);
  }, [shortcuts, saveShortcuts]);

  const incrementUsage = useCallback((id: string) => {
    const updated = shortcuts.map(s => 
      s.id === id ? { ...s, usageCount: s.usageCount + 1 } : s
    );
    saveShortcuts(updated);
  }, [shortcuts, saveShortcuts]);

  return {
    shortcuts,
    createShortcut,
    deleteShortcut,
    incrementUsage,
  };
}
