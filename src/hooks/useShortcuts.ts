import { useState, useCallback } from 'react';
import type { ShortcutData, ContentSource, ShortcutIcon, MessageApp } from '@/types/shortcut';

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
    icon: ShortcutIcon,
    resumeEnabled?: boolean
  ): ShortcutData => {
    // Determine file type from content source
    const isFile = source.type === 'file';
    const fileType = isFile ? detectFileTypeFromMime(source.mimeType, source.name) : undefined;
    
    const shortcut: ShortcutData = {
      id: crypto.randomUUID(),
      name,
      type: source.type === 'url' || source.type === 'share' ? 'link' : 'file',
      contentUri: source.uri,
      icon,
      createdAt: Date.now(),
      usageCount: 0,
      // Preserve file metadata for native side
      mimeType: source.mimeType,
      fileType: fileType,
      fileSize: source.fileSize,
      // Preserve thumbnail data for icon creation
      thumbnailData: source.thumbnailData,
      // PDF resume support
      resumeEnabled: resumeEnabled,
    };

    const updated = [...shortcuts, shortcut];
    saveShortcuts(updated);
    return shortcut;
  }, [shortcuts, saveShortcuts]);

  const createContactShortcut = useCallback((
    type: 'contact' | 'message',
    name: string,
    icon: ShortcutIcon,
    phoneNumber: string,
    messageApp?: MessageApp,
    slackDetails?: { teamId: string; userId: string }
  ): ShortcutData => {
    const shortcut: ShortcutData = {
      id: crypto.randomUUID(),
      name,
      type,
      contentUri: type === 'contact' ? `tel:${phoneNumber}` : '',
      icon,
      createdAt: Date.now(),
      usageCount: 0,
      phoneNumber,
      messageApp,
      slackTeamId: slackDetails?.teamId,
      slackUserId: slackDetails?.userId,
    };

    const updated = [...shortcuts, shortcut];
    saveShortcuts(updated);
    return shortcut;
  }, [shortcuts, saveShortcuts]);
  
  // Helper to detect file type from MIME type (robust detection)
  function detectFileTypeFromMime(mimeType?: string, filename?: string): 'image' | 'video' | 'pdf' | 'document' | undefined {
    if (mimeType) {
      if (mimeType.startsWith('image/')) return 'image';
      if (mimeType.startsWith('video/')) return 'video';
      // Robust PDF detection: exact match or includes 'pdf'
      if (mimeType === 'application/pdf' || mimeType.includes('pdf')) return 'pdf';
    }
    
    if (filename) {
      const ext = filename.split('.').pop()?.toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif'].includes(ext || '')) return 'image';
      if (['mp4', 'webm', 'mov', 'avi', 'mkv', '3gp'].includes(ext || '')) return 'video';
      if (ext === 'pdf') return 'pdf';
    }
    
    return 'document';
  }

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
    createContactShortcut,
    deleteShortcut,
    incrementUsage,
  };
}
