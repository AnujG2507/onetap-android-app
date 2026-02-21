import type { ShortcutPluginInterface } from './ShortcutPlugin';
import { markNotificationClicked, markNotificationShown } from '@/lib/scheduledActionsManager';

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
    usePDFProxy?: boolean;
    resumeEnabled?: boolean;
    extras?: Record<string, string | undefined>;
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

  async pickMultipleFiles(): Promise<{
    success: boolean;
    files?: Array<{
      uri: string;
      name?: string;
      mimeType?: string;
      size?: number;
      thumbnail?: string;
    }>;
    error?: string;
  }> {
    console.log('[ShortcutPluginWeb] pickMultipleFiles called (web fallback)');
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
    photoBase64?: string;
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
      // Mark the notification as shown for tracking
      markNotificationShown(actionId);
      
      const notification = new Notification(actionName, {
        body: this.getNotificationBody(destinationType),
        icon: '/favicon.ico',
        tag: actionId,
        requireInteraction: true,
      });
      
      notification.onclick = () => {
        console.log('[ShortcutPluginWeb] Notification clicked, executing action');
        notification.close();
        // Mark as clicked before executing
        markNotificationClicked(actionId);
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

  async checkCallPermission(): Promise<{ granted: boolean; permanentlyDenied?: boolean }> {
    console.log('[ShortcutPluginWeb] checkCallPermission called (web fallback)');
    return { granted: true, permanentlyDenied: false };
  }

  async requestCallPermission(): Promise<{ granted: boolean; requested?: boolean; permanentlyDenied?: boolean }> {
    console.log('[ShortcutPluginWeb] requestCallPermission called (web fallback)');
    return { granted: true, permanentlyDenied: false };
  }

  async openAppSettings(): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] openAppSettings called (web fallback)');
    return { success: true };
  }

  async openAlarmSettings(): Promise<{ success: boolean }> {
    console.log('[ShortcutPluginWeb] openAlarmSettings - not applicable on web');
    return { success: true };
  }

  async showTestNotification(): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] showTestNotification called (web fallback)');
    await this.showWebNotification(
      'test_' + Date.now(),
      'Test Notification',
      'url',
      JSON.stringify({ uri: 'https://google.com' })
    );
    return { success: true };
  }

  // ========== Widget Support (Web Fallback) ==========

  async syncWidgetData(options: { shortcuts: string }): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] syncWidgetData called (web fallback)', 
      'shortcuts count:', JSON.parse(options.shortcuts || '[]').length);
    // No-op on web - widgets are Android-only
    return { success: true };
  }

  async refreshWidgets(): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] refreshWidgets called (web fallback)');
    // No-op on web - widgets are Android-only
    return { success: true };
  }

  async checkQuickCreateIntent(): Promise<{ quickCreate: boolean }> {
    console.log('[ShortcutPluginWeb] checkQuickCreateIntent called (web fallback)');
    // On web, check for URL parameter
    const url = new URL(window.location.href);
    const quickCreate = url.searchParams.get('quickCreate') === 'true';
    return { quickCreate };
  }

  // ========== Settings Sync (Web Fallback) ==========

  async syncSettings(options: { settings: string }): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] syncSettings called (web fallback)');
    // No-op on web - settings sync is for native components
    return { success: true };
  }

  async syncTheme(options: { theme: 'light' | 'dark' | 'system'; resolvedTheme: 'light' | 'dark' }): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] syncTheme called (web fallback)');
    // No-op on web - theme sync is for native dialogs
    return { success: true };
  }

  // ========== Notification Click Tracking (Web Fallback) ==========

  async getClickedNotificationIds(): Promise<{ success: boolean; ids: string[]; error?: string }> {
    console.log('[ShortcutPluginWeb] getClickedNotificationIds called (web fallback)');
    // On web, click tracking is handled directly in the web plugin via markNotificationClicked
    // Return empty array since web doesn't need this bridge
    return { success: true, ids: [] };
  }

  // ========== WhatsApp Pending Action (Web Fallback) ==========

  async getPendingWhatsAppAction(): Promise<{
    success: boolean;
    hasPending: boolean;
    phoneNumber?: string;
    messagesJson?: string;
    contactName?: string;
    error?: string;
  }> {
    console.log('[ShortcutPluginWeb] getPendingWhatsAppAction called (web fallback)');
    // On web, there's no proxy activity flow
    return { success: true, hasPending: false };
  }

  async clearPendingWhatsAppAction(): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] clearPendingWhatsAppAction called (web fallback)');
    return { success: true };
  }

  async clearChecklistState(options: { id: string }): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] clearChecklistState called (web fallback)', options.id);
    // On web, checklist state is stored in localStorage — clear keys with this shortcut's prefix
    const prefix = `chk_${options.id}_`;
    Object.keys(localStorage)
      .filter(k => k.startsWith(prefix))
      .forEach(k => localStorage.removeItem(k));
    return { success: true };
  }

  async openTextShortcut(_options: {
    shortcutId: string;
    textContent: string;
    isChecklist: boolean;
    name: string;
  }): Promise<{ success: boolean; error?: string }> {
    // Web: caller falls back to React Router navigate()
    return { success: false, error: 'Not supported on web' };
  }

  async openWhatsApp(options: {
    phoneNumber: string;
    message?: string;
  }): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] openWhatsApp called (web fallback)', options.phoneNumber);
    
    const cleanNumber = options.phoneNumber.replace(/[^0-9]/g, '');
    let url = `https://wa.me/${cleanNumber}`;
    
    if (options.message) {
      url += `?text=${encodeURIComponent(options.message)}`;
    }
    
    window.open(url, '_blank');
    return { success: true };
  }

  // ========== Shortcut Edit (Web Fallback) ==========

  async getPendingEditShortcut(): Promise<{
    success: boolean;
    shortcutId?: string;
    error?: string;
  }> {
    console.log('[ShortcutPluginWeb] getPendingEditShortcut called (web fallback)');
    // On web, there's no long-press edit flow from home screen
    return { success: true };
  }

  async clearPendingEditShortcut(): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] clearPendingEditShortcut called (web fallback)');
    return { success: true };
  }

  // ========== Home Screen Sync (Web Fallback) ==========

  async getPinnedShortcutIds(): Promise<{ ids: string[]; registeredIds: string[]; recentlyCreatedIds: string[]; dynamicCount: number; maxDynamic: number; manufacturer: string }> {
    console.log('[ShortcutPluginWeb] getPinnedShortcutIds called (web fallback)');
    // On web, return empty arrays - all shortcuts are "pinned" conceptually
    return { ids: [], registeredIds: [], recentlyCreatedIds: [], dynamicCount: 0, maxDynamic: 0, manufacturer: 'web' };
  }

  async disablePinnedShortcut(options: { id: string }): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] disablePinnedShortcut called (web fallback)', options.id);
    // No-op on web - shortcuts don't exist on home screen
    return { success: true };
  }

  async updatePinnedShortcut(options: {
    id: string;
    label: string;
    iconEmoji?: string;
    iconText?: string;
    iconData?: string;
    // Intent-affecting properties (WhatsApp only for messaging)
    shortcutType?: 'file' | 'link' | 'contact' | 'message' | 'slideshow';
    phoneNumber?: string;
    quickMessages?: string[];
    messageApp?: string; // 'whatsapp' only
    resumeEnabled?: boolean;
    contentUri?: string;
    mimeType?: string;
    contactName?: string;
  }): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] updatePinnedShortcut called (web fallback)', options.id, options.label);
    // No-op on web - shortcuts don't exist on home screen
    return { success: true };
  }

  // ========== Native Usage Tracking (Web Fallback) ==========

  async getNativeUsageEvents(): Promise<{
    success: boolean;
    events: Array<{
      shortcutId: string;
      timestamp: number;
    }>;
    error?: string;
  }> {
    console.log('[ShortcutPluginWeb] getNativeUsageEvents called (web fallback)');
    // On web, there are no native proxy activities recording tap events
    return { success: true, events: [] };
  }

  // ========== Slideshow Deep Link (Web Fallback) ==========

  async getPendingSlideshowId(): Promise<{
    success: boolean;
    slideshowId?: string;
    error?: string;
  }> {
    console.log('[ShortcutPluginWeb] getPendingSlideshowId called (web fallback)');
    // On web, check for URL parameter
    const url = new URL(window.location.href);
    const slideshowId = url.searchParams.get('slideshowId') || undefined;
    return { success: true, slideshowId };
  }

  async clearPendingSlideshowId(): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] clearPendingSlideshowId called (web fallback)');
    // Clear URL params on web
    const url = new URL(window.location.href);
    url.searchParams.delete('slideshowId');
    window.history.replaceState({}, '', url.pathname);
    return { success: true };
  }

  // ========== Native Toast (Web Fallback) ==========

  async showNativeToast(options: {
    message: string;
    duration?: 'short' | 'long';
  }): Promise<{ success: boolean }> {
    console.log('[ShortcutPluginWeb] showNativeToast called (web fallback)', options.message);
    // On web, we can't show native toasts - just log it
    // The message won't be shown since this is web-only
    return { success: true };
  }

  // ========== Crash Logs (Web Fallback) ==========

  async getCrashLogs(): Promise<{
    success: boolean;
    errorLog?: string;
    breadcrumbs?: string[];
    sessionId?: string;
    sessionDurationSeconds?: number;
    error?: string;
  }> {
    console.log('[ShortcutPluginWeb] getCrashLogs called (web fallback)');
    // On web, return empty logs - crash logging is native-only
    return { 
      success: true, 
      errorLog: 'Crash logs are only available on Android devices.',
      breadcrumbs: [],
      sessionId: 'web-session',
      sessionDurationSeconds: 0
    };
  }

  async clearCrashLogs(): Promise<{ success: boolean }> {
    console.log('[ShortcutPluginWeb] clearCrashLogs called (web fallback)');
    return { success: true };
  }

  async cleanupRegistry(_options: { confirmedIds: string[] }): Promise<{ success: boolean; pruned?: number; error?: string }> {
    console.log('[ShortcutPluginWeb] cleanupRegistry called (web fallback)');
    return { success: true, pruned: 0 };
  }

  // ========== Battery Optimization (Web Fallback) ==========

  async checkBatteryOptimization(): Promise<{ exempted: boolean }> {
    console.log('[ShortcutPluginWeb] checkBatteryOptimization called (web fallback)');
    return { exempted: false };
  }

  async requestBatteryOptimization(): Promise<{ success: boolean; error?: string }> {
    console.log('[ShortcutPluginWeb] requestBatteryOptimization called (web fallback)');
    return { success: false, error: 'Not supported on web' };
  }

  // ========== Dismissed Notification Tracking (Web Fallback) ==========

  async getDismissedNotificationIds(): Promise<{ success: boolean; ids: string[]; error?: string }> {
    console.log('[ShortcutPluginWeb] getDismissedNotificationIds called (web fallback)');
    return { success: true, ids: [] };
  }
}
