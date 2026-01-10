import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import type { ShortcutData } from '@/types/shortcut';

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
  const mimeType = getMimeTypeFromUri(shortcut.contentUri, shortcut.fileType);
  console.log('[ShortcutManager] File intent - URI:', shortcut.contentUri, 'MIME:', mimeType);
  
  return {
    action: 'android.intent.action.VIEW',
    data: shortcut.contentUri,
    type: mimeType,
  };
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
export async function createHomeScreenShortcut(shortcut: ShortcutData): Promise<boolean> {
  console.log('[ShortcutManager] createHomeScreenShortcut called with:', {
    id: shortcut.id,
    name: shortcut.name,
    type: shortcut.type,
    contentUri: shortcut.contentUri,
    iconType: shortcut.icon.type,
    iconValue: shortcut.icon.value?.substring(0, 50) + '...',
  });

  const intent = buildContentIntent(shortcut);
  console.log('[ShortcutManager] Built intent:', intent);
  
  try {
    // Prepare icon data based on type
    const iconOptions: {
      iconUri?: string;
      iconEmoji?: string;
      iconText?: string;
    } = {};
    
    if (shortcut.icon.type === 'thumbnail') {
      iconOptions.iconUri = shortcut.icon.value;
      console.log('[ShortcutManager] Using thumbnail icon');
    } else if (shortcut.icon.type === 'emoji') {
      iconOptions.iconEmoji = shortcut.icon.value;
      console.log('[ShortcutManager] Using emoji icon:', shortcut.icon.value);
    } else if (shortcut.icon.type === 'text') {
      iconOptions.iconText = shortcut.icon.value;
      console.log('[ShortcutManager] Using text icon:', shortcut.icon.value);
    }
    
    const params = {
      id: shortcut.id,
      label: shortcut.name,
      ...iconOptions,
      intentAction: intent.action,
      intentData: intent.data,
      intentType: intent.type,
    };
    console.log('[ShortcutManager] Calling ShortcutPlugin.createPinnedShortcut with:', params);
    
    const result = await ShortcutPlugin.createPinnedShortcut(params);
    console.log('[ShortcutManager] createPinnedShortcut result:', result);
    
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
