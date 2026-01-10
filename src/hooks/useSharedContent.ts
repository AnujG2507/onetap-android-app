import { useEffect, useState, useCallback, useRef } from 'react';
import { App } from '@capacitor/app';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import type { ContentSource } from '@/types/shortcut';

// Hook to handle content shared via Android Share Sheet
// Supports both initial launch and app resume (when app is already open)
export function useSharedContent() {
  const [sharedContent, setSharedContent] = useState<ContentSource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastProcessedRef = useRef<string | null>(null);

  const checkSharedContent = useCallback(async () => {
    try {
      console.log('[useSharedContent] Checking for shared content...');
      const shared = await ShortcutPlugin.getSharedContent();
      console.log('[useSharedContent] Shared content result:', shared);
      
      if (shared) {
        // Handle both text (URLs) and data (file URIs)
        const text = shared.text || '';
        const data = shared.data || '';
        
        // Create a unique identifier for this share to prevent duplicates
        const shareId = `${text}-${data}-${shared.type}`;
        
        // Check if we already processed this exact share
        if (lastProcessedRef.current === shareId) {
          console.log('[useSharedContent] Already processed this share, skipping');
          setIsLoading(false);
          return;
        }
        
        // Check if it's a URL (shared from apps like Instagram, YouTube, etc.)
        const isUrl = text.startsWith('http://') || text.startsWith('https://');
        
        if (isUrl) {
          console.log('[useSharedContent] Detected shared URL:', text);
          lastProcessedRef.current = shareId;
          setSharedContent({
            type: 'share',
            uri: text,
            name: extractNameFromUrl(text),
          });
        } else if (data) {
          // File shared via share sheet
          console.log('[useSharedContent] Detected shared file:', data);
          lastProcessedRef.current = shareId;
          setSharedContent({
            type: 'file',
            uri: data,
            mimeType: shared.type,
          });
        } else if (text) {
          // Plain text that might be a URL without protocol
          const normalizedUrl = text.includes('://') ? text : `https://${text}`;
          try {
            new URL(normalizedUrl);
            console.log('[useSharedContent] Detected URL-like text:', normalizedUrl);
            lastProcessedRef.current = shareId;
            setSharedContent({
              type: 'share',
              uri: normalizedUrl,
              name: extractNameFromUrl(normalizedUrl),
            });
          } catch {
            // Not a valid URL, ignore
            console.log('[useSharedContent] Text is not a valid URL, ignoring');
          }
        }
      }
    } catch (error) {
      console.error('[useSharedContent] Error checking shared content:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check for shared content on initial mount
  useEffect(() => {
    checkSharedContent();
  }, [checkSharedContent]);

  // Listen for app state changes (resume from background)
  useEffect(() => {
    console.log('[useSharedContent] Setting up app state listener');
    
    const setupListener = async () => {
      const listener = await App.addListener('appStateChange', async (state) => {
        console.log('[useSharedContent] App state changed:', state);
        
        if (state.isActive) {
          console.log('[useSharedContent] App became active, rechecking for new shares');
          // Reset loading state and check for new content
          setIsLoading(true);
          // Clear the last processed ref to allow processing the same content
          // if the user explicitly shared again
          await checkSharedContent();
        }
      });

      return listener;
    };

    let listenerHandle: Awaited<ReturnType<typeof App.addListener>> | null = null;
    
    setupListener().then(handle => {
      listenerHandle = handle;
    }).catch(err => {
      console.error('[useSharedContent] Error setting up app state listener:', err);
    });

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [checkSharedContent]);

  const clearSharedContent = useCallback(async () => {
    console.log('[useSharedContent] Clearing shared content');
    setSharedContent(null);
    
    // Clear the native intent to prevent re-processing
    try {
      await ShortcutPlugin.clearSharedIntent();
      console.log('[useSharedContent] Native intent cleared');
    } catch (error) {
      console.log('[useSharedContent] Failed to clear native intent (may be web):', error);
    }
  }, []);

  // Recheck for shared content (useful when called manually)
  const recheckSharedContent = useCallback(() => {
    console.log('[useSharedContent] Manual recheck triggered');
    // Reset the last processed ref to force reprocessing
    lastProcessedRef.current = null;
    setIsLoading(true);
    checkSharedContent();
  }, [checkSharedContent]);

  return { sharedContent, isLoading, clearSharedContent, recheckSharedContent };
}

// Extract a readable name from URL
function extractNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const host = urlObj.hostname.toLowerCase();
    
    if (host.includes('instagram.com')) {
      return 'Instagram';
    }
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      return 'YouTube';
    }
    if (host.includes('twitter.com') || host.includes('x.com')) {
      return 'Twitter/X';
    }
    if (host.includes('tiktok.com')) {
      return 'TikTok';
    }
    if (host.includes('facebook.com') || host.includes('fb.com')) {
      return 'Facebook';
    }
    if (host.includes('linkedin.com')) {
      return 'LinkedIn';
    }
    if (host.includes('reddit.com')) {
      return 'Reddit';
    }
    
    return host.replace('www.', '');
  } catch {
    return 'Link';
  }
}
