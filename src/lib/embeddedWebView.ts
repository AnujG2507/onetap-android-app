import { Capacitor } from '@capacitor/core';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';

export type ViewMode = 'desktop' | 'mobile';

// User Agent strings (for reference)
const DESKTOP_USER_AGENT = 
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MOBILE_USER_AGENT = 
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

let browserCloseCallback: (() => void) | null = null;

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function getUserAgent(viewMode: ViewMode): string {
  return viewMode === 'desktop' ? DESKTOP_USER_AGENT : MOBILE_USER_AGENT;
}

/**
 * Opens URL in custom native WebView with proper User-Agent control.
 * This allows true desktop/mobile site viewing on Android.
 */
export async function openInAppBrowser(url: string, viewMode: ViewMode = 'desktop', title?: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await ShortcutPlugin.openDesktopWebView({
        url,
        viewMode,
        title: title || '',
      });
      
      if (!result.success) {
        console.error('Failed to open desktop WebView:', result.error);
        // Fallback to opening in external browser
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      
      // Trigger callback after opening (user will close manually)
      setTimeout(() => {
        browserCloseCallback?.();
      }, 500);
    } catch (error) {
      console.error('Error opening desktop WebView:', error);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } else {
    // Web fallback - open in new tab
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export async function closeInAppBrowser(): Promise<void> {
  // Custom WebView is closed by user via back button or close button
  // No programmatic close needed
}

export function addBrowserCloseListener(callback: () => void): void {
  browserCloseCallback = callback;
}

export function removeBrowserListeners(): void {
  browserCloseCallback = null;
}
