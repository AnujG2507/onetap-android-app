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
import { 
  getPendingDeletions, 
  clearPendingDeletions,
  type PendingDeletion 
} from './deletionTracker';
import { isFileDependentType, getFileTypeEmoji } from '@/types/shortcut';
import type { ShortcutData, ShortcutIcon, IconType } from '@/types/shortcut';
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
// Constants
// ============================================================================

const SHORTCUTS_STORAGE_KEY = 'quicklaunch_shortcuts';
const SCHEDULED_ACTIONS_STORAGE_KEY = 'scheduled_actions';

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
    const [bookmarkResult, trashResult, actionsResult, shortcutsResult] = await Promise.all([
      uploadBookmarksInternal(),
      uploadTrashInternal(),
      uploadScheduledActionsInternal(),
      uploadShortcutsInternal(),
    ]);
    
    // Upload deletions after main uploads
    await uploadDeletionsInternal();
    
    const totalUploaded = bookmarkResult.uploaded + (trashResult.uploaded || 0) + (actionsResult.uploaded || 0) + (shortcutsResult.uploaded || 0);
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
    // Download deletion list first to use as exclusion set
    const deletedSet = await fetchDeletedEntitySet();
    
    const [bookmarkResult, trashResult, actionsResult, shortcutsResult] = await Promise.all([
      downloadBookmarksInternal(deletedSet),
      downloadTrashInternal(deletedSet),
      downloadScheduledActionsInternal(deletedSet),
      downloadShortcutsInternal(deletedSet),
    ]);
    
    // Reconcile local deletions
    await reconcileLocalDeletions(deletedSet);
    
    const totalDownloaded = bookmarkResult.downloaded + (trashResult.downloaded || 0) + (actionsResult.downloaded || 0) + (shortcutsResult.downloaded || 0);
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
  // Upload phase: bookmarks, trash, shortcuts, and scheduled actions
  const uploadResult = await uploadBookmarksInternal();
  if (!uploadResult.success) {
    return { success: false, uploaded: 0, downloaded: 0, error: uploadResult.error };
  }

  const trashUploadResult = await uploadTrashInternal();
  if (!trashUploadResult.success) {
    console.error('[CloudSync] Trash upload failed but continuing:', trashUploadResult.error);
  }

  const shortcutsUploadResult = await uploadShortcutsInternal();
  if (!shortcutsUploadResult.success) {
    console.error('[CloudSync] Shortcuts upload failed but continuing:', shortcutsUploadResult.error);
  }

  const actionsUploadResult = await uploadScheduledActionsInternal();
  if (!actionsUploadResult.success) {
    console.error('[CloudSync] Scheduled actions upload failed but continuing:', actionsUploadResult.error);
  }

  // Upload deletions
  await uploadDeletionsInternal();

  // Download phase: fetch deletion set first
  const deletedSet = await fetchDeletedEntitySet();

  const downloadResult = await downloadBookmarksInternal(deletedSet);
  if (!downloadResult.success) {
    return { success: false, uploaded: uploadResult.uploaded, downloaded: 0, error: downloadResult.error };
  }

  const trashDownloadResult = await downloadTrashInternal(deletedSet);
  if (!trashDownloadResult.success) {
    console.error('[CloudSync] Trash download failed but continuing:', trashDownloadResult.error);
  }

  const shortcutsDownloadResult = await downloadShortcutsInternal(deletedSet);
  if (!shortcutsDownloadResult.success) {
    console.error('[CloudSync] Shortcuts download failed but continuing:', shortcutsDownloadResult.error);
  }

  const actionsDownloadResult = await downloadScheduledActionsInternal(deletedSet);
  if (!actionsDownloadResult.success) {
    console.error('[CloudSync] Scheduled actions download failed but continuing:', actionsDownloadResult.error);
  }

  // Reconcile local deletions
  await reconcileLocalDeletions(deletedSet);

  const totalUploaded = uploadResult.uploaded + (shortcutsUploadResult.uploaded || 0) + (actionsUploadResult.uploaded || 0);
  const totalDownloaded = downloadResult.downloaded + (shortcutsDownloadResult.downloaded || 0) + (actionsDownloadResult.downloaded || 0);

  return {
    success: true,
    uploaded: totalUploaded,
    downloaded: totalDownloaded,
  };
}

