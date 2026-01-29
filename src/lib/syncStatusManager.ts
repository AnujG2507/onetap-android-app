const SYNC_STATUS_KEY = 'sync_status';

export type SyncState = 'synced' | 'pending' | 'syncing' | 'offline' | 'disabled';

// Internal pending reasons for debugging (not exposed in UI)
export type PendingReason = 'network' | 'auth' | 'partial' | 'unknown';

export interface SyncStatus {
  lastSyncAt: number | null;
  lastUploadCount: number;
  lastDownloadCount: number;
  // P2 additions
  hasPendingChanges: boolean;
  pendingReason?: PendingReason;
  lastFailedAt?: number;
}

const defaultStatus: SyncStatus = {
  lastSyncAt: null,
  lastUploadCount: 0,
  lastDownloadCount: 0,
  hasPendingChanges: false,
};

// Event for sync status changes
const SYNC_STATUS_CHANGE_EVENT = 'sync-status-changed';

function notifyStatusChange(): void {
  window.dispatchEvent(new CustomEvent(SYNC_STATUS_CHANGE_EVENT));
}

export function onSyncStatusChange(callback: () => void): () => void {
  window.addEventListener(SYNC_STATUS_CHANGE_EVENT, callback);
  return () => window.removeEventListener(SYNC_STATUS_CHANGE_EVENT, callback);
}

export function getSyncStatus(): SyncStatus {
  try {
    const stored = localStorage.getItem(SYNC_STATUS_KEY);
    if (!stored) return defaultStatus;
    return { ...defaultStatus, ...JSON.parse(stored) } as SyncStatus;
  } catch {
    return defaultStatus;
  }
}

export function updateSyncStatus(updates: Partial<SyncStatus>): void {
  const current = getSyncStatus();
  const newStatus = { ...current, ...updates };
  localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(newStatus));
  notifyStatusChange();
}

export function recordSync(uploaded: number, downloaded: number): void {
  updateSyncStatus({
    lastSyncAt: Date.now(),
    lastUploadCount: uploaded,
    lastDownloadCount: downloaded,
    hasPendingChanges: false,
    pendingReason: undefined,
    lastFailedAt: undefined,
  });
}

export function markPending(reason: PendingReason = 'unknown'): void {
  updateSyncStatus({
    hasPendingChanges: true,
    pendingReason: reason,
  });
}

export function markSyncFailed(reason: PendingReason = 'unknown'): void {
  updateSyncStatus({
    hasPendingChanges: true,
    pendingReason: reason,
    lastFailedAt: Date.now(),
  });
}

export function clearPending(): void {
  updateSyncStatus({
    hasPendingChanges: false,
    pendingReason: undefined,
    lastFailedAt: undefined,
  });
}

export function clearSyncStatus(): void {
  localStorage.removeItem(SYNC_STATUS_KEY);
  notifyStatusChange();
}

export function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return 'Never synced';
  
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  
  return new Date(timestamp).toLocaleDateString();
}
