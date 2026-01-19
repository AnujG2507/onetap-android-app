import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

// Desktop User Agent for requesting desktop sites
const DESKTOP_USER_AGENT = 
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let browserCloseCallback: (() => void) | null = null;

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Opens URL in native in-app browser with desktop User-Agent.
 * On Android, this uses Chrome Custom Tabs which respects the system-level
 * "Request desktop site" setting. For true desktop viewing, users should
 * enable this in Chrome settings.
 */
export async function openInAppBrowserDesktop(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ 
      url,
      presentationStyle: 'fullscreen',
      toolbarColor: '#ffffff',
    });
  } else {
    // Web fallback - open in new tab
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export async function closeInAppBrowser(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Browser.close();
    } catch (error) {
      // Browser may already be closed
      console.log('Browser close error (may already be closed):', error);
    }
  }
}

export function addBrowserCloseListener(callback: () => void): void {
  browserCloseCallback = callback;
  if (Capacitor.isNativePlatform()) {
    Browser.addListener('browserFinished', () => {
      browserCloseCallback?.();
    });
  }
}

export function removeBrowserListeners(): void {
  browserCloseCallback = null;
  if (Capacitor.isNativePlatform()) {
    Browser.removeAllListeners();
  }
}
