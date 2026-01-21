import { useEffect, useRef } from 'react';
import { App, URLOpenListenerEvent } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

const OAUTH_CALLBACK_SCHEME = 'onetap://auth-callback';

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
  const handledUrls = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const handleAppUrlOpen = async (event: URLOpenListenerEvent) => {
      const url = event.url;
      console.log('[DeepLink] Received URL:', url);

      // Store for debugging
      lastDeepLinkUrl = url;
      lastDeepLinkTime = new Date();

      // Check if this is an OAuth callback
      if (!url.startsWith(OAUTH_CALLBACK_SCHEME)) {
        console.log('[DeepLink] Not an auth callback, ignoring');
        return;
      }

      // Prevent duplicate handling
      if (handledUrls.current.has(url)) {
        console.log('[DeepLink] URL already handled, skipping');
        return;
      }
      handledUrls.current.add(url);

      try {
        // Close the browser if it's still open
        try {
          await Browser.close();
        } catch (e) {
          // Browser might not be open, that's fine
        }

        console.log('[DeepLink] Exchanging code for session...');
        
        // The URL contains the auth code as a query parameter or fragment
        // Supabase SDK can parse this directly
        const { data, error } = await supabase.auth.exchangeCodeForSession(url);

        if (error) {
          console.error('[DeepLink] Code exchange failed:', error);
          // Clear the handled URL so user can retry
          handledUrls.current.delete(url);
          return;
        }

        console.log('[DeepLink] Session established successfully:', data.session?.user?.email);
      } catch (err) {
        console.error('[DeepLink] Error handling OAuth callback:', err);
        handledUrls.current.delete(url);
      }
    };

    // Listen for app URL opens (deep links)
    const listener = App.addListener('appUrlOpen', handleAppUrlOpen);

    return () => {
      listener.then((l) => l.remove());
    };
  }, []);
}
