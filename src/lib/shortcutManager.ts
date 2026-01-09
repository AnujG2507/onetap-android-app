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
  const intent = buildContentIntent(shortcut);
  
  try {
    // Prepare icon data based on type
    const iconOptions: {
      iconUri?: string;
      iconEmoji?: string;
      iconText?: string;
    } = {};
    
    if (shortcut.icon.type === 'thumbnail') {
      iconOptions.iconUri = shortcut.icon.value;
    } else if (shortcut.icon.type === 'emoji') {
      iconOptions.iconEmoji = shortcut.icon.value;
    } else if (shortcut.icon.type === 'text') {
      iconOptions.iconText = shortcut.icon.value;
    }
    
    const result = await ShortcutPlugin.createPinnedShortcut({
      id: shortcut.id,
      label: shortcut.name,
      ...iconOptions,
      intentAction: intent.action,
      intentData: intent.data,
      intentType: intent.type,
    });
    
    return result.success;
  } catch (error) {
    console.error('Failed to create shortcut:', error);
    return false;
  }
}

// Check if device supports pinned shortcuts
export async function checkShortcutSupport(): Promise<{ supported: boolean; canPin: boolean }> {
  try {
    return await ShortcutPlugin.checkShortcutSupport();
  } catch {
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
