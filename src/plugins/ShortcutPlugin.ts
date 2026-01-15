import { registerPlugin } from '@capacitor/core';

export interface ShortcutPluginInterface {
  createPinnedShortcut(options: {
    id: string;
    label: string;
    iconUri?: string;
    iconEmoji?: string;
    iconText?: string;
    iconData?: string; // base64 thumbnail data for icon
    intentAction: string;
    intentData: string;
    intentType?: string;
    // base64 file data for web file picker
    fileData?: string;
    fileName?: string;
    fileMimeType?: string;
    fileSize?: number;
    // Flag to use video proxy activity
    useVideoProxy?: boolean;
    // Flag to use PDF proxy activity
    usePDFProxy?: boolean;
    resumeEnabled?: boolean;
  }): Promise<{ success: boolean; error?: string }>;

  checkShortcutSupport(): Promise<{ supported: boolean; canPin: boolean }>;

  getSharedContent(): Promise<{
    action?: string;
    type?: string;
    data?: string;
    text?: string;
    // PDF viewer extras
    shortcutId?: string;
    resume?: boolean | string;
  } | null>;

  // Native file picker (Android): returns a persistent content:// URI.
  // On web this returns success=false.
  pickFile(options?: { mimeTypes?: string[] }): Promise<{
    success: boolean;
    uri?: string;
    name?: string;
    mimeType?: string;
    size?: number;
    error?: string;
  }>;

  // Launch the in-app native video player (Android).
  openNativeVideoPlayer(options: { uri: string; mimeType?: string }): Promise<{ success: boolean; error?: string }>;

  // Clear the shared intent after processing to prevent re-processing
  clearSharedIntent(): Promise<void>;

  // Save file from base64 and return persistent path
  saveFileFromBase64(options: {
    base64Data: string;
    fileName: string;
    mimeType: string;
  }): Promise<{ success: boolean; filePath?: string; error?: string }>;

  // Resolve content:// URI to file:// path
  resolveContentUri(options: {
    contentUri: string;
  }): Promise<{ success: boolean; filePath?: string; error?: string }>;

  // Request storage permissions
  requestStoragePermission(): Promise<{ granted: boolean }>;

  // List files in a directory
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

  // Get file info
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
