import { supabase } from '@/integrations/supabase/client';
import { getSavedLinks, SavedLink } from './savedLinksManager';

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
 * Full sync: upload local then download cloud
 */
export async function syncBookmarks(): Promise<{ success: boolean; uploaded: number; downloaded: number; error?: string }> {
  const uploadResult = await uploadBookmarksToCloud();
  if (!uploadResult.success) {
    return { success: false, uploaded: 0, downloaded: 0, error: uploadResult.error };
  }

  const downloadResult = await downloadBookmarksFromCloud();
  if (!downloadResult.success) {
    return { success: false, uploaded: uploadResult.uploaded, downloaded: 0, error: downloadResult.error };
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
