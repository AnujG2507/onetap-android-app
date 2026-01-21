import { supabase } from '@/integrations/supabase/client';
import { getSavedLinks, SavedLink, getTrashLinks, TrashedLink } from './savedLinksManager';

export interface CloudBookmark {
  id: string;
  user_id: string;
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
 * Only uploads bookmarks, not shortcuts or trash
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
          user_id: user.id,
          url: bookmark.url,
          title: bookmark.title || null,
          description: bookmark.description || null,
          folder: bookmark.tag || 'Uncategorized',
          favicon: null,
          created_at: new Date(bookmark.createdAt).toISOString(),
        }, {
          onConflict: 'user_id,url',
          ignoreDuplicates: false,
        });

      if (!error) {
        uploaded++;
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
          user_id: user.id,
          url: item.url,
          title: item.title || null,
          description: item.description || null,
          folder: item.tag || 'Uncategorized',
          deleted_at: new Date(item.deletedAt).toISOString(),
          retention_days: item.retentionDays,
          original_created_at: new Date(item.createdAt).toISOString(),
        }, {
          onConflict: 'user_id,url',
          ignoreDuplicates: false,
        });

      if (!error) {
        uploaded++;
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
    const existingUrls = new Set(existingLinks.map(l => l.url.toLowerCase()));

    // Convert cloud bookmarks to local format and merge
    const newBookmarks: SavedLink[] = [];
    for (const cloudBookmark of cloudBookmarks) {
      if (!existingUrls.has(cloudBookmark.url.toLowerCase())) {
        newBookmarks.push({
          id: cloudBookmark.id,
          url: cloudBookmark.url,
          title: cloudBookmark.title || '',
          description: cloudBookmark.description || '',
          tag: cloudBookmark.folder === 'Uncategorized' ? null : cloudBookmark.folder,
          createdAt: new Date(cloudBookmark.created_at).getTime(),
          isShortlisted: false,
        });
        existingUrls.add(cloudBookmark.url.toLowerCase());
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
    const existingUrls = new Set(existingTrash.map(l => l.url.toLowerCase()));

    // Convert cloud trash to local format and merge
    const newTrashItems: TrashedLink[] = [];
    for (const cloudItem of cloudTrash) {
      if (!existingUrls.has(cloudItem.url.toLowerCase())) {
        newTrashItems.push({
          id: cloudItem.id,
          url: cloudItem.url,
          title: cloudItem.title || '',
          description: cloudItem.description || '',
          tag: cloudItem.folder === 'Uncategorized' ? null : cloudItem.folder,
          createdAt: new Date(cloudItem.original_created_at).getTime(),
          isShortlisted: false,
          deletedAt: new Date(cloudItem.deleted_at).getTime(),
          retentionDays: cloudItem.retention_days,
        });
        existingUrls.add(cloudItem.url.toLowerCase());
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
  // Upload bookmarks
  const uploadResult = await uploadBookmarksToCloud();
  if (!uploadResult.success) {
    return { success: false, uploaded: 0, downloaded: 0, error: uploadResult.error };
  }

  // Upload trash
  const trashUploadResult = await uploadTrashToCloud();
  if (!trashUploadResult.success) {
    console.error('[CloudSync] Trash upload failed but continuing:', trashUploadResult.error);
  }

  // Download bookmarks
  const downloadResult = await downloadBookmarksFromCloud();
  if (!downloadResult.success) {
    return { success: false, uploaded: uploadResult.uploaded, downloaded: 0, error: downloadResult.error };
  }

  // Download trash
  const trashDownloadResult = await downloadTrashFromCloud();
  if (!trashDownloadResult.success) {
    console.error('[CloudSync] Trash download failed but continuing:', trashDownloadResult.error);
  }

  return {
    success: true,
    uploaded: uploadResult.uploaded + trashUploadResult.uploaded,
    downloaded: downloadResult.downloaded + trashDownloadResult.downloaded,
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
