import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';

function guessVideoMimeTypeFromPath(path: string): string | undefined {
  const lower = path.toLowerCase();
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mkv')) return 'video/x-matroska';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.m4v')) return 'video/x-m4v';
  if (lower.endsWith('.3gp') || lower.endsWith('.3gpp')) return 'video/3gpp';
  return undefined;
}

async function probeUrl(url: string): Promise<{ ok: boolean; status?: number; contentType?: string; contentLength?: string; hint?: string }> {
  try {
    // Use a small range request; if the file server isn't ready it often returns HTML/404.
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Range: 'bytes=0-1023',
      },
    });

    const contentType = res.headers.get('content-type') || undefined;
    const contentLength = res.headers.get('content-length') || undefined;

    if (!res.ok) {
      return { ok: false, status: res.status, contentType, contentLength, hint: 'HTTP not ok' };
    }

    // Read a tiny snippet to detect an HTML error page being served.
    const textSnippet = await res.text();
    const looksHtml = /<!doctype html|<html/i.test(textSnippet);

    if (looksHtml) {
      return { ok: false, status: res.status, contentType, contentLength, hint: 'Got HTML instead of video' };
    }

    return { ok: true, status: res.status, contentType, contentLength };
  } catch (e) {
    return { ok: false, hint: `probe fetch failed: ${String(e)}` };
  }
}

