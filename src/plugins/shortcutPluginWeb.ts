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

  // ========== Scheduled Actions (Web Fallback) ==========

  async scheduleAction(options: {
    id: string;
    name: string;
    destinationType: 'file' | 'url' | 'contact';
    destinationData: string;
    triggerTime: number;
    recurrence: 'once' | 'daily' | 'weekly' | 'yearly';
  }): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] scheduleAction called (web fallback)', options);
    
    // On web, use setTimeout + browser Notification API for demo/testing
    const delay = options.triggerTime - Date.now();
    if (delay > 0) {
      console.log(`[ShortcutPluginWeb] Scheduling "${options.name}" to trigger in ${Math.round(delay / 1000)}s`);
      
      // Schedule the notification
      setTimeout(() => {
        console.log(`[ShortcutPluginWeb] Triggering scheduled action: ${options.name}`);
        this.showWebNotification(options.id, options.name, options.destinationType, options.destinationData);
      }, delay);
    } else {
      console.log(`[ShortcutPluginWeb] Trigger time is in the past, showing notification immediately`);
      this.showWebNotification(options.id, options.name, options.destinationType, options.destinationData);
    }
    
    return { success: true };
  }

  private async showWebNotification(
    actionId: string,
    actionName: string,
    destinationType: string,
    destinationData: string
  ): Promise<void> {
    console.log('[ShortcutPluginWeb] showWebNotification called', { actionId, actionName, destinationType });
    
    // Check if browser notifications are supported and granted
    if (!('Notification' in window)) {
      console.log('[ShortcutPluginWeb] Browser notifications not supported');
      alert(`⏰ Scheduled Action: ${actionName}\n\nTap OK to execute.`);
      this.executeWebAction(destinationType, destinationData);
      return;
    }
    
    if (Notification.permission !== 'granted') {
      console.log('[ShortcutPluginWeb] Notification permission not granted, using alert');
      alert(`⏰ Scheduled Action: ${actionName}\n\nTap OK to execute.`);
      this.executeWebAction(destinationType, destinationData);
      return;
    }
    
    // Show browser notification
    try {
      const notification = new Notification(actionName, {
        body: this.getNotificationBody(destinationType),
        icon: '/favicon.ico',
        tag: actionId,
        requireInteraction: true,
      });
      
      notification.onclick = () => {
        console.log('[ShortcutPluginWeb] Notification clicked, executing action');
        notification.close();
        this.executeWebAction(destinationType, destinationData);
      };
      
      console.log('[ShortcutPluginWeb] Browser notification shown');
    } catch (error) {
      console.error('[ShortcutPluginWeb] Error showing notification:', error);
      alert(`⏰ Scheduled Action: ${actionName}`);
    }
  }

  private getNotificationBody(destinationType: string): string {
    switch (destinationType) {
      case 'url': return 'Tap to open link';
      case 'contact': return 'Tap to call';
      case 'file': return 'Tap to open file';
      default: return 'Tap to execute';
    }
  }

  private executeWebAction(destinationType: string, destinationData: string): void {
    try {
      const data = JSON.parse(destinationData);
      
      switch (destinationType) {
        case 'url':
          if (data.uri) {
            window.open(data.uri, '_blank');
          }
          break;
        case 'contact':
          if (data.phoneNumber) {
            window.open(`tel:${data.phoneNumber}`, '_self');
          }
          break;
        case 'file':
          if (data.uri) {
            window.open(data.uri, '_blank');
          }
          break;
      }
    } catch (error) {
      console.error('[ShortcutPluginWeb] Error executing action:', error);
    }
  }

  async cancelScheduledAction(options: { 
    id: string; 
  }): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] cancelScheduledAction called (web fallback)', options.id);
    return { success: true };
  }

  async checkAlarmPermission(): Promise<{ granted: boolean; canRequest: boolean }> {
    console.log('[ShortcutPluginWeb] checkAlarmPermission called (web fallback)');
    // Web doesn't have alarm permissions, return true for testing
    return { granted: true, canRequest: false };
  }

  async requestNotificationPermission(): Promise<{ granted: boolean }> {
    console.log('[ShortcutPluginWeb] requestNotificationPermission called (web fallback)');
    // Use browser Notification API if available
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return { granted: permission === 'granted' };
    }
    return { granted: false };
  }

  async checkNotificationPermission(): Promise<{ granted: boolean }> {
    console.log('[ShortcutPluginWeb] checkNotificationPermission called (web fallback)');
    if ('Notification' in window) {
      return { granted: Notification.permission === 'granted' };
    }
    return { granted: false };
  }
}