// ============================================================================
// DELETION SYNC
// ============================================================================

/**
 * Fetch the set of deleted entity IDs from cloud for current user
 */
async function fetchDeletedEntitySet(): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return result;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('cloud_deleted_entities') as any)
      .select('entity_type, entity_id')
      .eq('user_id', user.id);

    if (error) {
      console.error('[CloudSync] Failed to fetch deleted entities:', error.message);
      return result;
    }

    if (data) {
      for (const row of data) {
        if (!result.has(row.entity_type)) {
          result.set(row.entity_type, new Set());
        }
        result.get(row.entity_type)!.add(row.entity_id);
      }
    }
  } catch (e) {
    console.error('[CloudSync] Error fetching deleted entities:', e);
  }
  
  return result;
}

/**
 * Upload pending deletions to cloud and delete corresponding cloud rows
 */
async function uploadDeletionsInternal(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const pending = getPendingDeletions();
    if (pending.length === 0) return;

    console.log(`[CloudSync] Uploading ${pending.length} deletions`);

    for (const deletion of pending) {
      // Record in cloud_deleted_entities
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('cloud_deleted_entities') as any)
        .upsert({
          user_id: user.id,
          entity_type: deletion.entity_type,
          entity_id: deletion.entity_id,
        }, {
          onConflict: 'user_id,entity_type,entity_id',
          ignoreDuplicates: true,
        });

      // Delete from corresponding cloud table
      const tableName = getCloudTableForEntityType(deletion.entity_type);
      if (tableName) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from(tableName as any) as any)
          .delete()
          .eq('user_id', user.id)
          .eq('entity_id', deletion.entity_id);
      }
    }

    clearPendingDeletions();
    console.log('[CloudSync] Deletions uploaded successfully');
  } catch (e) {
    console.error('[CloudSync] Failed to upload deletions:', e);
  }
}

function getCloudTableForEntityType(entityType: string): string | null {
  switch (entityType) {
    case 'bookmark': return 'cloud_bookmarks';
    case 'trash': return 'cloud_trash';
    case 'shortcut': return 'cloud_shortcuts';
    case 'scheduled_action': return 'cloud_scheduled_actions';
    default: return null;
  }
}

/**
 * Reconcile local storage by removing entities that appear in the cloud deleted set
 */
async function reconcileLocalDeletions(deletedSet: Map<string, Set<string>>): Promise<void> {
  // Reconcile bookmarks
  const deletedBookmarks = deletedSet.get('bookmark');
  if (deletedBookmarks && deletedBookmarks.size > 0) {
    const links = getSavedLinks();
    const filtered = links.filter(l => !deletedBookmarks.has(l.id));
    if (filtered.length !== links.length) {
      localStorage.setItem('saved_links', JSON.stringify(filtered));
      console.log(`[CloudSync] Reconciled ${links.length - filtered.length} deleted bookmarks`);
    }
  }

  // Reconcile trash
  const deletedTrash = deletedSet.get('trash');
  if (deletedTrash && deletedTrash.size > 0) {
    const trash = getTrashLinks();
    const filtered = trash.filter(t => !deletedTrash.has(t.id));
    if (filtered.length !== trash.length) {
      localStorage.setItem('saved_links_trash', JSON.stringify(filtered));
      console.log(`[CloudSync] Reconciled ${trash.length - filtered.length} deleted trash items`);
    }
  }

  // Reconcile shortcuts
  const deletedShortcuts = deletedSet.get('shortcut');
  if (deletedShortcuts && deletedShortcuts.size > 0) {
    try {
      const stored = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
      if (stored) {
        const shortcuts: ShortcutData[] = JSON.parse(stored);
        const filtered = shortcuts.filter(s => !deletedShortcuts.has(s.id));
        if (filtered.length !== shortcuts.length) {
          localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(filtered));
          window.dispatchEvent(new CustomEvent('shortcuts-changed', { detail: filtered }));
          console.log(`[CloudSync] Reconciled ${shortcuts.length - filtered.length} deleted shortcuts`);
        }
      }
    } catch (e) {
      console.error('[CloudSync] Error reconciling shortcuts:', e);
    }
  }

  // Reconcile scheduled actions
  const deletedActions = deletedSet.get('scheduled_action');
  if (deletedActions && deletedActions.size > 0) {
    const actions = getScheduledActions();
    const filtered = actions.filter(a => !deletedActions.has(a.id));
    if (filtered.length !== actions.length) {
      localStorage.setItem(SCHEDULED_ACTIONS_STORAGE_KEY, JSON.stringify(filtered));
      window.dispatchEvent(new CustomEvent('scheduled-actions-changed'));
      console.log(`[CloudSync] Reconciled ${actions.length - filtered.length} deleted scheduled actions`);
    }
  }
}

