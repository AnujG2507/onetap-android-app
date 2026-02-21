import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { useNetworkStatus } from './useNetworkStatus';
import { getSettings } from '@/lib/settingsManager';
import { 
  getSyncStatus, 
  onSyncStatusChange, 
  type SyncState,
} from '@/lib/syncStatusManager';

/**
 * Hook for tracking sync status (display-only).
 * 
 * This hook is a pure state tracker — it reads sync status and derives the
 * UI state (synced, pending, offline, etc.) without triggering any sync
 * operations. Sync is intentional and only happens via:
 *   1. Explicit user action ("Sync now" button)
 *   2. Daily auto-sync on foreground (useAutoSync)
 * 
 * Reactive retries (on-reconnect, on-foreground) are intentionally excluded
 * per PRODUCT_IDEOLOGY.md Section 3.
 */
export function useSyncStatus() {
  const { user } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [status, setStatus] = useState(getSyncStatus());

  // Derive the display state
  const getSyncState = useCallback((): SyncState => {
    if (!user || !getSettings().autoSyncEnabled) return 'disabled';
    if (!isOnline) return 'offline';
    if (status.hasPendingChanges) return 'pending';
    return 'synced';
  }, [user, isOnline, status.hasPendingChanges]);

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
    isSyncing: syncState === 'syncing',
    isEnabled: !!user && getSettings().autoSyncEnabled,
  };
}
