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
  
  // For files, use VIEW action with appropriate MIME type
  const mimeType = getMimeType(shortcut.fileType);
  return {
    action: 'android.intent.action.VIEW',
    data: shortcut.contentUri,
    type: mimeType,
  };
}

function getMimeType(fileType?: string): string {
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
