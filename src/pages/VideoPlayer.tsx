import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';

interface FileInfo {
  exists: boolean;
  size: number;
  mimeType?: string;
}

const VideoPlayer = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [playbackSrc, setPlaybackSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 2;
  
  const videoUri = searchParams.get('uri');
  const mimeType = searchParams.get('type') || 'video/mp4';
  // Nonce to force re-initialization on repeated navigations
  const nonce = searchParams.get('t');

  const resolveAndPlay = useCallback(async (uri: string): Promise<string | null> => {
    console.log('[VideoPlayer] Resolving URI:', uri);
    
    try {
      let src = uri;
      let resolvedPath: string | null = null;

      if (uri.startsWith('content://')) {
        const resolved = await ShortcutPlugin.resolveContentUri({ contentUri: uri });
        console.log('[VideoPlayer] resolveContentUri result:', resolved);

        if (resolved?.success && resolved.filePath) {
          resolvedPath = resolved.filePath;
          const fileUri = resolved.filePath.startsWith('file://')
            ? resolved.filePath
            : `file://${resolved.filePath}`;
          src = Capacitor.convertFileSrc(fileUri);
        } else {
          console.warn('[VideoPlayer] resolveContentUri failed:', resolved?.error);
          return null;
        }
      } else if (uri.startsWith('file://') || uri.startsWith('/')) {
        resolvedPath = uri.startsWith('file://') ? uri.replace('file://', '') : uri;
        const fileUri = uri.startsWith('file://') ? uri : `file://${uri}`;
        src = Capacitor.convertFileSrc(fileUri);
      }

      // Validate file exists and has content (native only)
      if (resolvedPath && Capacitor.isNativePlatform()) {
        try {
          const fileInfo = await ShortcutPlugin.getFileInfo({ path: resolvedPath });
          console.log('[VideoPlayer] File info:', fileInfo);
          
          if (!fileInfo.success) {
            setDebugInfo(`File check failed: ${fileInfo.error || 'unknown'}`);
            return null;
          }
          
          if (fileInfo.size === 0) {
            setDebugInfo('Video file is empty (0 bytes)');
            return null;
          }
        } catch (e) {
          console.warn('[VideoPlayer] getFileInfo failed (non-critical):', e);
          // Continue anyway - some paths may not be checkable
        }
      }

      return src;
    } catch (e) {
      console.error('[VideoPlayer] Resolution error:', e);
      return null;
    }
  }, []);

  const attemptPlayback = useCallback(async () => {
    if (!videoUri) {
      setError('No video URI provided');
      setIsLoading(false);
      return;
    }

    console.log('[VideoPlayer] Attempting playback, retry:', retryCountRef.current);
    
    const src = await resolveAndPlay(videoUri);
    
    if (!src) {
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        console.log('[VideoPlayer] Resolution failed, scheduling retry', retryCountRef.current);
        // Wait before retry (cold-start timing issues)
        setTimeout(() => attemptPlayback(), 500);
        return;
      }
      
      setError(debugInfo || 'Unable to resolve video file. The file may have been moved or deleted.');
      setIsLoading(false);
      return;
    }

    console.log('[VideoPlayer] Setting playback source:', src);
    setPlaybackSrc(src);
    setIsLoading(false);

    // Explicitly load and play after a short delay for cold-start resilience
    setTimeout(() => {
      if (videoRef.current) {
        console.log('[VideoPlayer] Explicitly loading video');
        videoRef.current.load();
        videoRef.current.play().catch(err => {
          console.warn('[VideoPlayer] Autoplay blocked or failed:', err);
          // Don't treat autoplay block as error - user can tap play
        });
      }
    }, 100);
  }, [videoUri, resolveAndPlay, debugInfo]);

  useEffect(() => {
    console.log('[VideoPlayer] Mounted with URI:', videoUri, 'Type:', mimeType, 'Nonce:', nonce);
    
    // Reset state for fresh playback
    retryCountRef.current = 0;
    setError(null);
    setPlaybackSrc(null);
    setDebugInfo(null);
    setIsLoading(true);

    attemptPlayback();
  }, [videoUri, mimeType, nonce, attemptPlayback]);

  const handleBack = () => {
    navigate('/');
  };

  const handleVideoError = useCallback(() => {
    console.error('[VideoPlayer] Video playback error, retry count:', retryCountRef.current);
    
    if (retryCountRef.current < maxRetries) {
      retryCountRef.current++;
      console.log('[VideoPlayer] Playback error, retrying...', retryCountRef.current);
      
      // Clear current src and retry resolution
      setPlaybackSrc(null);
      setIsLoading(true);
      
      setTimeout(() => attemptPlayback(), 500);
    } else {
      setError('Unable to play this video. The file may be corrupted or in an unsupported format.');
    }
  }, [attemptPlayback]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <Loader2 className="h-12 w-12 text-white animate-spin mb-4" />
        <p className="text-muted-foreground">Loading video...</p>
      </div>
    );
  }

  // Error state
  if (error || !videoUri) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">
            Cannot Play Video
          </h2>
          <p className="text-muted-foreground mb-6">
            {error || 'No video URI provided'}
          </p>
          {debugInfo && (
            <p className="text-xs text-muted-foreground/60 mb-4 font-mono">
              {debugInfo}
            </p>
          )}
          <Button onClick={handleBack} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header with back button */}
      <header className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent">
        <Button 
          onClick={handleBack} 
          variant="ghost" 
          size="icon"
          className="text-white hover:bg-white/20"
        >
          <ArrowLeft className="h-6 w-6" />
        </Button>
      </header>

      {/* Video player */}
      <div className="flex-1 flex items-center justify-center">
        {playbackSrc && (
          <video
            ref={videoRef}
            key={`${playbackSrc}-${nonce}`}
            src={playbackSrc}
            className="max-w-full max-h-full w-full h-full object-contain"
            controls
            autoPlay
            playsInline
            onError={handleVideoError}
          >
            <source src={playbackSrc} type={mimeType} />
            Your browser does not support the video tag.
          </video>
        )}
      </div>
    </div>
  );
};

export default VideoPlayer;
