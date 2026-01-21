const SYNC_STATUS_KEY = 'sync_status';

export interface SyncStatus {
  lastSyncAt: number | null;
  lastUploadCount: number;
  lastDownloadCount: number;
}

const defaultStatus: SyncStatus = {
  lastSyncAt: null,
  lastUploadCount: 0,
  lastDownloadCount: 0,
};

export function getSyncStatus(): SyncStatus {
  try {
    const stored = localStorage.getItem(SYNC_STATUS_KEY);
    if (!stored) return defaultStatus;
    return JSON.parse(stored) as SyncStatus;
  } catch {
    return defaultStatus;
  }
}

export function updateSyncStatus(updates: Partial<SyncStatus>): void {
  const current = getSyncStatus();
  const newStatus = { ...current, ...updates };
  localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(newStatus));
}

export function recordSync(uploaded: number, downloaded: number): void {
  updateSyncStatus({
    lastSyncAt: Date.now(),
    lastUploadCount: uploaded,
    lastDownloadCount: downloaded,
  });
}

export function clearSyncStatus(): void {
  localStorage.removeItem(SYNC_STATUS_KEY);
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
