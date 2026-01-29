import { supabase } from '@/integrations/supabase/client';
import { getSavedLinks, SavedLink, getTrashLinks, TrashedLink, normalizeUrl } from './savedLinksManager';

export interface CloudBookmark {
  id: string;
  user_id: string;
  entity_id: string; // Canonical ID from local storage
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
  entity_id: string; // Canonical ID from local storage
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

/**
 * Upload local bookmarks to cloud
 * Uses local ID as entity_id - local is source of truth for identity
 */
export async function uploadBookmarksToCloud(): Promise<{ success: boolean; uploaded: number; error?: string }> {
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
          entity_id: bookmark.id, // Local ID is canonical
          user_id: user.id,
          url: bookmark.url,
          title: bookmark.title || null,
          description: bookmark.description || null,
          folder: bookmark.tag || 'Uncategorized',
          favicon: null,
          created_at: new Date(bookmark.createdAt).toISOString(),
        }, {
          onConflict: 'user_id,entity_id', // Upsert by entity_id, not URL
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
 * Uses local ID as entity_id - local is source of truth for identity
 */
export async function uploadTrashToCloud(): Promise<{ success: boolean; uploaded: number; error?: string }> {
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
          entity_id: item.id, // Local ID is canonical
          user_id: user.id,
          url: item.url,
          title: item.title || null,
          description: item.description || null,
          folder: item.tag || 'Uncategorized',
          deleted_at: new Date(item.deletedAt).toISOString(),
          retention_days: item.retentionDays,
          original_created_at: new Date(item.createdAt).toISOString(),
        }, {
          onConflict: 'user_id,entity_id', // Upsert by entity_id, not URL
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
 * Uses entity_id as local ID - never rewrites local IDs
 */
export async function downloadBookmarksFromCloud(): Promise<{ success: boolean; downloaded: number; error?: string }> {
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

    // Get existing local bookmarks
    const STORAGE_KEY = 'saved_links';
    const existingLinks = getSavedLinks();
    
    // Build set of existing entity_ids (local IDs)
    const existingIds = new Set(existingLinks.map(l => l.id));

    // Convert cloud bookmarks to local format
    // Only add items whose entity_id doesn't exist locally
    const newBookmarks: SavedLink[] = [];
    for (const cloudBookmark of cloudBookmarks) {
      // Use entity_id as local ID - this is the canonical ID
      const entityId = cloudBookmark.entity_id;
      
      if (!existingIds.has(entityId)) {
        newBookmarks.push({
          id: entityId, // Use entity_id, NOT cloud primary key
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
 * Uses entity_id as local ID - marks non-restorable items
 */
export async function downloadTrashFromCloud(): Promise<{ success: boolean; downloaded: number; error?: string }> {
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

    // Get existing local trash
    const TRASH_STORAGE_KEY = 'saved_links_trash';
    const existingTrash = getTrashLinks();
    
    // Build set of existing entity_ids (local IDs)
    const existingIds = new Set(existingTrash.map(l => l.id));

    // Convert cloud trash to local format
    // Only add items whose entity_id doesn't exist locally
    const newTrashItems: TrashedLink[] = [];
    for (const cloudItem of cloudTrash) {
      // Use entity_id as local ID - this is the canonical ID
      const entityId = cloudItem.entity_id;
      
      if (!existingIds.has(entityId)) {
        newTrashItems.push({
          id: entityId, // Use entity_id, NOT cloud primary key
          url: cloudItem.url,
          title: cloudItem.title || '',
          description: cloudItem.description || '',
          tag: cloudItem.folder === 'Uncategorized' ? null : cloudItem.folder,
          createdAt: new Date(cloudItem.original_created_at).getTime(),
          isShortlisted: false,
          deletedAt: new Date(cloudItem.deleted_at).getTime(),
          retentionDays: cloudItem.retention_days,
          // Note: restorable flag will be computed when restoring
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

/**
 * Full sync: upload local then download cloud (bookmarks + trash)
 */
export async function syncBookmarks(): Promise<{ success: boolean; uploaded: number; downloaded: number; error?: string }> {
  // Upload bookmarks first - local is source of truth
  const uploadResult = await uploadBookmarksToCloud();
  if (!uploadResult.success) {
    return { success: false, uploaded: 0, downloaded: 0, error: uploadResult.error };
  }

  // Upload trash
  const trashUploadResult = await uploadTrashToCloud();
  if (!trashUploadResult.success) {
    console.error('[CloudSync] Trash upload failed but continuing:', trashUploadResult.error);
  }

  // Download bookmarks (only adds items not in local)
  const downloadResult = await downloadBookmarksFromCloud();
  if (!downloadResult.success) {
    return { success: false, uploaded: uploadResult.uploaded, downloaded: 0, error: downloadResult.error };
  }

  // Download trash (only adds items not in local)
  const trashDownloadResult = await downloadTrashFromCloud();
  if (!trashDownloadResult.success) {
    console.error('[CloudSync] Trash download failed but continuing:', trashDownloadResult.error);
  }

  return {
    success: true,
    uploaded: uploadResult.uploaded,
    downloaded: downloadResult.downloaded,
  };
}

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
