/**
 * Cloud Sync Module
 * 
 * All sync operations MUST go through the guarded entry points:
 * - guardedSync() - Primary: bidirectional sync
 * - guardedUpload() - Recovery: upload-only
 * - guardedDownload() - Recovery: download-only
 * 
 * Direct calls to internal functions are forbidden and will be caught
 * at review time. The legacy exports are preserved for backward compatibility
 * but route through guards.
 */

import { supabase } from '@/lib/supabaseClient';
import { getSavedLinks, SavedLink, getTrashLinks, TrashedLink } from './savedLinksManager';
import { 
  getScheduledActions, 
  computeNextTrigger,
} from './scheduledActionsManager';
import { 
  validateSyncAttempt, 
  markSyncStarted, 
  markSyncCompleted,
  type SyncTrigger 
} from './syncGuard';
import { recordSync } from './syncStatusManager';
import type { 
  ScheduledAction,
  ScheduledActionDestination, 
  RecurrenceType, 
  RecurrenceAnchor 
} from '@/types/scheduledAction';

// ============================================================================
// Types
// ============================================================================

export interface CloudBookmark {
  id: string;
  user_id: string;
  entity_id: string;
  url: string;
  title: string | null;
  description: string | null;
  folder: string;
  favicon: string | null;
  created_at: string;
  updated_at: string;
}

export interface CloudTrashItem {
  id: string;
  user_id: string;
  entity_id: string;
  url: string;
  title: string | null;
  description: string | null;
  folder: string;
  deleted_at: string;
  retention_days: number;
  original_created_at: string;
  created_at: string;
  updated_at: string;
}

export interface CloudScheduledAction {
  id: string;
  user_id: string;
  entity_id: string;
  name: string;
  description: string | null;
  destination: ScheduledActionDestination;
  trigger_time: number;
  recurrence: RecurrenceType;
  recurrence_anchor: RecurrenceAnchor | null;
  enabled: boolean;
  original_created_at: number;
  created_at: string;
  updated_at: string;
}

export interface GuardedSyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  error?: string;
  blocked?: boolean;
  blockReason?: string;
}

// ============================================================================
// GUARDED SYNC ENTRY POINTS
// All external sync calls MUST go through these functions
// ============================================================================

/**
 * PRIMARY SYNC ENTRY POINT
 * 
 * This is the ONLY function that should be called for normal sync operations.
 * It validates the sync attempt, runs bidirectional sync, and records results.
 * 
 * @param trigger - The type of sync trigger (manual, daily_auto)
 */
export async function guardedSync(trigger: SyncTrigger): Promise<GuardedSyncResult> {
  const validation = validateSyncAttempt(trigger);
  
  if (!validation.allowed) {
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      blocked: true,
      blockReason: validation.reason
    };
  }
  
  markSyncStarted(trigger);
  
  try {
    const result = await performBidirectionalSync();
    
    if (result.success) {
      recordSync(result.uploaded, result.downloaded);
    }
    
    markSyncCompleted(trigger, result.success);
    return result;
  } catch (error) {
    markSyncCompleted(trigger, false);
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      error: error instanceof Error ? error.message : 'Sync failed'
    };
  }
}

/**
 * RECOVERY: Upload-only sync
 * For use in recovery tools only - user explicitly chose this action
 */
export async function guardedUpload(): Promise<GuardedSyncResult> {
  const trigger: SyncTrigger = 'recovery_upload';
  const validation = validateSyncAttempt(trigger);
  
  if (!validation.allowed) {
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      blocked: true,
      blockReason: validation.reason
    };
  }
  
  markSyncStarted(trigger);
  
  try {
    const [bookmarkResult, trashResult, actionsResult] = await Promise.all([
      uploadBookmarksInternal(),
      uploadTrashInternal(),
      uploadScheduledActionsInternal()
    ]);
    
    const totalUploaded = bookmarkResult.uploaded + (trashResult.uploaded || 0) + (actionsResult.uploaded || 0);
    const success = bookmarkResult.success;
    if (success) {
      recordSync(totalUploaded, 0);
    }
    
    markSyncCompleted(trigger, success);
    
    return {
      success,
      uploaded: totalUploaded,
      downloaded: 0,
      error: bookmarkResult.error
    };
  } catch (error) {
    markSyncCompleted(trigger, false);
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      error: error instanceof Error ? error.message : 'Upload failed'
    };
  }
}

