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
  // Contact shortcut - routes through ContactProxyActivity for permission checking
  // The proxy will place call directly if CALL_PHONE permission is granted,
  // otherwise falls back to opening the dialer
  if (shortcut.type === 'contact') {
    const phoneNumber = shortcut.phoneNumber?.replace(/[^0-9+]/g, '') || '';
    return {
      action: 'app.onetap.CALL_CONTACT',
      data: `tel:${phoneNumber}`,
      extras: {
        phone_number: phoneNumber,
      },
    };
  }

  // Message shortcuts - deep links to messaging apps
  if (shortcut.type === 'message' && shortcut.messageApp) {
    const phoneNumber = shortcut.phoneNumber?.replace(/[^0-9]/g, '') || '';
    
    switch (shortcut.messageApp) {
      case 'whatsapp':
        // WhatsApp uses wa.me for universal linking
        return {
          action: 'android.intent.action.VIEW',
          data: `https://wa.me/${phoneNumber}`,
        };
      case 'telegram':
        return {
          action: 'android.intent.action.VIEW',
          data: `tg://resolve?phone=${phoneNumber}`,
        };
      case 'signal':
        return {
          action: 'android.intent.action.VIEW',
          data: `sgnl://signal.me/#p/+${phoneNumber}`,
        };
      case 'slack':
        // Slack requires team and user IDs
        if (shortcut.slackTeamId && shortcut.slackUserId) {
          return {
            action: 'android.intent.action.VIEW',
            data: `slack://user?team=${shortcut.slackTeamId}&id=${shortcut.slackUserId}`,
          };
        }
        // Fallback to Slack app
        return {
          action: 'android.intent.action.VIEW',
          data: 'slack://',
        };
    }
  }

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

// Check if MIME type is PDF (more robust detection)
function isPdfMimeType(mimeType?: string, uri?: string, fileName?: string): boolean {
  // Check MIME type variations
  if (mimeType) {
    if (mimeType === 'application/pdf') return true;
    if (mimeType.includes('pdf')) return true;
  }
  
  // Check URI extension
  if (uri) {
    const ext = uri.split('.').pop()?.toLowerCase()?.split('?')[0];
    if (ext === 'pdf') return true;
  }
  
  // Check filename extension
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return true;
  }
  
  return false;
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

  // For contact shortcuts, request CALL_PHONE permission upfront
  // This allows the shortcut to place calls directly with one tap
  if (shortcut.type === 'contact' && Capacitor.isNativePlatform()) {
    console.log('[ShortcutManager] Contact shortcut detected, checking call permission...');
    try {
      const permissionStatus = await ShortcutPlugin.checkCallPermission();
      if (!permissionStatus.granted) {
        console.log('[ShortcutManager] Requesting CALL_PHONE permission...');
        const result = await ShortcutPlugin.requestCallPermission();
        console.log('[ShortcutManager] Call permission request result:', result);
        // Note: We continue regardless of the result - the ContactProxyActivity 
        // will gracefully fall back to the dialer if permission is denied
      } else {
        console.log('[ShortcutManager] CALL_PHONE permission already granted');
      }
    } catch (error) {
      console.warn('[ShortcutManager] Error checking/requesting call permission:', error);
      // Continue anyway - the fallback will handle it
    }
  }

  const intent = buildContentIntent(shortcut);
  console.log('[ShortcutManager] Built intent:', intent);

  // Check file size and block videos over 100MB
  const fileSize = shortcut.fileSize || contentSource?.fileSize || 0;
  const mimeType = shortcut.mimeType || contentSource?.mimeType || intent.type;
  const isVideo = isVideoMimeType(mimeType);

  // Block shortcuts for videos larger than 100MB
  if (isVideo && fileSize > VIDEO_CACHE_THRESHOLD) {
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
    console.error(`[ShortcutManager] Video too large (${sizeMB} MB). Video shortcuts are limited to 100 MB maximum due to Android system constraints.`);
    throw new Error(`Video too large (${sizeMB} MB). Video shortcuts are limited to 100 MB maximum.`);
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
  const useVideoProxy = isVideoMimeType(mimeType);
  
  // Determine if this is a PDF - use PDF proxy for PDFs with resume support (robust detection)
  const usePDFProxy = isPdfMimeType(mimeType, shortcut.contentUri, shortcut.name) || shortcut.fileType === 'pdf';

  if (useVideoProxy) {
    const sizeInfo = fileSize > 0 ? `(${(fileSize / (1024 * 1024)).toFixed(1)} MB)` : '(unknown size)';
    console.log(`[ShortcutManager] Video detected ${sizeInfo}, will use VideoProxyActivity → internal player`);
  }
  
  if (usePDFProxy) {
    console.log(`[ShortcutManager] PDF detected, will use PDFProxyActivity → internal viewer, resumeEnabled: ${shortcut.resumeEnabled}`);
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
      usePDFProxy, // Signal to use PDFProxyActivity for PDFs
      resumeEnabled: shortcut.resumeEnabled, // PDF resume support
    };
    
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
