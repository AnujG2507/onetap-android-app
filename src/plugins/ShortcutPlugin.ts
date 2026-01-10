import { registerPlugin } from '@capacitor/core';

export interface ShortcutPluginInterface {
  createPinnedShortcut(options: {
    id: string;
    label: string;
    iconUri?: string;
    iconEmoji?: string;
    iconText?: string;
    intentAction: string;
    intentData: string;
    intentType?: string;
    // New: base64 file data for web file picker
    fileData?: string;
    fileName?: string;
    fileMimeType?: string;
    fileSize?: number;
  }): Promise<{ success: boolean; error?: string }>;
  
  checkShortcutSupport(): Promise<{ supported: boolean; canPin: boolean }>;
  
  getSharedContent(): Promise<{ 
    action?: string;
    type?: string;
    data?: string;
    text?: string;
  } | null>;
  
  // New: Save file from base64 and return persistent path
  saveFileFromBase64(options: {
    base64Data: string;
    fileName: string;
    mimeType: string;
  }): Promise<{ success: boolean; filePath?: string; error?: string }>;
  
  // New: Resolve content:// URI to file:// path
  resolveContentUri(options: {
    contentUri: string;
  }): Promise<{ success: boolean; filePath?: string; error?: string }>;
  
  // New: Request storage permissions
  requestStoragePermission(): Promise<{ granted: boolean }>;
  
  // New: List files in a directory
  listDirectory(options: {
    path: string;
  }): Promise<{ 
    success: boolean; 
    files?: Array<{
      name: string;
      path: string;
      isDirectory: boolean;
      size: number;
      mimeType?: string;
    }>;
    error?: string;
  }>;
  
  // New: Get file info
  getFileInfo(options: {
    path: string;
  }): Promise<{
    success: boolean;
    name?: string;
    path?: string;
    size?: number;
    mimeType?: string;
    isDirectory?: boolean;
    error?: string;
  }>;
}

// This plugin bridges to native Android code
// The actual implementation requires native Android/Kotlin code
const ShortcutPlugin = registerPlugin<ShortcutPluginInterface>('ShortcutPlugin', {
  web: () => import('./shortcutPluginWeb').then(m => new m.ShortcutPluginWeb()),
});

export default ShortcutPlugin;
