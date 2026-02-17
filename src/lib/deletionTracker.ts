/**
 * Deletion Tracker
 * 
 * Manages pending deletion records in localStorage for cloud sync.
 * When entities are permanently deleted locally, their IDs are recorded here
 * so the next sync can:
 *   1. Delete corresponding cloud rows
 *   2. Record in cloud_deleted_entities to prevent resurrection
 */

const PENDING_DELETIONS_KEY = 'pending_cloud_deletions';

export type DeletableEntityType = 'bookmark' | 'trash' | 'shortcut' | 'scheduled_action';

export interface PendingDeletion {
  entity_type: DeletableEntityType;
  entity_id: string;
}

/**
 * Get all pending deletions
 */
export function getPendingDeletions(): PendingDeletion[] {
  try {
    const stored = localStorage.getItem(PENDING_DELETIONS_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Record a deletion for sync
 */
export function recordDeletion(entityType: DeletableEntityType, entityId: string): void {
  const pending = getPendingDeletions();
  
  // Avoid duplicates
  if (pending.some(d => d.entity_type === entityType && d.entity_id === entityId)) {
    return;
  }
  
  pending.push({ entity_type: entityType, entity_id: entityId });
  localStorage.setItem(PENDING_DELETIONS_KEY, JSON.stringify(pending));
  console.log(`[DeletionTracker] Recorded deletion: ${entityType}/${entityId}`);
}

/**
 * Clear all pending deletions (after successful upload)
 */
export function clearPendingDeletions(): void {
  localStorage.removeItem(PENDING_DELETIONS_KEY);
  console.log('[DeletionTracker] Cleared pending deletions');
}

/**
 * Clear specific pending deletions
 */
export function clearDeletions(deletions: PendingDeletion[]): void {
  const pending = getPendingDeletions();
  const toRemove = new Set(deletions.map(d => `${d.entity_type}:${d.entity_id}`));
  const remaining = pending.filter(d => !toRemove.has(`${d.entity_type}:${d.entity_id}`));
  localStorage.setItem(PENDING_DELETIONS_KEY, JSON.stringify(remaining));
}
