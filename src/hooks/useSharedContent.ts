import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import type { ContentSource, MultiFileSource } from '@/types/shortcut';
import { useToast } from '@/hooks/use-toast';

// Hook to handle content shared via Android Share Sheet
// Supports both initial launch and app resume (when app is already open)
export function useSharedContent() {
  const navigate = useNavigate();
  const [sharedContent, setSharedContent] = useState<ContentSource | null>(null);
  const [sharedMultiFiles, setSharedMultiFiles] = useState<MultiFileSource | null>(null);
  const [sharedAction, setSharedAction] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastProcessedRef = useRef<string | null>(null);
  const { toast } = useToast();

  const checkSharedContent = useCallback(async () => {
    try {
      console.log('[useSharedContent] Checking for shared content...');
      const shared = await ShortcutPlugin.getSharedContent();
      console.log('[useSharedContent] Shared content result:', shared);
      
      if (shared) {
        const action = shared.action || null;
        setSharedAction(action);
        
        // Handle PDF viewer action - navigate directly to PDF viewer
        if (action === 'app.onetap.VIEW_PDF') {
          const pdfUri = shared.data || '';
          const shortcutId = shared.shortcutId || '';
          const resume = shared.resume === true || shared.resume === 'true';
          
          console.log('[useSharedContent] VIEW_PDF action detected:', { pdfUri, shortcutId, resume });
          
          if (pdfUri) {
            // Navigate to PDF viewer with params
            navigate(`/pdf?uri=${encodeURIComponent(pdfUri)}&shortcutId=${encodeURIComponent(shortcutId)}&resume=${resume}`);
            setIsLoading(false);
            return;
          }
        }

        // Handle multi-file shares (ACTION_SEND_MULTIPLE)
        if (shared.multipleFiles) {
          const shareId = `multi-${shared.fileCount}-${shared.allImages}-${shared.mixed}`;
          if (lastProcessedRef.current === shareId) {
            console.log('[useSharedContent] Already processed this multi-file share, skipping');
            setIsLoading(false);
            return;
          }
          lastProcessedRef.current = shareId;

          if (shared.allImages && shared.files && shared.files.length > 1) {
            // Case B: Multiple images -> slideshow
            console.log('[useSharedContent] Multiple images shared, routing to slideshow:', shared.files.length);
            setSharedMultiFiles({
              type: 'slideshow',
              files: shared.files.map(f => ({
                uri: f.uri,
                mimeType: f.mimeType,
                name: f.name,
              })),
            });
          } else if (shared.allImages && shared.files && shared.files.length === 1) {
            // Single image via SEND_MULTIPLE -> treat as single file
            console.log('[useSharedContent] Single image via SEND_MULTIPLE, routing as single file');
            setSharedContent({
              type: 'file',
              uri: shared.files[0].uri,
              mimeType: shared.files[0].mimeType,
              name: shared.files[0].name,
            });
          } else if (shared.mixed) {
            // Case D: Mixed types -> toast + exit
            console.log('[useSharedContent] Mixed file types shared, rejecting');
            toast({ title: 'Please share only one file type at a time.' });
          } else {
            // Case C: Multiple non-image files -> toast + exit
            console.log('[useSharedContent] Multiple non-image files shared, rejecting');
            toast({ title: 'Multiple non-image files are not supported.' });
          }
          setIsLoading(false);
          return;
        }

        // Handle both text (URLs, etc.) and data (file URIs)
        const text = shared.text || '';
        const data = shared.data || '';

        // Create a unique identifier for this share to prevent duplicates
        const shareId = `${action}-${text}-${data}-${shared.type}`;

        // Check if we already processed this exact share
        if (lastProcessedRef.current === shareId) {
          console.log('[useSharedContent] Already processed this share, skipping');
          setIsLoading(false);
          return;
        }
        
        // Check if the text itself is a URL (shared from apps like Instagram, YouTube, etc.)
        const isDirectUrl = text.startsWith('http://') || text.startsWith('https://');
        
        if (isDirectUrl) {
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
            name: shared.name || undefined,
          });
        } else if (text) {
          // Try to extract a URL from text that may contain other content
          // e.g., "Watch this show! https://netflix.com/watch/12345"
          const extractedUrl = extractUrlFromText(text);
          
          if (extractedUrl) {
            console.log('[useSharedContent] Extracted URL from text:', extractedUrl);
            lastProcessedRef.current = shareId;
            setSharedContent({
              type: 'share',
              uri: extractedUrl,
              name: extractNameFromUrl(extractedUrl),
            });
          } else {
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
      } else {
        setSharedAction(null);
      }
    } catch (error) {
      console.error('[useSharedContent] Error checking shared content:', error);
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

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
          // if the user explicitly shared/tapped again after force-close
          lastProcessedRef.current = null;
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
    setSharedMultiFiles(null);
    setSharedAction(null);
    
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

  return { sharedContent, sharedMultiFiles, sharedAction, isLoading, clearSharedContent, recheckSharedContent };
}

// Extract first URL from text that may contain other content
// e.g., "Watch this show! https://netflix.com/watch/12345" -> "https://netflix.com/watch/12345"
function extractUrlFromText(text: string): string | null {
  // Match http/https URLs, stopping at whitespace or common terminating characters
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi;
  const matches = text.match(urlRegex);
  return matches ? matches[0] : null;
}

// Extract a readable name from URL
function extractNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const host = urlObj.hostname.toLowerCase();
    
    // Popular OTT platforms
    if (host.includes('netflix.com')) {
      return 'Netflix';
    }
    if (host.includes('primevideo.com') || host.includes('amazon.com/gp/video')) {
      return 'Prime Video';
    }
    if (host.includes('hotstar.com') || host.includes('disney') || host.includes('disneyplus')) {
      return 'Disney+ Hotstar';
    }
    if (host.includes('sonyliv.com')) {
      return 'SonyLIV';
    }
    if (host.includes('zee5.com')) {
      return 'ZEE5';
    }
    if (host.includes('jiocinema.com')) {
      return 'JioCinema';
    }
    if (host.includes('mxplayer.in')) {
      return 'MX Player';
    }
    if (host.includes('voot.com')) {
      return 'Voot';
    }
    if (host.includes('hbomax.com') || host.includes('max.com')) {
      return 'Max';
    }
    if (host.includes('hulu.com')) {
      return 'Hulu';
    }
    if (host.includes('peacocktv.com')) {
      return 'Peacock';
    }
    if (host.includes('paramountplus.com')) {
      return 'Paramount+';
    }
    if (host.includes('appletv') || host.includes('tv.apple.com')) {
      return 'Apple TV+';
    }
    
    // Social media platforms
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
    if (host.includes('spotify.com')) {
      return 'Spotify';
    }
    
    return host.replace('www.', '');
  } catch {
    return 'Link';
  }
}
