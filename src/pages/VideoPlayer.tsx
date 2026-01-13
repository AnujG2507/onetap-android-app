import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';

async function probeUrl(url: string): Promise<{ ok: boolean; status?: number; contentType?: string; hint?: string }> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Range: 'bytes=0-2047',
      },
      cache: 'no-store',
    });

    const contentType = res.headers.get('content-type') || undefined;

    if (!res.ok) {
      return { ok: false, status: res.status, contentType, hint: 'HTTP not ok' };
    }

    // Detect common failure mode: HTML error page from the file server.
    const snippet = await res.text();
    const looksHtml = /<!doctype html|<html/i.test(snippet);
    if (looksHtml) {
      return { ok: false, status: res.status, contentType, hint: 'Got HTML instead of video' };
    }

    return { ok: true, status: res.status, contentType };
  } catch (e) {
    return { ok: false, hint: `probe fetch failed: ${String(e)}` };
  }
}

function normalizeAbsolutePath(p: string): string {
  if (p.startsWith('file://')) return p;
  if (p.startsWith('/')) return `file://${p}`;
  return p;
}

async function resolveToPlayableSrc(uri: string, cacheBuster?: string): Promise<{ src: string; resolvedPath?: string } | null> {
  try {
    let baseSrc: string | null = null;
    let resolvedPath: string | undefined;

    // content:// -> resolve to absolute file path in app storage
    if (uri.startsWith('content://')) {
      const resolved = await ShortcutPlugin.resolveContentUri({ contentUri: uri });
      console.log('[VideoPlayer] resolveContentUri result:', resolved);

      if (!resolved?.success || !resolved.filePath) return null;

      const fileUri = normalizeAbsolutePath(resolved.filePath.startsWith('file://') ? resolved.filePath : resolved.filePath);
      baseSrc = Capacitor.convertFileSrc(fileUri);
      resolvedPath = resolved.filePath;
    }
    // file:// or /absolute/path
    else if (uri.startsWith('file://') || uri.startsWith('/')) {
      const fileUri = normalizeAbsolutePath(uri);
      baseSrc = Capacitor.convertFileSrc(fileUri);
      resolvedPath = uri.startsWith('file://') ? uri.replace('file://', '') : uri;
    }
    // Already a web URL (unlikely for local playback, but handle gracefully)
    else {
      baseSrc = uri;
    }

    if (!baseSrc) return null;

    // Add cache-buster to prevent WebView from serving stale/broken cached responses
    const separator = baseSrc.includes('?') ? '&' : '?';
    const src = `${baseSrc}${separator}_cb=${cacheBuster || Date.now()}`;

    return { src, resolvedPath };
  } catch (e) {
    console.error('[VideoPlayer] resolveToPlayableSrc error:', e);
    return null;
  }
}

