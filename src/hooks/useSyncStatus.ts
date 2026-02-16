import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';
import { useNetworkStatus } from './useNetworkStatus';
import { getSettings } from '@/lib/settingsManager';
import { 
  getSyncStatus, 
  onSyncStatusChange, 
  markPending, 
  markSyncFailed,
  recordSync,
  type SyncState,
  type PendingReason,
} from '@/lib/syncStatusManager';
import { uploadBookmarksToCloud, uploadTrashToCloud } from '@/lib/cloudSync';

/**
 * Hook for tracking sync status and triggering retries.
 * Implements retry-on-foreground and retry-on-reconnect.
 */
export function useSyncStatus() {
  const { user, loading: authLoading } = useAuth();
  const { isOnline } = useNetworkStatus();
  console.log('[useSyncStatus] Init, user:', !!user, 'authLoading:', authLoading, 'online:', isOnline);
  const [status, setStatus] = useState(getSyncStatus());
  const [isSyncing, setIsSyncing] = useState(false);
  const isRetrying = useRef(false);
  const wasOffline = useRef(!isOnline);
  const wasHidden = useRef(document.hidden);

  // Derive the display state
  const getSyncState = useCallback((): SyncState => {
    if (!user || !getSettings().autoSyncEnabled) return 'disabled';
    if (!isOnline) return 'offline';
    if (isSyncing) return 'syncing';
    if (status.hasPendingChanges) return 'pending';
    return 'synced';
  }, [user, isOnline, isSyncing, status.hasPendingChanges]);

  const [syncState, setSyncState] = useState<SyncState>(getSyncState);

  // Update sync state when dependencies change
  useEffect(() => {
    setSyncState(getSyncState());
  }, [getSyncState]);

  // Listen for sync status changes from storage
  useEffect(() => {
    const unsubscribe = onSyncStatusChange(() => {
      setStatus(getSyncStatus());
    });
    return unsubscribe;
  }, []);

  // Retry sync (internal, not exposed to UI)
  const retrySync = useCallback(async () => {
    if (!user || !getSettings().autoSyncEnabled || !isOnline || isRetrying.current || isSyncing) {
      return;
    }

    // Only retry if there are pending changes
    const currentStatus = getSyncStatus();
    if (!currentStatus.hasPendingChanges) {
      return;
    }

    isRetrying.current = true;
    setIsSyncing(true);

    try {
      console.log('[SyncRetry] Starting retry sync...');
      
      // Upload bookmarks
      const result = await uploadBookmarksToCloud();
      
      // Upload trash silently
      await uploadTrashToCloud();
      
      if (result.success) {
        recordSync(result.uploaded, 0);
        console.log('[SyncRetry] Retry succeeded, uploaded:', result.uploaded);
      } else {
        // Determine failure reason
        let reason: PendingReason = 'unknown';
        if (result.error?.includes('Not authenticated')) {
          reason = 'auth';
        } else if (!navigator.onLine) {
          reason = 'network';
        } else {
          reason = 'partial';
        }
        markSyncFailed(reason);
        console.warn('[SyncRetry] Retry failed:', result.error);
      }
    } catch (error) {
      console.error('[SyncRetry] Retry error:', error);
      markSyncFailed('unknown');
    } finally {
      setIsSyncing(false);
      isRetrying.current = false;
    }
  }, [user, isOnline, isSyncing]);

  // Retry on network reconnect
  useEffect(() => {
    if (wasOffline.current && isOnline) {
      console.log('[SyncRetry] Network reconnected, scheduling retry...');
      // Small delay to ensure network is stable
      const timer = setTimeout(retrySync, 1000);
      return () => clearTimeout(timer);
    }
    wasOffline.current = !isOnline;
  }, [isOnline, retrySync]);

  // Retry on foreground return
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (wasHidden.current && !document.hidden) {
        console.log('[SyncRetry] App returned to foreground, scheduling retry...');
        // Small delay to let app stabilize
        setTimeout(retrySync, 500);
      }
      wasHidden.current = document.hidden;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [retrySync]);

  // Listen for settings changes
  useEffect(() => {
    const handleSettingsChange = () => {
      setSyncState(getSyncState());
    };
    window.addEventListener('settings-changed', handleSettingsChange);
    return () => window.removeEventListener('settings-changed', handleSettingsChange);
  }, [getSyncState]);

  return {
    syncState,
    lastSyncAt: status.lastSyncAt,
    isSyncing,
    isEnabled: !!user && getSettings().autoSyncEnabled,
  };
}