/**
 * RECOVERY: Download-only sync
 * For use in recovery tools only - user explicitly chose this action
 */
export async function guardedDownload(): Promise<GuardedSyncResult> {
  const trigger: SyncTrigger = 'recovery_download';
  const validation = validateSyncAttempt(trigger);
  
  if (!validation.allowed) {
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      blocked: true,
      blockReason: validation.reason
    };
  }
  
  markSyncStarted(trigger);
  
  try {
    const [bookmarkResult, trashResult, actionsResult] = await Promise.all([
      downloadBookmarksInternal(),
      downloadTrashInternal(),
      downloadScheduledActionsInternal()
    ]);
    
    const totalDownloaded = bookmarkResult.downloaded + (trashResult.downloaded || 0) + (actionsResult.downloaded || 0);
    const success = bookmarkResult.success;
    if (success) {
      recordSync(0, totalDownloaded);
    }
    
    markSyncCompleted(trigger, success);
    
    return {
      success,
      uploaded: 0,
      downloaded: totalDownloaded,
      error: bookmarkResult.error
    };
  } catch (error) {
    markSyncCompleted(trigger, false);
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      error: error instanceof Error ? error.message : 'Download failed'
    };
  }
}

// ============================================================================
// INTERNAL SYNC FUNCTIONS
// These perform the actual sync work - NOT to be called directly
// ============================================================================

/**
 * Performs bidirectional sync: upload local → cloud, then download cloud → local
 * INTERNAL: Do not call directly - use guardedSync() instead
 */
async function performBidirectionalSync(): Promise<{ success: boolean; uploaded: number; downloaded: number; error?: string }> {
  // Upload phase: bookmarks, trash, and scheduled actions
  const uploadResult = await uploadBookmarksInternal();
  if (!uploadResult.success) {
    return { success: false, uploaded: 0, downloaded: 0, error: uploadResult.error };
  }

  const trashUploadResult = await uploadTrashInternal();
  if (!trashUploadResult.success) {
    console.error('[CloudSync] Trash upload failed but continuing:', trashUploadResult.error);
  }

  const actionsUploadResult = await uploadScheduledActionsInternal();
  if (!actionsUploadResult.success) {
    console.error('[CloudSync] Scheduled actions upload failed but continuing:', actionsUploadResult.error);
  }

  // Download phase: bookmarks, trash, and scheduled actions
  const downloadResult = await downloadBookmarksInternal();
  if (!downloadResult.success) {
    return { success: false, uploaded: uploadResult.uploaded, downloaded: 0, error: downloadResult.error };
  }

  const trashDownloadResult = await downloadTrashInternal();
  if (!trashDownloadResult.success) {
    console.error('[CloudSync] Trash download failed but continuing:', trashDownloadResult.error);
  }

  const actionsDownloadResult = await downloadScheduledActionsInternal();
  if (!actionsDownloadResult.success) {
    console.error('[CloudSync] Scheduled actions download failed but continuing:', actionsDownloadResult.error);
  }

  const totalUploaded = uploadResult.uploaded + (actionsUploadResult.uploaded || 0);
  const totalDownloaded = downloadResult.downloaded + (actionsDownloadResult.downloaded || 0);

  return {
    success: true,
    uploaded: totalUploaded,
    downloaded: totalDownloaded,
  };
}

/**
 * Upload local bookmarks to cloud
 * INTERNAL: Uses local ID as entity_id - local is source of truth for identity
 */
async function uploadBookmarksInternal(): Promise<{ success: boolean; uploaded: number; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, uploaded: 0, error: 'Not authenticated' };
    }

    const localBookmarks = getSavedLinks();
    let uploaded = 0;

    for (const bookmark of localBookmarks) {
      const { error } = await supabase
        .from('cloud_bookmarks')
        .upsert({
          entity_id: bookmark.id,
          user_id: user.id,
          url: bookmark.url,
          title: bookmark.title || null,
          description: bookmark.description || null,
          folder: bookmark.tag || 'Uncategorized',
          favicon: null,
          created_at: new Date(bookmark.createdAt).toISOString(),
        }, {
          onConflict: 'user_id,entity_id',
          ignoreDuplicates: false,
        });

      if (!error) {
        uploaded++;
      } else {
        console.warn('[CloudSync] Failed to upload bookmark:', bookmark.id, error.message);
      }
    }

    return { success: true, uploaded };
  } catch (error) {
    console.error('[CloudSync] Upload failed:', error);
    return { success: false, uploaded: 0, error: error instanceof Error ? error.message : 'Upload failed' };
  }
}

