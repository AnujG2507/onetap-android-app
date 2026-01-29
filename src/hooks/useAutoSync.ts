import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from './useAuth';
import { useNetworkStatus } from './useNetworkStatus';
import { syncBookmarks } from '@/lib/cloudSync';
import { getSyncStatus, recordSync } from '@/lib/syncStatusManager';
import { getSettings } from '@/lib/settingsManager';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Calm, intentional sync hook.
 * 
 * Design philosophy:
 * - Sync is a convergence operation, not a live mirror
 * - Local data remains authoritative at all times
 * - Users should never feel data is being uploaded constantly
 * 
 * Sync triggers (only these, nothing else):
 * 1. Explicit user action via "Sync now" button (handled by CloudBackupSection)
 * 2. Once per 24 hours on app foreground (if auto-sync enabled)
 * 
 * Explicitly disallowed:
 * - Sync on every CRUD operation
 * - Sync on debounced local changes
 * - Background timers, polling, or hidden retries
 * - Network reconnection triggers
 */
export function useAutoSync() {
  const { user, loading } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [isEnabled, setIsEnabled] = useState(() => getSettings().autoSyncEnabled);
  const isSyncing = useRef(false);
  const hasAttemptedForegroundSync = useRef(false);

  // Listen for settings changes
  useEffect(() => {
    const checkSettings = () => {
      setIsEnabled(getSettings().autoSyncEnabled);
    };
    
    window.addEventListener('settings-changed', checkSettings);
    return () => window.removeEventListener('settings-changed', checkSettings);
  }, []);

  /**
   * Check if enough time has passed since last successful sync.
   * Returns true if we should perform a daily sync.
   */
  const shouldPerformDailySync = useCallback((): boolean => {
    const status = getSyncStatus();
    if (!status.lastSyncAt) {
      // Never synced before - should sync
      return true;
    }
    
    const timeSinceLastSync = Date.now() - status.lastSyncAt;
    return timeSinceLastSync >= TWENTY_FOUR_HOURS_MS;
  }, []);

  /**
   * Perform the daily foreground sync.
   * Only runs if:
   * - User is authenticated
   * - Auto-sync is enabled
   * - Device is online
   * - Last successful sync was >24h ago
   */
  const performDailySync = useCallback(async () => {
    if (!user || !isEnabled || !isOnline || isSyncing.current) {
      return;
    }

    if (!shouldPerformDailySync()) {
      console.log('[DailySync] Skipped - synced within last 24 hours');
      return;
    }

    isSyncing.current = true;
    console.log('[DailySync] Starting daily foreground sync...');

    try {
      const result = await syncBookmarks();
      
      if (result.success) {
        recordSync(result.uploaded, result.downloaded);
        console.log('[DailySync] Completed:', { 
          uploaded: result.uploaded, 
          downloaded: result.downloaded 
        });
        
        // Reload only if we got new data from cloud
        if (result.downloaded > 0) {
          window.location.reload();
        }
      } else {
        // Failed sync - log but don't retry aggressively
        // User can manually sync if needed
        console.warn('[DailySync] Failed:', result.error);
      }
    } catch (error) {
      console.error('[DailySync] Error:', error);
    } finally {
      isSyncing.current = false;
    }
  }, [user, isEnabled, isOnline, shouldPerformDailySync]);

  /**
   * Handle app returning to foreground.
   * Triggers daily sync check (once per app session).
   */
  useEffect(() => {
    if (loading || !user || !isEnabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !hasAttemptedForegroundSync.current) {
        hasAttemptedForegroundSync.current = true;
        // Small delay to let app settle after foregrounding
        setTimeout(performDailySync, 2000);
      }
    };

    // Check on initial mount (counts as "foregrounding")
    if (!hasAttemptedForegroundSync.current) {
      hasAttemptedForegroundSync.current = true;
      // Longer delay on initial mount to not compete with app startup
      setTimeout(performDailySync, 5000);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loading, user, isEnabled, performDailySync]);

  return { 
    isAutoSyncEnabled: !!user && isEnabled,
    // Expose for manual sync button to reset foreground flag
    resetForegroundFlag: () => { hasAttemptedForegroundSync.current = false; }
  };
}

/**
 * @deprecated No longer needed - sync is intentional, not reactive.
 * Kept for backward compatibility but does nothing.
 */
export function notifyBookmarkChange() {
  // Intentionally empty - sync is not triggered by local changes
  // This is by design: sync is a convergence operation, not a live mirror
}

/**
 * @deprecated No longer needed - sync is intentional, not reactive.
 * Kept for backward compatibility but does nothing.
 */
export function notifyTrashChange() {
  // Intentionally empty - sync is not triggered by local changes
}
