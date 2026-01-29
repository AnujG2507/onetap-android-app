import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from './useAuth';
import { useNetworkStatus } from './useNetworkStatus';
import { uploadBookmarksToCloud, uploadTrashToCloud } from '@/lib/cloudSync';
import { recordSync, markPending, markSyncFailed, type PendingReason } from '@/lib/syncStatusManager';
import { getSettings } from '@/lib/settingsManager';

const STORAGE_KEY = 'saved_links';
const TRASH_STORAGE_KEY = 'saved_links_trash';
const DEBOUNCE_MS = 3000; // Wait 3 seconds after last change before syncing
const MIN_SYNC_INTERVAL_MS = 30000; // Don't sync more than once per 30 seconds

/**
 * Hook that automatically syncs bookmarks and trash to cloud when changes are detected.
 * Only uploads to cloud (one-way sync) to avoid conflicts with user actions.
 * Marks pending state on failure for retry-on-foreground/reconnect.
 */
export function useAutoSync() {
  const { user, loading } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [isEnabled, setIsEnabled] = useState(() => getSettings().autoSyncEnabled);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const lastSyncTime = useRef<number>(0);
  const isSyncing = useRef(false);
  const pendingSync = useRef(false);

  // Listen for settings changes
  useEffect(() => {
    const checkSettings = () => {
      setIsEnabled(getSettings().autoSyncEnabled);
    };
    
    window.addEventListener('settings-changed', checkSettings);
    return () => window.removeEventListener('settings-changed', checkSettings);
  }, []);

  const performSync = useCallback(async () => {
    if (!user || !isEnabled || isSyncing.current) {
      if (!user || !isEnabled) return;
      // If already syncing, mark as pending
      pendingSync.current = true;
      return;
    }

    // Check if online
    if (!isOnline) {
      console.log('[AutoSync] Offline, marking as pending');
      markPending('network');
      return;
    }

    // Check minimum interval
    const now = Date.now();
    if (now - lastSyncTime.current < MIN_SYNC_INTERVAL_MS) {
      console.log('[AutoSync] Skipping - too soon since last sync');
      return;
    }

    isSyncing.current = true;
    console.log('[AutoSync] Starting auto-sync...');

    try {
      // Upload bookmarks
      const bookmarkResult = await uploadBookmarksToCloud();
      
      // Upload trash silently in background
      await uploadTrashToCloud();
      
      if (bookmarkResult.success) {
        lastSyncTime.current = Date.now();
        recordSync(bookmarkResult.uploaded, 0);
        console.log('[AutoSync] Completed, uploaded:', bookmarkResult.uploaded);
      } else {
        // Determine failure reason for debugging
        let reason: PendingReason = 'unknown';
        if (bookmarkResult.error?.includes('Not authenticated')) {
          reason = 'auth';
        } else if (!navigator.onLine) {
          reason = 'network';
        } else {
          reason = 'partial';
        }
        markSyncFailed(reason);
        console.error('[AutoSync] Failed:', bookmarkResult.error);
      }
    } catch (error) {
      console.error('[AutoSync] Error:', error);
      markSyncFailed('unknown');
    } finally {
      isSyncing.current = false;
      
      // If there was a pending sync request, schedule another
      if (pendingSync.current) {
        pendingSync.current = false;
        debounceTimer.current = setTimeout(performSync, DEBOUNCE_MS);
      }
    }
  }, [user, isEnabled, isOnline]);

  const scheduleSync = useCallback(() => {
    if (!user || !isEnabled) return;
    
    // Mark as pending immediately when changes detected
    markPending('unknown');
    
    // Clear any existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    // Schedule new sync
    debounceTimer.current = setTimeout(performSync, DEBOUNCE_MS);
  }, [user, isEnabled, performSync]);

  useEffect(() => {
    // Don't set up listener until auth is loaded, user is signed in, and auto-sync is enabled
    if (loading || !user || !isEnabled) return;

    // Listen for storage changes (works for same-tab changes too via custom event)
    const handleStorageChange = (event: StorageEvent | CustomEvent) => {
      let key: string | null = null;
      
      if (event instanceof StorageEvent) {
        key = event.key;
      } else if (event instanceof CustomEvent) {
        key = event.detail?.key;
      }
      
      if (key === STORAGE_KEY || key === TRASH_STORAGE_KEY) {
        console.log('[AutoSync] Change detected:', key);
        scheduleSync();
      }
    };

    // Listen for cross-tab storage events
    window.addEventListener('storage', handleStorageChange);
    
    // Listen for same-tab storage events (custom event we'll dispatch)
    window.addEventListener('bookmarks-changed', handleStorageChange as EventListener);

    // Initial sync on mount (if user is signed in)
    const initialSyncTimer = setTimeout(() => {
      if (user && Date.now() - lastSyncTime.current > MIN_SYNC_INTERVAL_MS) {
        performSync();
      }
    }, 5000); // Wait 5 seconds after mount before initial sync

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('bookmarks-changed', handleStorageChange as EventListener);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      clearTimeout(initialSyncTimer);
    };
  }, [loading, user, isEnabled, scheduleSync, performSync]);

  return { isAutoSyncEnabled: !!user && isEnabled };
}

/**
 * Dispatch a custom event to notify auto-sync of bookmark changes.
 * Call this after any bookmark modification.
 */
export function notifyBookmarkChange() {
  window.dispatchEvent(new CustomEvent('bookmarks-changed', { 
    detail: { key: 'saved_links' } 
  }));
}

/**
 * Dispatch a custom event to notify auto-sync of trash changes.
 * Call this after any trash modification.
 */
export function notifyTrashChange() {
  window.dispatchEvent(new CustomEvent('bookmarks-changed', { 
    detail: { key: 'saved_links_trash' } 
  }));
}
