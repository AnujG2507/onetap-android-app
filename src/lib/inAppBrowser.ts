import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

/**
 * Opens a URL in the native in-app browser (Chrome Custom Tabs on Android,
 * SFSafariViewController on iOS). Falls back to window.open on web.
 */
export async function openInAppBrowser(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({
      url,
      presentationStyle: 'fullscreen',
    });
  } else {
    // Web fallback - open in new tab
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Closes the in-app browser (native only).
 */
export async function closeInAppBrowser(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Browser.close();
  }
}

/**
 * Adds a listener for when the browser is closed by the user.
 */
export function addBrowserCloseListener(callback: () => void): () => void {
  if (Capacitor.isNativePlatform()) {
    const handle = Browser.addListener('browserFinished', callback);
    return () => {
      handle.then((h) => h.remove());
    };
  }
  return () => {};
}

/**
 * Removes all browser event listeners.
 */
export async function removeBrowserListeners(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Browser.removeAllListeners();
  }
}
