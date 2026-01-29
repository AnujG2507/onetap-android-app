import { useEffect, useRef } from 'react';
import { App, URLOpenListenerEvent } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { 
  completeOAuth, 
  isOAuthCallback,
  attemptOAuthRecovery,
} from '@/lib/oauthCompletion';

// Store the last received deep link for debugging
let lastDeepLinkUrl: string | null = null;
let lastDeepLinkTime: Date | null = null;

export function getLastDeepLink() {
  return {
    url: lastDeepLinkUrl,
    time: lastDeepLinkTime,
  };
}

export function useDeepLink() {
  const isProcessing = useRef(false);
  const hasAttemptedRecovery = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    // Attempt cold-start recovery once on mount
    if (!hasAttemptedRecovery.current) {
      hasAttemptedRecovery.current = true;
      attemptOAuthRecovery().then(result => {
        if (result) {
          console.log('[DeepLink] Cold-start recovery result:', result.success);
        }
      });
    }

    const handleAppUrlOpen = async (event: URLOpenListenerEvent) => {
      const url = event.url;
      console.log('[DeepLink] Received URL:', url);

      // Store for debugging
      lastDeepLinkUrl = url;
      lastDeepLinkTime = new Date();

      // Handle manage-shortcuts deep link
      if (url === 'onetap://manage-shortcuts' || url.startsWith('onetap://manage-shortcuts')) {
        console.log('[DeepLink] Manage shortcuts deep link detected');
        // Dispatch custom event for Index.tsx to handle
        window.dispatchEvent(new CustomEvent('onetap:manage-shortcuts'));
        return;
      }

      // Only handle OAuth callbacks
      if (!isOAuthCallback(url)) {
        console.log('[DeepLink] Not an auth callback, ignoring');
        return;
      }

      // Prevent concurrent processing
      if (isProcessing.current) {
        console.log('[DeepLink] Already processing, skipping');
        return;
      }

      isProcessing.current = true;

      try {
        // Close the browser if it's still open
        try {
          await Browser.close();
        } catch {
          // Browser might not be open, that's fine
        }

        // Use the canonical OAuth completion function
        const result = await completeOAuth(url);

        if (result.alreadyProcessed) {
          console.log('[DeepLink] URL was already processed');
        } else if (result.success) {
          console.log('[DeepLink] OAuth completed successfully');
        } else if (result.error) {
          console.error('[DeepLink] OAuth failed:', result.error);
        }
      } finally {
        isProcessing.current = false;
      }
    };

    // Listen for app URL opens (deep links)
    const listener = App.addListener('appUrlOpen', handleAppUrlOpen);

    return () => {
      listener.then((l) => l.remove());
    };
  }, []);
}
