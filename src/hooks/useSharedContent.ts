import { useEffect, useState, useCallback } from 'react';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import type { ContentSource } from '@/types/shortcut';

// Hook to handle content shared via Android Share Sheet
export function useSharedContent() {
  const [sharedContent, setSharedContent] = useState<ContentSource | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkSharedContent = useCallback(async () => {
    try {
      console.log('[useSharedContent] Checking for shared content...');
      const shared = await ShortcutPlugin.getSharedContent();
      console.log('[useSharedContent] Shared content result:', shared);
      
      if (shared) {
        // Handle both text (URLs) and data (file URIs)
        const text = shared.text || '';
        const data = shared.data || '';
        
        // Check if it's a URL (shared from apps like Instagram, YouTube, etc.)
        const isUrl = text.startsWith('http://') || text.startsWith('https://');
        
        if (isUrl) {
          console.log('[useSharedContent] Detected shared URL:', text);
          setSharedContent({
            type: 'share',
            uri: text,
            name: extractNameFromUrl(text),
          });
        } else if (data) {
          // File shared via share sheet
          console.log('[useSharedContent] Detected shared file:', data);
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

  useEffect(() => {
    checkSharedContent();
  }, [checkSharedContent]);

  const clearSharedContent = useCallback(() => {
    console.log('[useSharedContent] Clearing shared content');
    setSharedContent(null);
  }, []);

  // Recheck for shared content (useful when app comes to foreground)
  const recheckSharedContent = useCallback(() => {
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
