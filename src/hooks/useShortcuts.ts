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

  // Sync guards: prevent concurrent syncs and rapid-fire syncs on OEM devices
  const syncInProgress = useRef(false);
  const lastSyncTime = useRef(0);
  const MIN_SYNC_INTERVAL = 5000; // 5 seconds debounce for Samsung split-screen / notification shade

  // Sync with home screen - remove orphaned shortcuts that were deleted from home screen
  const syncWithHomeScreen = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    if (syncInProgress.current) return;

    const now = Date.now();
    if (now - lastSyncTime.current < MIN_SYNC_INTERVAL) return;

    syncInProgress.current = true;
    lastSyncTime.current = now;

    try {
      const result = await ShortcutPlugin.getPinnedShortcutIds();

      // If native side reported an error (context null, manager null, exception),
      // skip sync entirely to avoid deleting all shortcuts
      if (result.error) {
        console.warn('[useShortcuts] Native reported error, skipping sync');
        return;
      }

      const { ids, recentlyCreatedIds } = result;
      const stored = localStorage.getItem(STORAGE_KEY);
      const currentShortcuts: ShortcutData[] = stored ? JSON.parse(stored) : [];

      if (currentShortcuts.length === 0) return;

      // Recently created shortcuts get race protection (OS may not report them yet)
      const confirmed = new Set([...ids, ...recentlyCreatedIds]);

      // Trust the OS: keep only shortcuts that are confirmed on home screen
      const synced = currentShortcuts.filter(s => confirmed.has(s.id));

      if (synced.length !== currentShortcuts.length) {
        const removedCount = currentShortcuts.length - synced.length;
        console.log(`[useShortcuts] Removed ${removedCount} shortcuts not found on home screen`);
        saveShortcuts(synced);
      } else {
        setShortcuts(currentShortcuts);
      }
    } catch (error) {
      console.warn('[useShortcuts] Sync failed:', error);
    } finally {
      syncInProgress.current = false;
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
  // NOTE: syncWithHomeScreen is NOT called here — the appStateChange listener
  // is the single entry point for sync, preventing double-sync race on cold start.
  useEffect(() => {
    syncToWidgets(shortcuts);
    // Migrate existing usage data to history (one-time)
    usageHistoryManager.migrateExistingUsage(shortcuts);
    // Sync native usage events from home screen taps
    syncNativeUsageEvents();
    
    initialSyncDone.current = true;

    // Sync with home screen on cold start — reset debounce guard so this
    // isn't blocked if appStateChange already fired before the timer
    const timer = setTimeout(() => {
      lastSyncTime.current = 0;
      syncWithHomeScreen();
    }, 1500);
    return () => clearTimeout(timer);
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
      mimeType: source.mimeType,
      fileType: fileType,
      fileSize: source.fileSize,
      thumbnailData: source.thumbnailData,
      resumeEnabled: resumeEnabled,
    };

    // Read from localStorage to avoid stale closure
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const updated = [...current, shortcut];
    saveShortcuts(updated);
    return shortcut;
  }, [saveShortcuts]);

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
      quickMessages: type === 'message' && quickMessages?.length ? quickMessages : undefined,
    };

    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const updated = [...current, shortcut];
    saveShortcuts(updated);
    return shortcut;
  }, [saveShortcuts]);

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
      contentUri: '',
      icon,
      createdAt: Date.now(),
      usageCount: 0,
      imageUris: images.map(i => i.uri),
      imageThumbnails: images.map(i => i.thumbnail).filter(Boolean) as string[],
      autoAdvanceInterval,
    };

    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const updated = [...current, shortcut];
    saveShortcuts(updated);
    return shortcut;
  }, [saveShortcuts]);

  const createTextShortcut = useCallback((
    textContent: string,
    isChecklist: boolean,
    name: string,
    icon: ShortcutIcon
  ): ShortcutData => {
    const shortcut: ShortcutData = {
      id: crypto.randomUUID(),
      name,
      type: 'text',
      contentUri: '',
      icon,
      createdAt: Date.now(),
      usageCount: 0,
      textContent,
      isChecklist,
    };
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const updated = [...current, shortcut];
    saveShortcuts(updated);
    return shortcut;
  }, [saveShortcuts]);
  
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
    // Record deletion for cloud sync
    try {
      const { recordDeletion } = await import('@/lib/deletionTracker');
      recordDeletion('shortcut', id);
    } catch (e) {
      console.warn('[useShortcuts] Failed to record deletion:', e);
    }

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
    
    // Remove from local storage (read fresh to avoid stale closure)
    const current: ShortcutData[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const updated = current.filter(s => s.id !== id);
    saveShortcuts(updated);
  }, [saveShortcuts]);


  const incrementUsage = useCallback((id: string) => {
    usageHistoryManager.recordUsage(id);
    
    // Read fresh from localStorage to avoid stale closure
    const current: ShortcutData[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const updated = current.map(s => 
      s.id === id ? { ...s, usageCount: s.usageCount + 1 } : s
    );
    saveShortcuts(updated);
    
    window.dispatchEvent(new CustomEvent('usage-updated'));
  }, [saveShortcuts]);

  const updateShortcut = useCallback(async (
    id: string,
    updates: Partial<Pick<ShortcutData, 'name' | 'icon' | 'quickMessages' | 'phoneNumber' | 'resumeEnabled' | 'imageUris' | 'imageThumbnails' | 'autoAdvanceInterval' | 'contentUri' | 'syncState' | 'mimeType' | 'fileSize' | 'thumbnailData' | 'originalPath' | 'textContent' | 'isChecklist'>> & { skipNativeUpdate?: boolean }
  ): Promise<{ success: boolean; nativeUpdateFailed?: boolean }> => {
    // Strip the transient flag before saving to localStorage
    const { skipNativeUpdate, ...storageUpdates } = updates;

    // Read fresh from localStorage to avoid stale closure
    const current: ShortcutData[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const updated = current.map(s => 
      s.id === id ? { ...s, ...storageUpdates } : s
    );
    saveShortcuts(updated);

    // Update home screen shortcut on native platform
    // Skip if caller will handle re-pinning itself (e.g. handleReAdd in ShortcutEditSheet)
    if (Capacitor.isNativePlatform() && !skipNativeUpdate) {
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
            shortcutType: shortcut.type as 'contact' | 'file' | 'link' | 'message' | 'slideshow' | 'text',
            phoneNumber: shortcut.phoneNumber,
            quickMessages: shortcut.quickMessages,
            messageApp: shortcut.messageApp,
            resumeEnabled: shortcut.resumeEnabled,
            contentUri: shortcut.contentUri,
            mimeType: shortcut.mimeType,
            contactName: shortcut.contactName || shortcut.name,
            textContent: shortcut.textContent,
            isChecklist: shortcut.isChecklist,
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
  }, [saveShortcuts]);

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

  // Post-pin verification: uses Android's PendingIntent callback for positive
  // confirmation instead of a blind timer.
  const verifyShortcutPinned = useCallback(async (id: string) => {
    if (!Capacitor.isNativePlatform()) return;

    // Wait for user to finish interacting with the pin dialog
    // 500ms timeout covers "Add" button (app stays foreground);
    // appStateChange covers drag-and-drop (app goes to background)
    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => { cleanup(); resolve(); }, 500);
      let listenerHandle: any = null;
      const cleanup = () => {
        clearTimeout(timeout);
        if (listenerHandle) {
          listenerHandle.then((l: any) => l.remove());
          listenerHandle = null;
        }
      };
      listenerHandle = App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) { cleanup(); resolve(); }
      });
    });

  // Grace period for BroadcastReceiver to write confirmation (1500ms for slow OEM devices)
  await new Promise(resolve => setTimeout(resolve, 1500));

  try {
    // Check positive confirmation from Android PendingIntent callback
    const confirmResult = await ShortcutPlugin.checkPinConfirmed({ id });
    if (confirmResult.confirmed) {
      console.log('[useShortcuts] Pin confirmed by callback:', id);
      return;
    }

    // Fallback — check OS-reported pinned IDs
    const result = await ShortcutPlugin.getPinnedShortcutIds();

    if (result.error) {
      console.warn('[useShortcuts] verifyShortcutPinned: native error, skipping');
      return;
    }

    if (result.ids.includes(id)) {
      console.log('[useShortcuts] Pin confirmed by OS query:', id);
      return;
    }

    // Neither source confirmed — do NOT delete.
    // Let syncWithHomeScreen handle cleanup on next resume after
    // the 30s creation registry cooldown expires.
    console.warn('[useShortcuts] Pin not confirmed yet for:', id, '— keeping in localStorage, syncWithHomeScreen will reconcile');
  } catch (error) {
    console.warn('[useShortcuts] verifyShortcutPinned failed:', error);
  }
}, []);

  return {
    shortcuts,
    createShortcut,
    createContactShortcut,
    createSlideshowShortcut,
    createTextShortcut,
    deleteShortcut,
    incrementUsage,
    updateShortcut,
    getShortcut,
    syncWithHomeScreen,
    refreshFromStorage,
    verifyShortcutPinned,
  };
}