// ============================================================================
// BOOKMARKS SYNC
// ============================================================================

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
async function downloadBookmarksInternal(deletedSet?: Map<string, Set<string>>): Promise<{ success: boolean; downloaded: number; error?: string }> {
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
    const deletedBookmarks = deletedSet?.get('bookmark') || new Set<string>();

    const newBookmarks: SavedLink[] = [];
    for (const cloudBookmark of cloudBookmarks) {
      const entityId = cloudBookmark.entity_id;
      
      if (!existingIds.has(entityId) && !deletedBookmarks.has(entityId)) {
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
async function downloadTrashInternal(deletedSet?: Map<string, Set<string>>): Promise<{ success: boolean; downloaded: number; error?: string }> {
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
    const deletedTrashIds = deletedSet?.get('trash') || new Set<string>();

    const newTrashItems: TrashedLink[] = [];
    for (const cloudItem of cloudTrash) {
      const entityId = cloudItem.entity_id;
      
      if (!existingIds.has(entityId) && !deletedTrashIds.has(entityId)) {
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
// SHORTCUTS SYNC (NEW)
// ============================================================================

/**
 * Upload local shortcuts to cloud (intent metadata only, no binary data)
 */
async function uploadShortcutsInternal(): Promise<{ success: boolean; uploaded: number; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, uploaded: 0, error: 'Not authenticated' };
    }

    const stored = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    const localShortcuts: ShortcutData[] = stored ? JSON.parse(stored) : [];
    let uploaded = 0;

    for (const shortcut of localShortcuts) {
      // Determine cloud-safe icon
      let iconType: string | null = null;
      let iconValue: string | null = null;
      
      if (shortcut.icon.type === 'thumbnail') {
        // Thumbnail is binary - use file-type emoji fallback
        iconType = 'emoji';
        iconValue = getFileTypeEmoji(shortcut.fileType);
      } else {
        iconType = shortcut.icon.type;
        iconValue = shortcut.icon.value;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('cloud_shortcuts') as any)
        .upsert({
          entity_id: shortcut.id,
          user_id: user.id,
          type: shortcut.type,
          name: shortcut.name,
          // Privacy: only store content_uri for links, null for file-based
          content_uri: isFileDependentType(shortcut.type) ? null : (shortcut.type === 'text' ? null : shortcut.contentUri || null),
          file_type: shortcut.fileType || null,
          mime_type: shortcut.mimeType || null,
          phone_number: shortcut.phoneNumber || null,
          contact_name: shortcut.contactName || null,
          message_app: shortcut.messageApp || null,
          quick_messages: shortcut.quickMessages || null,
          resume_enabled: shortcut.resumeEnabled ?? null,
          auto_advance_interval: shortcut.autoAdvanceInterval ?? null,
          image_count: shortcut.imageUris?.length ?? null,
          icon_type: iconType,
          icon_value: iconValue,
          usage_count: shortcut.usageCount,
          original_created_at: shortcut.createdAt,
          // Text shortcut content
          text_content: shortcut.type === 'text' ? (shortcut.textContent || null) : null,
          is_checklist: shortcut.type === 'text' ? (shortcut.isChecklist ?? false) : null,
        }, {
          onConflict: 'user_id,entity_id',
          ignoreDuplicates: false,
        });

      if (!error) {
        uploaded++;
      } else {
        console.warn('[CloudSync] Failed to upload shortcut:', shortcut.id, error.message);
      }
    }

    console.log(`[CloudSync] Uploaded ${uploaded} shortcuts`);
    return { success: true, uploaded };
  } catch (error) {
    console.error('[CloudSync] Shortcuts upload failed:', error);
    return { success: false, uploaded: 0, error: error instanceof Error ? error.message : 'Shortcuts upload failed' };
  }
}

/**
 * Download shortcuts from cloud to local storage
 * File-dependent shortcuts arrive as dormant; links/contacts are fully active
 */
async function downloadShortcutsInternal(deletedSet?: Map<string, Set<string>>): Promise<{ success: boolean; downloaded: number; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, downloaded: 0, error: 'Not authenticated' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cloudShortcuts, error } = await (supabase.from('cloud_shortcuts') as any)
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    if (!cloudShortcuts || cloudShortcuts.length === 0) {
      return { success: true, downloaded: 0 };
    }

    const stored = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    const existingShortcuts: ShortcutData[] = stored ? JSON.parse(stored) : [];
    const existingIds = new Set(existingShortcuts.map(s => s.id));
    const deletedShortcuts = deletedSet?.get('shortcut') || new Set<string>();

    const newShortcuts: ShortcutData[] = [];

    for (const cloud of cloudShortcuts) {
      const entityId = cloud.entity_id;
      
      if (existingIds.has(entityId) || deletedShortcuts.has(entityId)) continue;

      const type = cloud.type as ShortcutData['type'];
      const isFileDependent = isFileDependentType(type);

      // Reconstruct icon
      const icon: ShortcutIcon = {
        type: (cloud.icon_type || 'emoji') as IconType,
        value: cloud.icon_value || '📁',
      };

      const shortcut: ShortcutData = {
        id: entityId,
        name: cloud.name,
        type,
        contentUri: isFileDependent ? '' : (cloud.content_uri || ''),
        fileType: cloud.file_type || undefined,
        icon,
        createdAt: cloud.original_created_at,
        usageCount: cloud.usage_count || 0,
        mimeType: cloud.mime_type || undefined,
        phoneNumber: cloud.phone_number || undefined,
        contactName: cloud.contact_name || undefined,
        messageApp: cloud.message_app || undefined,
        quickMessages: cloud.quick_messages || undefined,
        resumeEnabled: cloud.resume_enabled ?? undefined,
        autoAdvanceInterval: cloud.auto_advance_interval ?? undefined,
        // Dormant state for file-dependent shortcuts
        syncState: isFileDependent ? 'dormant' : undefined,
      };

      newShortcuts.push(shortcut);
      existingIds.add(entityId);
    }

    if (newShortcuts.length > 0) {
      const mergedShortcuts = [...existingShortcuts, ...newShortcuts];
      localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(mergedShortcuts));
      window.dispatchEvent(new CustomEvent('shortcuts-changed', { detail: mergedShortcuts }));
      console.log(`[CloudSync] Downloaded ${newShortcuts.length} shortcuts (${newShortcuts.filter(s => s.syncState === 'dormant').length} dormant)`);
    }

    return { success: true, downloaded: newShortcuts.length };
  } catch (error) {
    console.error('[CloudSync] Shortcuts download failed:', error);
    return { success: false, downloaded: 0, error: error instanceof Error ? error.message : 'Shortcuts download failed' };
  }
}

