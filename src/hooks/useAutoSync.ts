import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from './useAuth';
import { useNetworkStatus } from './useNetworkStatus';
import { guardedSync } from '@/lib/cloudSync';
import { getSyncStatus } from '@/lib/syncStatusManager';
import { getSettings } from '@/lib/settingsManager';
import { SyncGuardViolation } from '@/lib/syncGuard';

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
 * 
 * Runtime guards in syncGuard.ts enforce these constraints and will throw
 * in development if violated.
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
   * Uses guardedSync with 'daily_auto' trigger - guards enforce timing.
   * Only runs if:
   * - User is authenticated
   * - Auto-sync is enabled
   * - Device is online
   * - Last successful sync was >24h ago (enforced by guard)
   */
  const performDailySync = useCallback(async () => {
    if (!user || !isEnabled || !isOnline || isSyncing.current) {
      return;
    }

    // Skip if we already know it's too soon (optimization to avoid guard throw in dev)
    if (!shouldPerformDailySync()) {
      console.log('[DailySync] Skipped - synced within last 24 hours');
      return;
    }

    isSyncing.current = true;
    console.log('[DailySync] Starting daily foreground sync...');

    try {
      // Use guarded sync with daily_auto trigger
      // Guards will validate timing and prevent duplicates
      const result = await guardedSync('daily_auto');
      
      if (result.blocked) {
        // Guard blocked the sync - this is expected in some cases
        console.log('[DailySync] Blocked by guard:', result.blockReason);
        return;
      }
      
      if (result.success) {
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
        console.warn('[DailySync] Failed:', result.error);
      }
    } catch (error) {
      // In development, SyncGuardViolation will throw - this catches other errors
      if (error instanceof SyncGuardViolation) {
        console.warn('[DailySync] Guard violation:', error.message);
      } else {
        console.error('[DailySync] Error:', error);
      }
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
      // Short delay on initial mount to not compete with app startup
      setTimeout(performDailySync, 2000);
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