/**
 * Upload local trash to cloud
 * INTERNAL: Uses local ID as entity_id
 */
async function uploadTrashInternal(): Promise<{ success: boolean; uploaded: number; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, uploaded: 0, error: 'Not authenticated' };
    }

    const localTrash = getTrashLinks();
    let uploaded = 0;

    for (const item of localTrash) {
      const { error } = await supabase
        .from('cloud_trash')
        .upsert({
          entity_id: item.id,
          user_id: user.id,
          url: item.url,
          title: item.title || null,
          description: item.description || null,
          folder: item.tag || 'Uncategorized',
          deleted_at: new Date(item.deletedAt).toISOString(),
          retention_days: item.retentionDays,
          original_created_at: new Date(item.createdAt).toISOString(),
        }, {
          onConflict: 'user_id,entity_id',
          ignoreDuplicates: false,
        });

      if (!error) {
        uploaded++;
      } else {
        console.warn('[CloudSync] Failed to upload trash item:', item.id, error.message);
      }
    }

    return { success: true, uploaded };
  } catch (error) {
    console.error('[CloudSync] Trash upload failed:', error);
    return { success: false, uploaded: 0, error: error instanceof Error ? error.message : 'Trash upload failed' };
  }
}

/**
 * Download bookmarks from cloud to local storage
 * INTERNAL: Uses entity_id as local ID - never rewrites local IDs
 */
async function downloadBookmarksInternal(): Promise<{ success: boolean; downloaded: number; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, downloaded: 0, error: 'Not authenticated' };
    }

    const { data: cloudBookmarks, error } = await supabase
      .from('cloud_bookmarks')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    if (!cloudBookmarks || cloudBookmarks.length === 0) {
      return { success: true, downloaded: 0 };
    }

    const STORAGE_KEY = 'saved_links';
    const existingLinks = getSavedLinks();
    const existingIds = new Set(existingLinks.map(l => l.id));

    const newBookmarks: SavedLink[] = [];
    for (const cloudBookmark of cloudBookmarks) {
      const entityId = cloudBookmark.entity_id;
      
      if (!existingIds.has(entityId)) {
        newBookmarks.push({
          id: entityId,
          url: cloudBookmark.url,
          title: cloudBookmark.title || '',
          description: cloudBookmark.description || '',
          tag: cloudBookmark.folder === 'Uncategorized' ? null : cloudBookmark.folder,
          createdAt: new Date(cloudBookmark.created_at).getTime(),
          isShortlisted: false,
        });
        existingIds.add(entityId);
      }
    }

    if (newBookmarks.length > 0) {
      const mergedLinks = [...existingLinks, ...newBookmarks];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedLinks));
    }

    return { success: true, downloaded: newBookmarks.length };
  } catch (error) {
    console.error('[CloudSync] Download failed:', error);
    return { success: false, downloaded: 0, error: error instanceof Error ? error.message : 'Download failed' };
  }
}

/**
 * Download trash from cloud to local storage
 * INTERNAL: Uses entity_id as local ID
 */
async function downloadTrashInternal(): Promise<{ success: boolean; downloaded: number; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, downloaded: 0, error: 'Not authenticated' };
    }

    const { data: cloudTrash, error } = await supabase
      .from('cloud_trash')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    if (!cloudTrash || cloudTrash.length === 0) {
      return { success: true, downloaded: 0 };
    }

    const TRASH_STORAGE_KEY = 'saved_links_trash';
    const existingTrash = getTrashLinks();
    const existingIds = new Set(existingTrash.map(l => l.id));

    const newTrashItems: TrashedLink[] = [];
    for (const cloudItem of cloudTrash) {
      const entityId = cloudItem.entity_id;
      
      if (!existingIds.has(entityId)) {
        newTrashItems.push({
          id: entityId,
          url: cloudItem.url,
          title: cloudItem.title || '',
          description: cloudItem.description || '',
          tag: cloudItem.folder === 'Uncategorized' ? null : cloudItem.folder,
          createdAt: new Date(cloudItem.original_created_at).getTime(),
          isShortlisted: false,
          deletedAt: new Date(cloudItem.deleted_at).getTime(),
          retentionDays: cloudItem.retention_days,
        });
        existingIds.add(entityId);
      }
    }

    if (newTrashItems.length > 0) {
      const mergedTrash = [...existingTrash, ...newTrashItems];
      localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(mergedTrash));
    }

    return { success: true, downloaded: newTrashItems.length };
  } catch (error) {
    console.error('[CloudSync] Trash download failed:', error);
    return { success: false, downloaded: 0, error: error instanceof Error ? error.message : 'Trash download failed' };
  }
}

