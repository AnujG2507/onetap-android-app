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
  }): Promise<{ success: boolean }> {
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
}
