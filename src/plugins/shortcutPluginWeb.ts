import type { ShortcutPluginInterface } from './ShortcutPlugin';

// Web fallback implementation for the ShortcutPlugin
// This is used in browser environments for testing
export class ShortcutPluginWeb implements ShortcutPluginInterface {
  async createPinnedShortcut(options: {
    id: string;
    label: string;
    iconUri?: string;
    iconEmoji?: string;
    iconText?: string;
    intentAction: string;
    intentData: string;
    intentType?: string;
    fileData?: string;
    fileName?: string;
    fileMimeType?: string;
    fileSize?: number;
    useVideoProxy?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPlugin Web] Creating shortcut:', options);

    // In a browser, we can't create home screen shortcuts directly
    // But we can show a message or use Web App Manifest shortcuts
    alert(`Shortcut "${options.label}" would be added to home screen on Android device`);

    return { success: true };
  }

  async checkShortcutSupport(): Promise<{ supported: boolean; canPin: boolean }> {
    // Web doesn't support pinned shortcuts
    return { supported: false, canPin: false };
  }

  async getSharedContent(): Promise<{
    action?: string;
    type?: string;
    data?: string;
    text?: string;
  } | null> {
    // Check for Web Share Target API (if PWA)
    const url = new URL(window.location.href);
    const sharedUrl = url.searchParams.get('url') || url.searchParams.get('text');

    if (sharedUrl) {
      return {
        action: 'android.intent.action.SEND',
        type: 'text/plain',
        text: sharedUrl,
      };
    }

    return null;
  }

  async pickFile(): Promise<{
    success: boolean;
    uri?: string;
    name?: string;
    mimeType?: string;
    size?: number;
    error?: string;
  }> {
    console.log('[ShortcutPluginWeb] pickFile called (web fallback)');
    return { success: false, error: 'Not supported on web' };
  }

  async openNativeVideoPlayer(): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] openNativeVideoPlayer called (web fallback)');
    return { success: false, error: 'Not supported on web' };
  }

  async openWithExternalApp(options: { uri: string; mimeType?: string }): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] openWithExternalApp called (web fallback)', options.uri);
    // On web, just open in new tab
    window.open(options.uri, '_blank');
    return { success: true };
  }

  async clearSharedIntent(): Promise<void> {
    // Clear URL params on web
    const url = new URL(window.location.href);
    url.searchParams.delete('url');
    url.searchParams.delete('text');
    window.history.replaceState({}, '', url.pathname);
    console.log('[ShortcutPluginWeb] clearSharedIntent called (web fallback)');
  }

  async saveFileFromBase64(options: {
    base64Data: string;
    fileName: string;
    mimeType: string;
  }): Promise<{ success: boolean; filePath?: string; error?: string }> {
    console.log('[ShortcutPluginWeb] saveFileFromBase64 called (web fallback)', options.fileName);
    return { success: false, error: 'Not supported on web' };
  }

  async resolveContentUri(options: {
    contentUri: string;
  }): Promise<{ success: boolean; filePath?: string; error?: string }> {
    console.log('[ShortcutPluginWeb] resolveContentUri called (web fallback)', options.contentUri);
    return { success: false, error: 'Not supported on web' };
  }

  async requestStoragePermission(): Promise<{ granted: boolean }> {
    console.log('[ShortcutPluginWeb] requestStoragePermission called (web fallback)');
    return { granted: false };
  }

  async listDirectory(options: {
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
  }> {
    console.log('[ShortcutPluginWeb] listDirectory called (web fallback)', options.path);
    return { success: false, error: 'Not supported on web' };
  }

  async getFileInfo(options: {
    path: string;
  }): Promise<{
    success: boolean;
    name?: string;
    path?: string;
    size?: number;
    mimeType?: string;
    isDirectory?: boolean;
    error?: string;
  }> {
    console.log('[ShortcutPluginWeb] getFileInfo called (web fallback)', options.path);
    return { success: false, error: 'Not supported on web' };
  }

  async pickContact(): Promise<{
    success: boolean;
    name?: string;
    phoneNumber?: string;
    photoUri?: string;
    error?: string;
  }> {
    console.log('[ShortcutPluginWeb] pickContact called (web fallback)');
    return { success: false, error: 'Not supported on web' };
  }

  async openDesktopWebView(options: {
    url: string;
    viewMode?: 'desktop' | 'mobile';
    title?: string;
  }): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] openDesktopWebView called (web fallback)', options.url);
    // On web, just open in new tab
    window.open(options.url, '_blank', 'noopener,noreferrer');
    return { success: true };
  }
}
