import { Component, ReactNode } from 'react';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { cn } from '@/lib/utils';

/**
 * Inner component that uses the hook and renders the indicator.
 */
function SyncStatusIndicatorInner({ className }: { className?: string }) {
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
        <span className="relative inline-flex rounded-full h-2 w-2 bg-warning" />
      )}
    </span>
  );
}

/**
 * Error boundary wrapper so SyncStatusIndicator never crashes the parent.
 */
class SyncStatusErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[SyncStatusIndicator] Render error caught:', error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

/**
 * Subtle sync status indicator with built-in error boundary.
 */
export function SyncStatusIndicator({ className }: { className?: string }) {
  return (
    <SyncStatusErrorBoundary>
      <SyncStatusIndicatorInner className={className} />
    </SyncStatusErrorBoundary>
  );
}
