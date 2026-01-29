import { useSyncStatus } from '@/hooks/useSyncStatus';
import { cn } from '@/lib/utils';

/**
 * Subtle sync status indicator.
 * Shows a small colored dot that indicates sync state:
 * - Green (with brief pulse): synced
 * - Amber: pending changes or syncing
 * - Hidden: offline or disabled
 */
export function SyncStatusIndicator({ className }: { className?: string }) {
  const { syncState, isEnabled } = useSyncStatus();

  // Don't show indicator if sync is disabled or offline
  if (!isEnabled || syncState === 'disabled' || syncState === 'offline') {
    return null;
  }

  return (
    <span 
      className={cn(
        'relative flex h-2 w-2',
        className
      )}
      aria-label={`Sync status: ${syncState}`}
    >
      {/* Synced state: green with subtle pulse animation */}
      {syncState === 'synced' && (
        <>
          <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping [animation-duration:2s] [animation-iteration-count:1]" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </>
      )}

      {/* Pending or syncing state: amber */}
      {(syncState === 'pending' || syncState === 'syncing') && (
        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
      )}
    </span>
  );
}
