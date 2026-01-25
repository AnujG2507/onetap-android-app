import { useEffect, useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { ArrowLeft, AlertCircle, Loader2, RefreshCw, ExternalLink, Share2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Share } from '@capacitor/share';
import { Button } from '@/components/ui/button';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';

/**
 * Resolve a URI to a playable file path.
 * Returns the absolute file path (not a web URL) for native file access.
 */
async function resolveToFilePath(uri: string): Promise<string | null> {
  try {
    // content:// -> resolve to absolute file path in app storage
    if (uri.startsWith('content://')) {
      const resolved = await ShortcutPlugin.resolveContentUri({ contentUri: uri });
      console.log('[VideoPlayer] resolveContentUri result:', resolved);

      if (!resolved?.success || !resolved.filePath) {
        console.error('[VideoPlayer] resolveContentUri failed:', resolved?.error);
        return null;
      }

      return resolved.filePath;
    }

    // file:// scheme -> extract path
    if (uri.startsWith('file://')) {
      return uri.replace('file://', '');
    }

    // Already an absolute path
    if (uri.startsWith('/')) {
      return uri;
    }

    // Unknown scheme, return as-is (might be a web URL)
    return uri;
  } catch (e) {
    console.error('[VideoPlayer] resolveToFilePath error:', e);
    return null;
  }
}

/**
 * Convert a file path to a URL the WebView can play.
 * On native platforms, uses Capacitor's file server.
 */
function filePathToPlayableUrl(filePath: string): string {
  // Ensure it has file:// prefix for Capacitor
  const fileUri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
  
  if (Capacitor.isNativePlatform()) {
    // Capacitor converts file:// to http://localhost/_capacitor_file_/...
    return Capacitor.convertFileSrc(fileUri);
  }
  
  // On web, just return the path (won't work but useful for debugging)
  return fileUri;
}

const VideoPlayer = () => {
  const [searchParams] = useSearchParams();

  const videoRef = useRef<HTMLVideoElement>(null);
  const mountIdRef = useRef(Date.now());

  const [state, setState] = useState<'loading' | 'ready' | 'playing' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);
  const [playableUrl, setPlayableUrl] = useState<string | null>(null);

  const videoUri = searchParams.get('uri');
  const nonce = searchParams.get('t');

  // Resolve the URI to a playable URL
  useEffect(() => {
    // Reset state on each mount/navigation
    mountIdRef.current = Date.now();
    setState('loading');
    setErrorMessage(null);
    setDebugInfo('');
    setResolvedPath(null);
    setPlayableUrl(null);

    if (!videoUri) {
      setState('error');
      setErrorMessage('No video URI provided');
      return;
    }

    const currentMountId = mountIdRef.current;

    const resolve = async () => {
      console.log('[VideoPlayer] Resolving URI:', videoUri, 'nonce:', nonce);

      const filePath = await resolveToFilePath(videoUri);
      
      if (mountIdRef.current !== currentMountId) {
        console.log('[VideoPlayer] Mount changed during resolve, aborting');
        return;
      }

      if (!filePath) {
        setState('error');
        setErrorMessage('Could not locate video file');
        setDebugInfo(`URI: ${videoUri}`);
        return;
      }

      console.log('[VideoPlayer] Resolved to file path:', filePath);
      setResolvedPath(filePath);

      // Verify file exists and get size (on native)
      if (Capacitor.isNativePlatform()) {
        try {
          const info = await ShortcutPlugin.getFileInfo({ path: filePath });
          console.log('[VideoPlayer] File info:', info);
          
          if (!info.success) {
            setState('error');
            setErrorMessage('Video file not accessible');
            setDebugInfo(`Path: ${filePath}\nError: ${info.error || 'Unknown'}`);
            return;
          }

          if (info.size === 0) {
            setState('error');
            setErrorMessage('Video file is empty');
            setDebugInfo(`Path: ${filePath}`);
            return;
          }

          // Log file size for debugging large files
          const sizeMB = ((info.size || 0) / (1024 * 1024)).toFixed(2);
          console.log(`[VideoPlayer] File size: ${sizeMB} MB`);
          setDebugInfo(`File: ${info.name || 'unknown'} (${sizeMB} MB)`);
        } catch (e) {
          console.warn('[VideoPlayer] getFileInfo failed (continuing anyway):', e);
        }
      }

      // Convert to playable URL
      const url = filePathToPlayableUrl(filePath);
      console.log('[VideoPlayer] Playable URL:', url);
      
      if (mountIdRef.current !== currentMountId) return;
      
      setPlayableUrl(url);
      setState('ready');
    };

    resolve();

    // Clear shared intent after starting to resolve
    if (Capacitor.isNativePlatform()) {
      ShortcutPlugin.clearSharedIntent().catch(() => {});
    }
  }, [videoUri, nonce]);

  // Handle video element setup when URL is ready
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !playableUrl || state !== 'ready') return;

    console.log('[VideoPlayer] Setting video source:', playableUrl);

    // Set up event handlers
    const handleCanPlay = () => {
      console.log('[VideoPlayer] canplay event');
      setState('playing');
    };

    const handleError = () => {
      const err = el.error;
      const code = err?.code || 0;
      const codeNames: Record<number, string> = {
        1: 'MEDIA_ERR_ABORTED',
        2: 'MEDIA_ERR_NETWORK',
        3: 'MEDIA_ERR_DECODE',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
      };

      console.error('[VideoPlayer] Video error:', {
        code,
        codeName: codeNames[code] || 'UNKNOWN',
        message: err?.message,
        networkState: el.networkState,
        readyState: el.readyState,
        src: el.src,
      });

      setState('error');
      
      if (code === 4) {
        setErrorMessage('This video format is not supported by your device');
      } else if (code === 2) {
        setErrorMessage('Network error while loading video');
      } else if (code === 3) {
        setErrorMessage('Video file appears to be corrupted');
      } else {
        setErrorMessage('Unable to play this video');
      }

      setDebugInfo(
        `Error: ${codeNames[code] || 'UNKNOWN'} (${code})\n` +
        `Network: ${el.networkState}, Ready: ${el.readyState}\n` +
        `Path: ${resolvedPath || 'unknown'}`
      );
    };

    const handleLoadStart = () => {
      console.log('[VideoPlayer] loadstart event');
    };

    const handleProgress = () => {
      if (el.buffered.length > 0) {
        const bufferedEnd = el.buffered.end(el.buffered.length - 1);
        const duration = el.duration || 0;
        const percent = duration > 0 ? ((bufferedEnd / duration) * 100).toFixed(1) : '?';
        console.log(`[VideoPlayer] Buffered: ${percent}%`);
      }
    };

    el.addEventListener('canplay', handleCanPlay);
    el.addEventListener('error', handleError);
    el.addEventListener('loadstart', handleLoadStart);
    el.addEventListener('progress', handleProgress);

    // Set the source directly
    el.src = playableUrl;
    el.load();

    // Auto-play with user gesture fallback
    const playPromise = el.play();
    if (playPromise) {
      playPromise.catch((e) => {
        console.warn('[VideoPlayer] Autoplay failed:', e.message);
        // User may need to tap play button
      });
    }

    return () => {
      el.removeEventListener('canplay', handleCanPlay);
      el.removeEventListener('error', handleError);
      el.removeEventListener('loadstart', handleLoadStart);
      el.removeEventListener('progress', handleProgress);
      
      // Clean up video element
      el.pause();
      el.removeAttribute('src');
      el.load();
    };
  }, [playableUrl, state, resolvedPath]);

  // Handle back button - exit app since video player is typically launched from shortcut
  const handleBack = useCallback(() => {
    console.log('[VideoPlayer] Back pressed, exiting app');
    if (Capacitor.isNativePlatform()) {
      App.exitApp();
    } else {
      window.history.back();
    }
  }, []);
  
  // Custom back button handler with high priority
  // We don't use useBackButton hook because native video controls interfere with it
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    
    console.log('[VideoPlayer] Setting up back button handler');
    
    const handler = App.addListener('backButton', () => {
      console.log('[VideoPlayer] Back button pressed - exiting app');
      App.exitApp();
    });

    return () => {
      console.log('[VideoPlayer] Cleaning up back button handler');
      handler.then(h => h.remove());
    };
  }, []);

  // Open in external app (ACTION_VIEW - shows video players)
  const handleOpenExternal = useCallback(async () => {
    if (!videoUri) return;
    try {
      const result = await ShortcutPlugin.openWithExternalApp({
        uri: videoUri,
        mimeType: 'video/*',
      });
      if (!result.success) {
        console.log('[VideoPlayer] Failed to open in external app:', result.error);
      }
    } catch (error) {
      console.log('[VideoPlayer] Error opening external app:', error);
    }
  }, [videoUri]);

  // Share video (ACTION_SEND - shows messaging apps, cloud storage)
  const handleShare = useCallback(async () => {
    if (!videoUri) return;
    try {
      await Share.share({
        title: 'Share Video',
        url: videoUri,
        dialogTitle: 'Share video...',
      });
    } catch (error) {
      console.log('[VideoPlayer] Share cancelled or failed:', error);
    }
  }, [videoUri]);

  const handleRetry = useCallback(() => {
    // Force re-resolve by updating the mount ID
    mountIdRef.current = Date.now();
    setState('loading');
    setErrorMessage(null);
    setDebugInfo('');
    setResolvedPath(null);
    setPlayableUrl(null);

    // Re-trigger the effect by navigating with new timestamp
    const newParams = new URLSearchParams(searchParams);
    newParams.set('t', Date.now().toString());
    window.history.replaceState(null, '', `/player?${newParams.toString()}`);
    // Trigger re-render
    window.location.reload();
  }, [searchParams]);

  // Loading state
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <Loader2 className="h-12 w-12 text-white animate-spin mb-4" />
        <p className="text-muted-foreground text-center">Loading video...</p>
        {debugInfo && (
          <p className="text-xs text-muted-foreground/50 mt-2 text-center">{debugInfo}</p>
        )}
      </div>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Cannot Play Video</h2>
          <p className="text-muted-foreground mb-4">{errorMessage || 'An unknown error occurred'}</p>
          {debugInfo && (
            <pre className="text-xs text-muted-foreground/60 mb-6 font-mono whitespace-pre-wrap text-left bg-white/5 p-3 rounded">
              {debugInfo}
            </pre>
          )}
          <div className="flex gap-3 justify-center">
            <Button onClick={handleRetry} variant="outline">
              <RefreshCw className="h-4 w-4 me-2" />
              Retry
            </Button>
            <Button onClick={handleBack} variant="ghost">
              <ArrowLeft className="h-4 w-4 me-2 rtl:rotate-180" />
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Ready/Playing state - show video
  return (
    <div className="min-h-screen bg-black flex flex-col">
      <header className="absolute top-0 inset-x-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center justify-between">
          <Button onClick={handleBack} variant="ghost" size="icon" className="text-white hover:bg-white/20">
            <ArrowLeft className="h-6 w-6 rtl:rotate-180" />
          </Button>
          <div className="flex items-center gap-2">
            <Button onClick={handleOpenExternal} variant="ghost" size="icon" className="text-white hover:bg-white/20">
              <ExternalLink className="h-5 w-5" />
            </Button>
            <Button onClick={handleShare} variant="ghost" size="icon" className="text-white hover:bg-white/20">
              <Share2 className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center relative">
        {state === 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="h-10 w-10 text-white/50 animate-spin" />
          </div>
        )}
        <video
          ref={videoRef}
          key={`video-${mountIdRef.current}`}
          className="max-w-full max-h-full w-full h-full object-contain"
          controls
          playsInline
          preload="auto"
        />
      </div>
    </div>
  );
};

export default VideoPlayer;