// ============================================================================
// SCHEDULED ACTIONS SYNC FUNCTIONS
// ============================================================================

const SCHEDULED_ACTIONS_STORAGE_KEY = 'scheduled_actions';

/**
 * Upload local scheduled actions to cloud
 * INTERNAL: Uses local ID as entity_id - local is source of truth for identity
 */
async function uploadScheduledActionsInternal(): Promise<{ success: boolean; uploaded: number; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, uploaded: 0, error: 'Not authenticated' };
    }

    const localActions = getScheduledActions();
    let uploaded = 0;

    for (const action of localActions) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('cloud_scheduled_actions') as any)
        .upsert({
          entity_id: action.id,
          user_id: user.id,
          name: action.name,
          description: action.description || null,
          destination: action.destination,
          trigger_time: action.triggerTime,
          recurrence: action.recurrence,
          recurrence_anchor: action.recurrenceAnchor || null,
          enabled: action.enabled,
          original_created_at: action.createdAt,
        }, {
          onConflict: 'user_id,entity_id',
          ignoreDuplicates: false,
        });

      if (!error) {
        uploaded++;
      } else {
        console.warn('[CloudSync] Failed to upload scheduled action:', action.id, error.message);
      }
    }

    console.log(`[CloudSync] Uploaded ${uploaded} scheduled actions`);
    return { success: true, uploaded };
  } catch (error) {
    console.error('[CloudSync] Scheduled actions upload failed:', error);
    return { success: false, uploaded: 0, error: error instanceof Error ? error.message : 'Scheduled actions upload failed' };
  }
}

/**
 * Download scheduled actions from cloud to local storage
 * INTERNAL: Uses entity_id as local ID - never rewrites local IDs
 * For recurring actions with past-due trigger times, recalculates next occurrence
 */
async function downloadScheduledActionsInternal(): Promise<{ success: boolean; downloaded: number; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, downloaded: 0, error: 'Not authenticated' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cloudActions, error } = await (supabase.from('cloud_scheduled_actions') as any)
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    if (!cloudActions || cloudActions.length === 0) {
      return { success: true, downloaded: 0 };
    }

    const existingActions = getScheduledActions();
    const existingIds = new Set(existingActions.map(a => a.id));

    const newActions: ScheduledAction[] = [];
    const now = Date.now();

    for (const cloudAction of cloudActions) {
      const entityId = cloudAction.entity_id;
      
      if (!existingIds.has(entityId)) {
        // Validate destination structure
        if (!cloudAction.destination || typeof cloudAction.destination !== 'object') {
          console.warn('[CloudSync] Skipping action with invalid destination:', entityId);
          continue;
        }

        let triggerTime = cloudAction.trigger_time;
        const recurrence = cloudAction.recurrence as RecurrenceType;
        const recurrenceAnchor = cloudAction.recurrence_anchor as unknown as RecurrenceAnchor | null;

        // For recurring actions with past-due trigger times, recalculate
        if (triggerTime < now && recurrence !== 'once' && recurrenceAnchor) {
          triggerTime = computeNextTrigger(recurrence, recurrenceAnchor, now);
          console.log(`[CloudSync] Recalculated trigger time for recurring action: ${entityId}`);
        }

        // For one-time past-due actions, download as disabled
        const enabled = recurrence === 'once' && triggerTime < now 
          ? false 
          : cloudAction.enabled;

        newActions.push({
          id: entityId,
          name: cloudAction.name,
          description: cloudAction.description || undefined,
          destination: cloudAction.destination as unknown as ScheduledActionDestination,
          triggerTime,
          recurrence,
          enabled,
          createdAt: cloudAction.original_created_at,
          recurrenceAnchor: recurrenceAnchor || undefined,
          // Device-specific fields - not synced
          lastNotificationTime: undefined,
          notificationClicked: undefined,
        });
        existingIds.add(entityId);
      }
    }

    if (newActions.length > 0) {
      const mergedActions = [...existingActions, ...newActions];
      localStorage.setItem(SCHEDULED_ACTIONS_STORAGE_KEY, JSON.stringify(mergedActions));
      // Notify listeners about the change
      window.dispatchEvent(new CustomEvent('scheduled-actions-changed'));
      console.log(`[CloudSync] Downloaded ${newActions.length} new scheduled actions`);
    }

    return { success: true, downloaded: newActions.length };
  } catch (error) {
    console.error('[CloudSync] Scheduled actions download failed:', error);
    return { success: false, downloaded: 0, error: error instanceof Error ? error.message : 'Scheduled actions download failed' };
  }
}