const VideoPlayer = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement>(null);
  const retriesRef = useRef(0);
  const sessionIdRef = useRef(Date.now().toString()); // Unique per mount

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [playbackSrc, setPlaybackSrc] = useState<string | null>(null);

  const videoUri = searchParams.get('uri');
  const nonce = searchParams.get('t');

  const attemptRef = useRef<() => void>(() => {});

  attemptRef.current = async () => {
    if (!videoUri) {
      setError('No video URI provided');
      setIsLoading(false);
      return;
    }

    console.log('[VideoPlayer] attempt', { retry: retriesRef.current, videoUri, nonce });

    // Use nonce + sessionId as cache buster to ensure fresh load each time
    const cacheBuster = `${nonce || ''}_${sessionIdRef.current}_${retriesRef.current}`;
    const resolved = await resolveToPlayableSrc(videoUri, cacheBuster);
    if (!resolved) {
      setDebugInfo('resolveToPlayableSrc returned null');
      setError('Unable to open video. Please try again.');
      setIsLoading(false);
      return;
    }

    // Optional native sanity check: file exists and is non-empty
    if (Capacitor.isNativePlatform() && resolved.resolvedPath) {
      try {
        const info = await ShortcutPlugin.getFileInfo({ path: resolved.resolvedPath });
        console.log('[VideoPlayer] getFileInfo:', info);
        if (!info.success) {
          setDebugInfo(`getFileInfo failed: ${info.error || 'unknown'}`);
        } else if (info.size === 0) {
          setDebugInfo('Video file is empty (0 bytes)');
          setError('Video file is empty.');
          setIsLoading(false);
          return;
        }
      } catch (e) {
        console.warn('[VideoPlayer] getFileInfo threw (non-fatal):', e);
      }
    }

    // On native platforms, skip fetch-based probe (CORS issues with file:// URLs).
    // The getFileInfo check above is sufficient. On web, probe can help detect server issues.
    if (!Capacitor.isNativePlatform()) {
      const probe = await probeUrl(resolved.src);
      console.log('[VideoPlayer] probe:', probe);
      if (!probe.ok) {
        setDebugInfo(`probe failed: ${probe.hint || 'unknown'} status=${probe.status ?? '?'} ct=${probe.contentType ?? '?'}`);
        if (retriesRef.current < 3) {
          retriesRef.current += 1;
          setTimeout(() => attemptRef.current(), 700);
          return;
        }
        setError('Unable to load video stream.');
        setIsLoading(false);
        return;
      }
    } else {
      console.log('[VideoPlayer] Skipping probe on native platform, using file directly');
    }

    setPlaybackSrc(resolved.src);
    setIsLoading(false);

    // Clear shared intent ONLY after we have a confirmed playable src.
    if (Capacitor.isNativePlatform()) {
      try {
        await ShortcutPlugin.clearSharedIntent();
        console.log('[VideoPlayer] Cleared shared intent (post-resolve)');
      } catch (e) {
        console.log('[VideoPlayer] clearSharedIntent failed (non-fatal):', e);
      }
    }
  };

  // Reset on new navigation (nonce changes for repeated shortcut taps)
  useEffect(() => {
    // Generate new session ID for each navigation to bust caches
    sessionIdRef.current = Date.now().toString();
    retriesRef.current = 0;
    setIsLoading(true);
    setError(null);
    setDebugInfo(null);
    setPlaybackSrc(null);

    attemptRef.current();
  }, [videoUri, nonce]);

  // Drive the HTMLVideoElement explicitly; avoid <source type=...> because wrong types cause false “unsupported”.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !playbackSrc) return;

    let cancelled = false;

    const kick = () => {
      if (cancelled) return;
      try {
        console.log('[VideoPlayer] load/play', { playbackSrc });
        el.src = playbackSrc;
        el.load();
        el.play().catch((e) => console.warn('[VideoPlayer] play() failed:', e));
      } catch (e) {
        console.warn('[VideoPlayer] load/play threw:', e);
      }
    };

    const t = window.setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(kick));
    }, 50);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      try {
        el.pause();
        el.removeAttribute('src');
        el.load();
      } catch {
        // ignore
      }
    };
  }, [playbackSrc]);

  const handleBack = () => navigate('/');

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
    ].join(' | ') + probeDetails;

    console.error('[VideoPlayer] video error', details);
    setDebugInfo(details);

    if (retriesRef.current < 3) {
      retriesRef.current += 1;
      setIsLoading(true);
      setTimeout(() => attemptRef.current(), 700);
      return;
    }

    setIsLoading(false);
    setError('Unable to play this video. The file may be corrupted or in an unsupported format.');
  }, [playbackSrc]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <Loader2 className="h-12 w-12 text-white animate-spin mb-4" />
        <p className="text-muted-foreground">Loading video...</p>
      </div>
    );
  }

  if (error || !videoUri) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Cannot Play Video</h2>
          <p className="text-muted-foreground mb-6">{error || 'No video URI provided'}</p>
          {debugInfo && <p className="text-xs text-muted-foreground/60 mb-4 font-mono">{debugInfo}</p>}
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
      <header className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent">
        <Button onClick={handleBack} variant="ghost" size="icon" className="text-white hover:bg-white/20">
          <ArrowLeft className="h-6 w-6" />
        </Button>
      </header>

      <div className="flex-1 flex items-center justify-center">
        <video
          ref={videoRef}
          key={`video-${sessionIdRef.current}-${nonce ?? ''}`}
          className="max-w-full max-h-full w-full h-full object-contain"
          controls
          autoPlay
          playsInline
          onError={handleVideoError}
        />
      </div>
    </div>
  );
};

export default VideoPlayer;