const VideoPlayer = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [playbackSrc, setPlaybackSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [effectiveMimeType, setEffectiveMimeType] = useState<string | undefined>(undefined);
  const [hasClearedIntent, setHasClearedIntent] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 2;

  const videoUri = searchParams.get('uri');
  const requestedMimeType = searchParams.get('type') || undefined;
  const isGenericRequestedMimeType =
    !requestedMimeType || requestedMimeType === '*/*' || requestedMimeType.endsWith('/*');

  // Nonce to force re-initialization on repeated navigations
  const nonce = searchParams.get('t');

  const resolveAndPlay = useCallback(async (uri: string, requestedType?: string): Promise<string | null> => {
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

      // Validate file exists and has content + try to determine MIME type (native only)
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

          // If the caller passed a generic/unknown MIME type, prefer the native-detected type
          const isGeneric = !requestedType || requestedType === '*/*' || requestedType.endsWith('/*');
          if (isGeneric) {
            const detected = fileInfo.mimeType || guessVideoMimeTypeFromPath(resolvedPath);
            if (detected) {
              setEffectiveMimeType(detected);
            } else {
              // Let the browser sniff if we can't detect
              setEffectiveMimeType(undefined);
            }
          }
        } catch (e) {
          console.warn('[VideoPlayer] getFileInfo failed (non-critical):', e);
          // Continue anyway - some paths may not be checkable
        }
      }

      // IMPORTANT: Avoid cached bad responses (some devices cache an early 404 HTML response).
      // Query params are ignored by Capacitor's file server path mapping.
      const cacheBusted = src.includes('?') ? `${src}&t=${Date.now()}` : `${src}?t=${Date.now()}`;
      return cacheBusted;
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

    const src = await resolveAndPlay(videoUri, requestedMimeType);

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

    // Probe the URL before trying to decode it.
    // If we get HTML/404, wait and retry instead of showing "corrupted".
    const probe = await probeUrl(src);
    console.log('[VideoPlayer] Probe result:', probe);
    if (!probe.ok) {
      setDebugInfo(`Probe failed: ${probe.hint || 'unknown'} | status=${probe.status ?? '?'} | ct=${probe.contentType ?? '?'} | cl=${probe.contentLength ?? '?'}`);

      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        console.log('[VideoPlayer] Probe failed, scheduling retry', retryCountRef.current);
        setTimeout(() => attemptPlayback(), 700);
        return;
      }

      setError('Unable to load video stream. Please try again.');
      setIsLoading(false);
      return;
    }

    console.log('[VideoPlayer] Setting playback source:', src);
    setPlaybackSrc(src);
    setIsLoading(false);

    // Clear the native intent *after* we have a good resolved URL.
    if (Capacitor.isNativePlatform() && !hasClearedIntent) {
      try {
        await ShortcutPlugin.clearSharedIntent();
        setHasClearedIntent(true);
        console.log('[VideoPlayer] Cleared shared intent (post-resolve)');
      } catch (e) {
        console.log('[VideoPlayer] Failed to clear shared intent (non-fatal):', e);
      }
    }
  }, [videoUri, resolveAndPlay, debugInfo, requestedMimeType, hasClearedIntent]);

  // When we have a src, explicitly load/play *after* the <video> is in the DOM.
  // This avoids cold-start timing issues where play() runs before the element is fully updated.
  useEffect(() => {
    if (!playbackSrc) return;

    let cancelled = false;

    const kick = () => {
      if (cancelled) return;
      const el = videoRef.current;
      if (!el) return;

      console.log('[VideoPlayer] Kicking load/play', { src: playbackSrc, effectiveMimeType, requestedMimeType });
      try {
        el.load();
        el.play().catch(err => {
          console.warn('[VideoPlayer] Autoplay blocked or failed:', err);
        });
      } catch (e) {
        console.warn('[VideoPlayer] load/play threw:', e);
      }
    };

    // Wait a couple of frames to ensure the WebView/capacitor file server is ready.
    const t = window.setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(kick));
    }, 50);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [playbackSrc, nonce, effectiveMimeType, requestedMimeType]);

  useEffect(() => {
    console.log('[VideoPlayer] Mounted with URI:', videoUri, 'Requested type:', requestedMimeType, 'Effective type:', effectiveMimeType, 'Nonce:', nonce);

    // Reset state for fresh playback
    retryCountRef.current = 0;
    setError(null);
    setPlaybackSrc(null);
    setDebugInfo(null);
    setIsLoading(true);
    setHasClearedIntent(false);
    setEffectiveMimeType(!isGenericRequestedMimeType ? requestedMimeType : undefined);

    attemptPlayback();
  }, [videoUri, requestedMimeType, nonce, attemptPlayback, isGenericRequestedMimeType]);

  const handleBack = () => {
    navigate('/');
  };

  const handleVideoError = useCallback(async () => {
    const el = videoRef.current;
    const err = el?.error;

    let probeDetails = '';
    if (playbackSrc) {
      const probe = await probeUrl(playbackSrc);
      probeDetails = ` | probe=${probe.ok ? 'ok' : 'bad'}:${probe.hint || ''} status=${probe.status ?? '?'} ct=${probe.contentType ?? '?'}`;
    }

    const details = [
      err ? `MediaError code=${err.code}` : 'MediaError missing',
      el ? `networkState=${el.networkState}` : 'networkState=?',
      el ? `readyState=${el.readyState}` : 'readyState=?',
      playbackSrc ? `src=${playbackSrc}` : 'src=?',
      requestedMimeType ? `requestedType=${requestedMimeType}` : 'requestedType=?',
      effectiveMimeType ? `effectiveType=${effectiveMimeType}` : 'effectiveType=?',
    ].join(' | ') + probeDetails;

    console.error('[VideoPlayer] Video playback error', details);
    setDebugInfo(details);

    // If we passed a generic/incorrect type, let the browser sniff on retry.
    if (err?.code === 4) {
      setEffectiveMimeType(undefined);
    }

    if (retryCountRef.current < maxRetries) {
      retryCountRef.current++;
      console.log('[VideoPlayer] Playback error, retrying...', retryCountRef.current);

      // Clear current src and retry resolution
      setPlaybackSrc(null);
      setIsLoading(true);

      setTimeout(() => attemptPlayback(), 700);
    } else {
      setError('Unable to play this video. The file may be corrupted or in an unsupported format.');
    }
  }, [attemptPlayback, playbackSrc, requestedMimeType, effectiveMimeType]);

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
          <h2 className="text-xl font-semibold text-white mb-2">Cannot Play Video</h2>
          <p className="text-muted-foreground mb-6">{error || 'No video URI provided'}</p>
          {debugInfo && (
            <p className="text-xs text-muted-foreground/60 mb-4 font-mono">{debugInfo}</p>
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
            className="max-w-full max-h-full w-full h-full object-contain"
            controls
            autoPlay
            playsInline
            onError={handleVideoError}
          >
            <source src={playbackSrc} type={effectiveMimeType} />
            Your browser does not support the video tag.
          </video>
        )}
      </div>
    </div>
  );
};

export default VideoPlayer;