// ============================================================================
// LEGACY EXPORTS
// Preserved for backward compatibility - route through guards
// ============================================================================

/**
 * @deprecated Use guardedSync('manual') instead
 */
export async function syncBookmarks(): Promise<{ success: boolean; uploaded: number; downloaded: number; error?: string }> {
  console.warn('[CloudSync] syncBookmarks() is deprecated - use guardedSync() instead');
  return guardedSync('manual');
}

/**
 * @deprecated Use guardedUpload() instead
 */
export async function uploadBookmarksToCloud(): Promise<{ success: boolean; uploaded: number; error?: string }> {
  console.warn('[CloudSync] uploadBookmarksToCloud() is deprecated - use guardedUpload() instead');
  const result = await guardedUpload();
  return { success: result.success, uploaded: result.uploaded, error: result.error };
}

/**
 * @deprecated Use guardedDownload() instead
 */
export async function downloadBookmarksFromCloud(): Promise<{ success: boolean; downloaded: number; error?: string }> {
  console.warn('[CloudSync] downloadBookmarksFromCloud() is deprecated - use guardedDownload() instead');
  const result = await guardedDownload();
  return { success: result.success, downloaded: result.downloaded, error: result.error };
}

/**
 * @deprecated Use guardedUpload() instead
 */
export async function uploadTrashToCloud(): Promise<{ success: boolean; uploaded: number; error?: string }> {
  console.warn('[CloudSync] uploadTrashToCloud() is deprecated - use guardedUpload() instead');
  const result = await guardedUpload();
  return { success: result.success, uploaded: result.uploaded, error: result.error };
}

/**
 * @deprecated Use guardedDownload() instead
 */
export async function downloadTrashFromCloud(): Promise<{ success: boolean; downloaded: number; error?: string }> {
  console.warn('[CloudSync] downloadTrashFromCloud() is deprecated - use guardedDownload() instead');
  const result = await guardedDownload();
  return { success: result.success, downloaded: result.downloaded, error: result.error };
}

// ============================================================================
// CLOUD MANAGEMENT UTILITIES
// ============================================================================

/**
 * Delete all cloud bookmarks for the current user
 */
export async function clearCloudBookmarks(): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { error } = await supabase
      .from('cloud_bookmarks')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('[CloudSync] Clear failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Clear failed' };
  }
}

/**
 * Delete all cloud trash for the current user
 */
export async function clearCloudTrash(): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { error } = await supabase
      .from('cloud_trash')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('[CloudSync] Clear trash failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Clear trash failed' };
  }
}

/**
 * Get the count of cloud bookmarks for the current user
 */
export async function getCloudBookmarkCount(): Promise<number | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return null;
    }

    const { count, error } = await supabase
      .from('cloud_bookmarks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    return count ?? 0;
  } catch (error) {
    console.error('[CloudSync] Count failed:', error);
    return null;
  }
}

/**
 * Get the count of cloud trash for the current user
 */
export async function getCloudTrashCount(): Promise<number | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return null;
    }

    const { count, error } = await supabase
      .from('cloud_trash')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    return count ?? 0;
  } catch (error) {
    console.error('[CloudSync] Trash count failed:', error);
    return null;
  }
}

/**
 * Get the count of cloud scheduled actions for the current user
 */
export async function getCloudScheduledActionsCount(): Promise<number | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count, error } = await (supabase.from('cloud_scheduled_actions') as any)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    return count ?? 0;
  } catch (error) {
    console.error('[CloudSync] Scheduled actions count failed:', error);
    return null;
  }
}
