import { useState, useCallback, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { toast } from 'sonner';
import type { ShortcutData, ContentSource, ShortcutIcon, MessageApp } from '@/types/shortcut';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import { usageHistoryManager } from '@/lib/usageHistoryManager';
import i18n from '@/i18n';

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
    
    // Broadcast change to other hook instances
    window.dispatchEvent(new CustomEvent('shortcuts-changed', { detail: data }));
  }, [syncToWidgets]);

  // Sync with home screen - remove orphaned shortcuts that were deleted from home screen
  // NOTE: On Android 12+, getPinnedShortcuts() is unreliable for shortcuts created via
  // requestPinShortcut() without dynamic shortcut registration. Therefore, sync only
  // removes shortcuts if we get a positive signal that they're definitely unpinned.
  const syncWithHomeScreen = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    
    try {
      const { ids } = await ShortcutPlugin.getPinnedShortcutIds();
      const stored = localStorage.getItem(STORAGE_KEY);
      const currentShortcuts: ShortcutData[] = stored ? JSON.parse(stored) : [];
      
      console.log(`[useShortcuts] Sync: ${ids.length} pinned on OS, ${currentShortcuts.length} in storage`);
      
      // If OS returns 0 and we have shortcuts, treat as unreliable
      // (API may have failed entirely)
      if (ids.length === 0 && currentShortcuts.length > 0) {
        console.log('[useShortcuts] OS returned 0 IDs with local data present, skipping (API may be unreliable)');
        setShortcuts(currentShortcuts);
        return;
      }
      
      // Trust the OS response — shadow dynamic registration makes it reliable
      const pinnedSet = new Set(ids);
      const synced = currentShortcuts.filter(s => pinnedSet.has(s.id));
      
      if (synced.length !== currentShortcuts.length) {
        const removedCount = currentShortcuts.length - synced.length;
        console.log(`[useShortcuts] Removed ${removedCount} orphaned shortcuts`);
        saveShortcuts(synced);
      } else {
        setShortcuts(currentShortcuts);
      }
    } catch (error) {
      console.warn('[useShortcuts] Sync failed:', error);
    }
  }, [saveShortcuts]);

  // Sync native usage events from home screen taps
  const syncNativeUsageEvents = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    
    try {
      const result = await ShortcutPlugin.getNativeUsageEvents();
      
      if (!result.success || result.events.length === 0) {
        return;
      }
      
      console.log(`[useShortcuts] Syncing ${result.events.length} native usage events`);
      
      // Process each event
      const shortcutUpdates = new Map<string, number>();
      
      result.events.forEach(event => {
        // Record to usage history with original timestamp
        usageHistoryManager.recordUsage(event.shortcutId, event.timestamp);
        
        // Aggregate usage count updates per shortcut
        shortcutUpdates.set(
          event.shortcutId, 
          (shortcutUpdates.get(event.shortcutId) || 0) + 1
        );
      });
      
      // Update shortcuts with aggregated counts
      if (shortcutUpdates.size > 0) {
        setShortcuts(current => {
          const updated = current.map(s => {
            const additionalTaps = shortcutUpdates.get(s.id);
            if (additionalTaps) {
              return { ...s, usageCount: s.usageCount + additionalTaps };
            }
            return s;
          });
          
          // Save to localStorage
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          
          // Sync to widgets
          syncToWidgets(updated);
          
          // Broadcast usage update for stats recalculation
          window.dispatchEvent(new CustomEvent('usage-updated'));
          
          console.log(`[useShortcuts] Updated usage counts for ${shortcutUpdates.size} shortcuts`);
          
          return updated;
        });
      }
    } catch (error) {
      console.warn('[useShortcuts] Failed to sync native usage events:', error);
    }
  }, [syncToWidgets]);

  // Track if initial sync has been done
  const initialSyncDone = useRef(false);

  // Initial sync on mount + migrate usage history
  useEffect(() => {
    syncToWidgets(shortcuts);
    // Migrate existing usage data to history (one-time)
    usageHistoryManager.migrateExistingUsage(shortcuts);
    // Sync native usage events from home screen taps
    syncNativeUsageEvents();
    // Sync with home screen to remove orphaned shortcuts
    syncWithHomeScreen();
    
    initialSyncDone.current = true;
  }, []); // Only on mount

  // Listen for changes from other hook instances
  useEffect(() => {
    const handleShortcutsChanged = (event: CustomEvent<ShortcutData[]>) => {
      // Update local state from event payload (avoids re-reading localStorage)
      setShortcuts(event.detail);
    };

    window.addEventListener('shortcuts-changed', handleShortcutsChanged as EventListener);
    
    return () => {
      window.removeEventListener('shortcuts-changed', handleShortcutsChanged as EventListener);
    };
  }, []);

  // Sync native usage events when app comes to foreground
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive && initialSyncDone.current) {
        console.log('[useShortcuts] App resumed, syncing usage + home screen');
        syncNativeUsageEvents();
        syncWithHomeScreen();
      }
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, [syncNativeUsageEvents, syncWithHomeScreen]);

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
      // WhatsApp quick messages - optional message templates
      quickMessages: type === 'message' && quickMessages?.length ? quickMessages : undefined,
    };

    const updated = [...shortcuts, shortcut];
    saveShortcuts(updated);
    return shortcut;
  }, [shortcuts, saveShortcuts]);

  const createSlideshowShortcut = useCallback((
    images: Array<{ uri: string; thumbnail?: string }>,
    name: string,
    icon: ShortcutIcon,
    autoAdvanceInterval?: number
  ): ShortcutData => {
    const shortcut: ShortcutData = {
      id: crypto.randomUUID(),
      name,
      type: 'slideshow',
      contentUri: '', // Not used for slideshows
      icon,
      createdAt: Date.now(),
      usageCount: 0,
      imageUris: images.map(i => i.uri),
      imageThumbnails: images.map(i => i.thumbnail).filter(Boolean) as string[],
      autoAdvanceInterval,
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
          
          // Android cannot programmatically remove pinned shortcuts from home screen
          // Show a toast informing the user they need to manually remove the icon
          if (result.requiresManualRemoval) {
            toast.info(i18n.t('shortcuts.manualRemovalRequired'), {
              duration: 5000,
            });
          }
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
    
    // Broadcast usage update for stats recalculation
    window.dispatchEvent(new CustomEvent('usage-updated'));
  }, [shortcuts, saveShortcuts]);

  const updateShortcut = useCallback(async (
    id: string,
    updates: Partial<Pick<ShortcutData, 'name' | 'icon' | 'quickMessages' | 'phoneNumber' | 'resumeEnabled' | 'imageUris' | 'imageThumbnails' | 'autoAdvanceInterval'>>
  ): Promise<{ success: boolean; nativeUpdateFailed?: boolean }> => {
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
            return { success: true };
          } else {
            console.warn('[useShortcuts] Failed to update pinned shortcut:', result.error);
            return { success: true, nativeUpdateFailed: true };
          }
        }
      } catch (error) {
        console.warn('[useShortcuts] Error updating pinned shortcut:', error);
        return { success: true, nativeUpdateFailed: true };
      }
    }
    
    return { success: true };
  }, [shortcuts, saveShortcuts]);

  const getShortcut = useCallback((id: string): ShortcutData | undefined => {
    return shortcuts.find(s => s.id === id);
  }, [shortcuts]);

  // Manually refresh state from localStorage
  const refreshFromStorage = useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const data: ShortcutData[] = stored ? JSON.parse(stored) : [];
      setShortcuts(data);
      return data;
    } catch {
      return [];
    }
  }, []);

  return {
    shortcuts,
    createShortcut,
    createContactShortcut,
    createSlideshowShortcut,
    deleteShortcut,
    incrementUsage,
    updateShortcut,
    getShortcut,
    syncWithHomeScreen,
    refreshFromStorage,
  };
}