// ============================================================================
// SCHEDULED ACTIONS SYNC
// ============================================================================

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
 * NEW: Re-registers native alarms for non-file destinations
 */
async function downloadScheduledActionsInternal(deletedSet?: Map<string, Set<string>>): Promise<{ success: boolean; downloaded: number; error?: string }> {
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
    const deletedActions = deletedSet?.get('scheduled_action') || new Set<string>();

    const newActions: ScheduledAction[] = [];
    const now = Date.now();

    for (const cloudAction of cloudActions) {
      const entityId = cloudAction.entity_id;
      
      if (existingIds.has(entityId) || deletedActions.has(entityId)) continue;

      // Validate destination structure
      if (!cloudAction.destination || typeof cloudAction.destination !== 'object') {
        console.warn('[CloudSync] Skipping action with invalid destination:', entityId);
        continue;
      }

      let triggerTime = cloudAction.trigger_time;
      const recurrence = cloudAction.recurrence as RecurrenceType;
      const recurrenceAnchor = cloudAction.recurrence_anchor as unknown as RecurrenceAnchor | null;
      const destination = cloudAction.destination as unknown as ScheduledActionDestination;

      // For recurring actions with past-due trigger times, recalculate
      if (triggerTime < now && recurrence !== 'once' && recurrenceAnchor) {
        triggerTime = computeNextTrigger(recurrence, recurrenceAnchor, now);
        console.log(`[CloudSync] Recalculated trigger time for recurring action: ${entityId}`);
      }

      // For one-time past-due actions, download as disabled
      let enabled = recurrence === 'once' && triggerTime < now 
        ? false 
        : cloudAction.enabled;

      // File destinations cannot be restored — disable them
      if (destination.type === 'file') {
        enabled = false;
      }

      newActions.push({
        id: entityId,
        name: cloudAction.name,
        description: cloudAction.description || undefined,
        destination,
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

    if (newActions.length > 0) {
      const mergedActions = [...existingActions, ...newActions];
      localStorage.setItem(SCHEDULED_ACTIONS_STORAGE_KEY, JSON.stringify(mergedActions));
      // Notify listeners about the change
      window.dispatchEvent(new CustomEvent('scheduled-actions-changed'));
      console.log(`[CloudSync] Downloaded ${newActions.length} new scheduled actions`);

      // Re-register native alarms for non-file destinations
      await registerAlarmsForDownloadedActions(newActions);
    }

    return { success: true, downloaded: newActions.length };
  } catch (error) {
    console.error('[CloudSync] Scheduled actions download failed:', error);
    return { success: false, downloaded: 0, error: error instanceof Error ? error.message : 'Scheduled actions download failed' };
  }
}

/**
 * Register native alarms for downloaded scheduled actions
 * Only for enabled, non-file-destination actions
 */
async function registerAlarmsForDownloadedActions(actions: ScheduledAction[]): Promise<void> {
  // Dynamic import to avoid issues on web
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    
    const ShortcutPlugin = (await import('@/plugins/ShortcutPlugin')).default;

    for (const action of actions) {
      if (!action.enabled) continue;
      if (action.destination.type === 'file') continue;

      try {
        await ShortcutPlugin.scheduleAction({
          id: action.id,
          name: action.name,
          description: action.description || '',
          destinationType: action.destination.type as 'file' | 'url' | 'contact',
          destinationData: JSON.stringify(action.destination),
          triggerTime: action.triggerTime,
          recurrence: action.recurrence,
        });
        console.log(`[CloudSync] Registered alarm for downloaded action: ${action.name}`);
      } catch (e) {
        console.warn('[CloudSync] Failed to register alarm for downloaded action:', action.id, e);
      }
    }
  } catch (e) {
    console.warn('[CloudSync] Native alarm registration unavailable:', e);
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
