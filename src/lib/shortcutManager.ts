import { Capacitor } from '@capacitor/core';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import type { ShortcutData } from '@/types/shortcut';
import { FILE_SIZE_THRESHOLD, VIDEO_CACHE_THRESHOLD } from '@/types/shortcut';

export interface ShortcutIntent {
  action: string;
  data: string;
  type?: string;
  extras?: Record<string, string>;
}

// Build intent for opening content
export function buildContentIntent(shortcut: ShortcutData): ShortcutIntent {
  if (shortcut.type === 'link') {
    return {
      action: 'android.intent.action.VIEW',
      data: shortcut.contentUri,
    };
  }
  
  // For files, use VIEW action with specific MIME type
  // The MIME type determines which apps are shown in the chooser
  const mimeType = shortcut.mimeType || getMimeTypeFromUri(shortcut.contentUri, shortcut.fileType);
  console.log('[ShortcutManager] File intent - URI:', shortcut.contentUri, 'MIME:', mimeType);
  
  return {
    action: 'android.intent.action.VIEW',
    data: shortcut.contentUri,
    type: mimeType,
  };
}

// Check if MIME type is video
function isVideoMimeType(mimeType?: string): boolean {
  return !!mimeType && mimeType.startsWith('video/');
}

// Get specific MIME type based on file extension and detected type
function getMimeTypeFromUri(uri: string, fileType?: string): string {
  // Try to extract extension from URI
  const extension = uri.split('.').pop()?.toLowerCase()?.split('?')[0];
  
  // Map common extensions to specific MIME types
  const mimeMap: Record<string, string> = {
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'heic': 'image/heic',
    'heif': 'image/heif',
    // Videos
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska',
    '3gp': 'video/3gpp',
    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt': 'text/plain',
    'rtf': 'application/rtf',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  
  // First try specific extension mapping
  if (extension && mimeMap[extension]) {
    return mimeMap[extension];
  }
  
  // Fall back to generic type based on detected file type
  switch (fileType) {
    case 'image': return 'image/*';
    case 'video': return 'video/*';
    case 'pdf': return 'application/pdf';
    default: return '*/*';
  }
}

// Create a pinned shortcut on the home screen
export async function createHomeScreenShortcut(
  shortcut: ShortcutData,
  contentSource?: { fileData?: string; fileSize?: number; thumbnailData?: string; isLargeFile?: boolean; mimeType?: string }
): Promise<boolean> {
  console.log('[ShortcutManager] createHomeScreenShortcut called with:', {
    id: shortcut.id,
    name: shortcut.name,
    type: shortcut.type,
    contentUri: shortcut.contentUri,
    iconType: shortcut.icon.type,
    fileSize: shortcut.fileSize || contentSource?.fileSize,
    hasFileData: !!contentSource?.fileData,
    hasThumbnailData: !!contentSource?.thumbnailData || !!shortcut.thumbnailData,
    isLargeFile: contentSource?.isLargeFile,
  });

  const intent = buildContentIntent(shortcut);
  console.log('[ShortcutManager] Built intent:', intent);

  // Check file size and block videos over 100MB
  const fileSize = shortcut.fileSize || contentSource?.fileSize || 0;
  const mimeType = shortcut.mimeType || contentSource?.mimeType || intent.type;
  const isVideo = isVideoMimeType(mimeType);

  // Block shortcuts for videos larger than 50MB
  if (isVideo && fileSize > VIDEO_CACHE_THRESHOLD) {
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
    console.error(`[ShortcutManager] Video too large (${sizeMB} MB). Video shortcuts are limited to 50 MB maximum due to Android system constraints.`);
    throw new Error(`Video too large (${sizeMB} MB). Video shortcuts are limited to 50 MB maximum.`);
  }

  // blob: URLs are NOT valid after app restart and cannot be used for pinned shortcuts.
  if (
    Capacitor.isNativePlatform() &&
    shortcut.type === 'file' &&
    typeof intent.data === 'string' &&
    intent.data.startsWith('blob:') &&
    !contentSource?.fileData
  ) {
    const sizeInfo = fileSize > 0 ? `(${(fileSize / (1024 * 1024)).toFixed(1)} MB)` : '';
    console.error(`[ShortcutManager] Cannot create shortcut from blob: URL ${sizeInfo}. Native picker should provide content:// URI.`, {
      data: intent.data,
      fileSize,
      mimeType,
    });
    return false;
  }

  // Determine if this is a video - use proxy activity for videos
  const useVideoProxy = isVideo;

  if (useVideoProxy) {
    const sizeInfo = fileSize > 0 ? `(${(fileSize / (1024 * 1024)).toFixed(1)} MB)` : '(unknown size)';
    console.log(`[ShortcutManager] Video detected ${sizeInfo}, will use VideoProxyActivity → internal player`);
  }
  
  try {
    // Prepare icon data based on type
    const iconOptions: {
      iconUri?: string;
      iconEmoji?: string;
      iconText?: string;
      iconData?: string; // base64 thumbnail data for native icon
    } = {};
    
    if (shortcut.icon.type === 'thumbnail') {
      // Check if the thumbnail is a blob: or data: URL
      const thumbnailValue = shortcut.icon.value;
      
      if (thumbnailValue.startsWith('data:')) {
        // Extract base64 data from data URL
        const base64Part = thumbnailValue.split(',')[1];
        if (base64Part) {
          iconOptions.iconData = base64Part;
          console.log('[ShortcutManager] Using thumbnail from data URL');
        }
      } else if (thumbnailValue.startsWith('blob:')) {
        // For blob URLs, use the thumbnailData if available
        const thumbData = contentSource?.thumbnailData || shortcut.thumbnailData;
        if (thumbData) {
          iconOptions.iconData = thumbData;
          console.log('[ShortcutManager] Using thumbnailData for blob URL');
        } else {
          // Fallback to iconUri (native may not be able to handle blob)
          iconOptions.iconUri = thumbnailValue;
          console.log('[ShortcutManager] Using blob URL (may not work natively)');
        }
      } else {
        iconOptions.iconUri = thumbnailValue;
        console.log('[ShortcutManager] Using thumbnail icon URI');
      }
    } else if (shortcut.icon.type === 'emoji') {
      iconOptions.iconEmoji = shortcut.icon.value;
      console.log('[ShortcutManager] Using emoji icon:', shortcut.icon.value);
    } else if (shortcut.icon.type === 'text') {
      iconOptions.iconText = shortcut.icon.value;
      console.log('[ShortcutManager] Using text icon:', shortcut.icon.value);
    }
    
    // Prepare file data for web file picker flow
    const fileOptions: {
      fileData?: string;
      fileName?: string;
      fileMimeType?: string;
      fileSize?: number;
    } = {};
    
    const fileSize = shortcut.fileSize || contentSource?.fileSize || 0;
    const isLargeFile = contentSource?.isLargeFile;
    
    // Only pass file data for non-large files (to prevent OOM)
    if (contentSource?.fileData && shortcut.type === 'file' && !isLargeFile) {
      console.log('[ShortcutManager] Passing file data to native, size:', fileSize);
      fileOptions.fileData = contentSource.fileData;
      fileOptions.fileName = shortcut.name;
      // Use the mimeType from shortcut first, then content source, then detect from intent
      fileOptions.fileMimeType = shortcut.mimeType || contentSource?.mimeType || intent.type;
      fileOptions.fileSize = fileSize;
      console.log('[ShortcutManager] File MIME type:', fileOptions.fileMimeType);
    } else if (shortcut.type === 'file') {
      // For large files, pass mimeType for proper detection but no file data
      console.log('[ShortcutManager] File shortcut (large/no data), mimeType:', shortcut.mimeType);
      fileOptions.fileMimeType = shortcut.mimeType || contentSource?.mimeType || intent.type;
      fileOptions.fileSize = fileSize;
    }
    
    const params = {
      id: shortcut.id,
      label: shortcut.name,
      ...iconOptions,
      ...fileOptions,
      intentAction: intent.action,
      intentData: intent.data,
      intentType: intent.type,
      useVideoProxy, // Signal to use VideoProxyActivity for videos
    };
    console.log('[ShortcutManager] Calling ShortcutPlugin.createPinnedShortcut with params, useVideoProxy:', useVideoProxy);
    
    const result = await ShortcutPlugin.createPinnedShortcut(params);
    console.log('[ShortcutManager] createPinnedShortcut result:', result);
    
    if (!result.success && result.error) {
      console.error('[ShortcutManager] Shortcut creation failed:', result.error);
    }
    
    return result.success;
  } catch (error) {
    console.error('[ShortcutManager] Failed to create shortcut:', error);
    console.error('[ShortcutManager] Error details:', {
      name: (error as Error)?.name,
      message: (error as Error)?.message,
      stack: (error as Error)?.stack,
    });
    return false;
  }
}

// Check if device supports pinned shortcuts
export async function checkShortcutSupport(): Promise<{ supported: boolean; canPin: boolean }> {
  console.log('[ShortcutManager] Checking shortcut support...');
  try {
    const result = await ShortcutPlugin.checkShortcutSupport();
    console.log('[ShortcutManager] Shortcut support result:', result);
    return result;
  } catch (error) {
    console.error('[ShortcutManager] checkShortcutSupport error:', error);
    return { supported: false, canPin: false };
  }
}

// Open content directly (used when shortcut is tapped)
export function openContent(shortcut: ShortcutData): void {
  if (shortcut.type === 'link') {
    window.open(shortcut.contentUri, '_system');
  } else {
    window.open(shortcut.contentUri, '_system');
  }
}

// Request storage permission for file access
export async function requestStoragePermission(): Promise<boolean> {
  console.log('[ShortcutManager] Requesting storage permission...');
  try {
    const result = await ShortcutPlugin.requestStoragePermission();
    console.log('[ShortcutManager] Storage permission result:', result);
    return result.granted;
  } catch (error) {
    console.error('[ShortcutManager] requestStoragePermission error:', error);
    return false;
  }
}
