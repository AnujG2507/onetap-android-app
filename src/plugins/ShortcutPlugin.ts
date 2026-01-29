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
    // Extra data for special intents (e.g., WhatsApp quick messages)
    extras?: Record<string, string | undefined>;
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

  // Open file in external app using ACTION_VIEW intent (shows app picker)
  openWithExternalApp(options: { uri: string; mimeType?: string }): Promise<{ success: boolean; error?: string }>;

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

  // Native contact picker - opens Android contact picker and returns phone number
  pickContact(): Promise<{
    success: boolean;
    name?: string;
    phoneNumber?: string;
    photoUri?: string;
    photoBase64?: string; // base64-encoded contact photo for icon (data:image/jpeg;base64,...)
    error?: string;
  }>;

  // Open URL in custom WebView with User-Agent control (true desktop/mobile view)
  openDesktopWebView(options: {
    url: string;
    viewMode?: 'desktop' | 'mobile';
    title?: string;
  }): Promise<{ success: boolean; error?: string }>;

  // ========== Scheduled Actions ==========

  // Schedule a new action (creates alarm via AlarmManager)
  scheduleAction(options: {
    id: string;
    name: string;
    description?: string;       // Optional description/intent for notification
    destinationType: 'file' | 'url' | 'contact';
    destinationData: string;    // JSON stringified destination object
    triggerTime: number;        // Unix timestamp (ms)
    recurrence: 'once' | 'daily' | 'weekly' | 'yearly';
  }): Promise<{ success: boolean; error?: string }>;

  // Cancel a scheduled action
  cancelScheduledAction(options: { 
    id: string; 
  }): Promise<{ success: boolean; error?: string }>;

  // Check if exact alarm permission is granted (Android 12+)
  checkAlarmPermission(): Promise<{ 
    granted: boolean; 
    canRequest: boolean; 
  }>;

  // Request notification permission (Android 13+)
  requestNotificationPermission(): Promise<{ 
    granted: boolean; 
  }>;

  // Check notification permission status
  checkNotificationPermission(): Promise<{ 
    granted: boolean; 
  }>;

  // Check if CALL_PHONE permission is granted (for contact shortcuts)
  checkCallPermission(): Promise<{ 
    granted: boolean; 
  }>;

  // Request CALL_PHONE permission for direct call placement
  requestCallPermission(): Promise<{ 
    granted: boolean; 
    requested?: boolean; 
  }>;

  // Open system settings for exact alarm permission (Android 12+)
  openAlarmSettings(): Promise<{ success: boolean }>;

  // Show a test notification immediately (bypasses alarm system)
  showTestNotification(): Promise<{ success: boolean; error?: string }>;

  // ========== Widget Support ==========

  // Sync shortcut data to Android widgets (stores in SharedPreferences)
  syncWidgetData(options: { shortcuts: string }): Promise<{ success: boolean; error?: string }>;

  // Refresh all home screen widgets
  refreshWidgets(): Promise<{ success: boolean; error?: string }>;

  // Check if app was launched from Quick Create widget
  checkQuickCreateIntent(): Promise<{ quickCreate: boolean }>;

  // ========== Settings Sync ==========

  // Sync app settings to native SharedPreferences for native components (video player, etc.)
  syncSettings(options: { settings: string }): Promise<{ success: boolean; error?: string }>;

  // ========== Notification Click Tracking ==========

  // Get clicked notification IDs from native SharedPreferences and clear the list.
  // Called on app startup to sync click data back to JS layer.
  getClickedNotificationIds(): Promise<{ 
    success: boolean; 
    ids: string[]; 
    error?: string 
  }>;

  // ========== WhatsApp Pending Action ==========

  // Get pending WhatsApp action (from multi-message shortcut that opened the app).
  getPendingWhatsAppAction(): Promise<{
    success: boolean;
    hasPending: boolean;
    phoneNumber?: string;
    messagesJson?: string;
    contactName?: string;
    error?: string;
  }>;

  // Clear pending WhatsApp action after handling.
  clearPendingWhatsAppAction(): Promise<{
    success: boolean;
    error?: string;
  }>;

  // Open WhatsApp with optional message prefill.
  // Used after message is selected from the JS chooser.
  openWhatsApp(options: {
    phoneNumber: string;
    message?: string;
  }): Promise<{
    success: boolean;
    error?: string;
  }>;

  // ========== Shortcut Edit ==========

  // Get pending edit shortcut ID (from home screen long-press edit action)
  getPendingEditShortcut(): Promise<{
    success: boolean;
    shortcutId?: string;
    error?: string;
  }>;

  // Clear pending edit shortcut ID after handling
  clearPendingEditShortcut(): Promise<{
    success: boolean;
    error?: string;
  }>;

  // ========== Home Screen Sync ==========

  // Get IDs of shortcuts currently pinned on the home screen
  // Used to sync app storage with actual home screen state
  getPinnedShortcutIds(): Promise<{ ids: string[] }>;

  // Disable and remove a pinned shortcut from the home screen
  // Called when deleting a shortcut from the app
  disablePinnedShortcut(options: { id: string }): Promise<{ success: boolean; error?: string }>;

  // Update an existing pinned shortcut in-place on the home screen
  // Changes label, icon, and/or intent data without affecting position
  updatePinnedShortcut(options: {
    id: string;
    label: string;
    iconEmoji?: string;
    iconText?: string;
    iconData?: string;
    // Intent-affecting properties (for WhatsApp, Contact, PDF shortcuts)
    shortcutType?: 'file' | 'link' | 'contact' | 'message';
    phoneNumber?: string;
    quickMessages?: string[];  // WhatsApp quick messages
    messageApp?: string;       // 'whatsapp' | 'telegram' etc.
    resumeEnabled?: boolean;   // PDF resume
    contentUri?: string;       // For file/link shortcuts
    mimeType?: string;
    contactName?: string;      // Contact display name for WhatsApp
  }): Promise<{ success: boolean; error?: string }>;

  // ========== Native Usage Tracking ==========

  // Get native usage events recorded by proxy activities (home screen taps).
  // Called on app startup to sync tap counts from native to JS layer.
  // Events are cleared after retrieval.
  getNativeUsageEvents(): Promise<{
    success: boolean;
    events: Array<{
      shortcutId: string;
      timestamp: number;
    }>;
    error?: string;
  }>;
}

// This plugin bridges to native Android code
// The actual implementation requires native Android/Kotlin code
const ShortcutPlugin = registerPlugin<ShortcutPluginInterface>('ShortcutPlugin', {
  web: () => import('./shortcutPluginWeb').then(m => new m.ShortcutPluginWeb()),
});

export default ShortcutPlugin;
