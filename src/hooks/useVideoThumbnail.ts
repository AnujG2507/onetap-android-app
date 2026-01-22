import { useState, useEffect } from 'react';

interface UseVideoThumbnailResult {
  thumbnailUrl: string | null;
  platform: 'youtube' | 'vimeo' | null;
  isLoading: boolean;
}

// YouTube URL patterns
const YOUTUBE_REGEX = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;

// Vimeo URL patterns
const VIMEO_REGEX = /(?:vimeo\.com\/(?:video\/)?|player\.vimeo\.com\/video\/)(\d+)/i;

function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(YOUTUBE_REGEX);
  return match ? match[1] : null;
}

function extractVimeoVideoId(url: string): string | null {
  const match = url.match(VIMEO_REGEX);
  return match ? match[1] : null;
}

function getYouTubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export function useVideoThumbnail(url: string | null): UseVideoThumbnailResult {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [platform, setPlatform] = useState<'youtube' | 'vimeo' | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!url) {
      setThumbnailUrl(null);
      setPlatform(null);
      return;
    }

    // Check YouTube first (synchronous)
    const youtubeId = extractYouTubeVideoId(url);
    if (youtubeId) {
      setThumbnailUrl(getYouTubeThumbnailUrl(youtubeId));
      setPlatform('youtube');
      setIsLoading(false);
      return;
    }

    // Check Vimeo (requires async fetch)
    const vimeoId = extractVimeoVideoId(url);
    if (vimeoId) {
      setPlatform('vimeo');
      setIsLoading(true);

      const controller = new AbortController();

      fetch(`https://vimeo.com/api/oembed.json?url=https://vimeo.com/${vimeoId}`, {
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.thumbnail_url) {
            // Get a higher resolution thumbnail
            const highResThumbnail = data.thumbnail_url.replace(/_\d+x\d+/, '_640');
            setThumbnailUrl(highResThumbnail);
          }
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            console.warn('Failed to fetch Vimeo thumbnail:', err);
          }
        })
        .finally(() => {
          setIsLoading(false);
        });

      return () => controller.abort();
    }

    // Not a video URL
    setThumbnailUrl(null);
    setPlatform(null);
    setIsLoading(false);
  }, [url]);

  return { thumbnailUrl, platform, isLoading };
}
