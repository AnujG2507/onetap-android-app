import { useState, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import type { ShortcutData, ContentSource, ShortcutIcon, MessageApp } from '@/types/shortcut';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import { usageHistoryManager } from '@/lib/usageHistoryManager';

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

  // Sync shortcuts to Android widgets when data changes
  const syncToWidgets = useCallback(async (data: ShortcutData[]) => {
    if (Capacitor.isNativePlatform()) {
      try {
        await ShortcutPlugin.syncWidgetData({ 
          shortcuts: JSON.stringify(data) 
        });
        console.log('[useShortcuts] Synced shortcuts to widgets');
      } catch (error) {
        console.error('[useShortcuts] Failed to sync to widgets:', error);
      }
    }
  }, []);

  const saveShortcuts = useCallback((data: ShortcutData[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setShortcuts(data);
    
    // Sync to Android widgets
    syncToWidgets(data);
  }, [syncToWidgets]);

  // Sync with home screen - remove orphaned shortcuts that were deleted from home screen
  const syncWithHomeScreen = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    
    try {
      const { ids } = await ShortcutPlugin.getPinnedShortcutIds();
      
      // If no pinned shortcuts returned (empty array), skip sync
      // This handles the case where the API isn't available or returns empty
      if (ids.length === 0 && shortcuts.length > 0) {
        console.log('[useShortcuts] No pinned shortcuts returned, skipping sync');
        return;
      }
      
      const pinnedSet = new Set(ids);
      
      // Keep only shortcuts that are still pinned on home screen
      const synced = shortcuts.filter(s => pinnedSet.has(s.id));
      
      if (synced.length !== shortcuts.length) {
        const removedCount = shortcuts.length - synced.length;
        console.log(`[useShortcuts] Synced with home screen, removed ${removedCount} orphaned shortcuts`);
        saveShortcuts(synced);
      }
    } catch (error) {
      console.warn('[useShortcuts] Failed to sync with home screen:', error);
    }
  }, [shortcuts, saveShortcuts]);

  // Initial sync on mount + migrate usage history
  useEffect(() => {
    syncToWidgets(shortcuts);
    // Migrate existing usage data to history (one-time)
    usageHistoryManager.migrateExistingUsage(shortcuts);
    // Sync with home screen to remove orphaned shortcuts
    syncWithHomeScreen();
  }, []); // Only on mount

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
    slackDetails?: { teamId: string; userId: string },
    quickMessages?: string[]
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
      // WhatsApp quick messages - optional message templates
      quickMessages: type === 'message' && quickMessages?.length ? quickMessages : undefined,
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

  const deleteShortcut = useCallback(async (id: string) => {
    // Remove from home screen first (if on native platform)
    if (Capacitor.isNativePlatform()) {
      try {
        const result = await ShortcutPlugin.disablePinnedShortcut({ id });
        if (result.success) {
          console.log('[useShortcuts] Disabled pinned shortcut from home screen:', id);
        } else {
          console.warn('[useShortcuts] Failed to disable pinned shortcut:', result.error);
        }
      } catch (error) {
        console.warn('[useShortcuts] Error disabling pinned shortcut:', error);
      }
    }
    
    // Remove from local storage
    const updated = shortcuts.filter(s => s.id !== id);
    saveShortcuts(updated);
  }, [shortcuts, saveShortcuts]);


  const incrementUsage = useCallback((id: string) => {
    // Record the usage event with timestamp for historical tracking
    usageHistoryManager.recordUsage(id);
    
    // Still update usageCount for total tracking
    const updated = shortcuts.map(s => 
      s.id === id ? { ...s, usageCount: s.usageCount + 1 } : s
    );
    saveShortcuts(updated);
  }, [shortcuts, saveShortcuts]);

  const updateShortcut = useCallback(async (
    id: string,
    updates: Partial<Pick<ShortcutData, 'name' | 'icon' | 'quickMessages' | 'phoneNumber' | 'resumeEnabled'>>
  ) => {
    // Update localStorage first
    const updated = shortcuts.map(s => 
      s.id === id ? { ...s, ...updates } : s
    );
    saveShortcuts(updated);

    // Update home screen shortcut on native platform
    // This handles: name, icon, quick messages, phone number, resume enabled
    if (Capacitor.isNativePlatform()) {
      try {
        const shortcut = updated.find(s => s.id === id);
        if (shortcut) {
          // Always call native update - it will rebuild the intent if needed
          const result = await ShortcutPlugin.updatePinnedShortcut({
            id,
            label: shortcut.name,
            // Icon data
            iconEmoji: shortcut.icon.type === 'emoji' ? shortcut.icon.value : undefined,
            iconText: shortcut.icon.type === 'text' ? shortcut.icon.value : undefined,
            iconData: shortcut.icon.type === 'thumbnail' ? shortcut.icon.value : undefined,
            // Intent-affecting data for all shortcut types
            shortcutType: shortcut.type,
            phoneNumber: shortcut.phoneNumber,
            quickMessages: shortcut.quickMessages,
            messageApp: shortcut.messageApp,
            resumeEnabled: shortcut.resumeEnabled,
            contentUri: shortcut.contentUri,
            mimeType: shortcut.mimeType,
            contactName: shortcut.contactName || shortcut.name,
          });
          if (result.success) {
            console.log('[useShortcuts] Updated pinned shortcut on home screen:', id);
          } else {
            console.warn('[useShortcuts] Failed to update pinned shortcut:', result.error);
          }
        }
      } catch (error) {
        console.warn('[useShortcuts] Error updating pinned shortcut:', error);
      }
    }
  }, [shortcuts, saveShortcuts]);

  const getShortcut = useCallback((id: string): ShortcutData | undefined => {
    return shortcuts.find(s => s.id === id);
  }, [shortcuts]);

  return {
    shortcuts,
    createShortcut,
    createContactShortcut,
    deleteShortcut,
    incrementUsage,
    updateShortcut,
    getShortcut,
    syncWithHomeScreen,
  };
}
