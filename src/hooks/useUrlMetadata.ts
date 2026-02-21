import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export interface UrlMetadata {
  title: string | null;
  favicon: string | null;
  domain: string;
  cachedAt?: number;
}

interface UseUrlMetadataResult {
  metadata: UrlMetadata | null;
  isLoading: boolean;
  error: string | null;
  isOffline: boolean;
}

const FAVICON_CACHE_KEY = 'onetap_favicon_cache';
const MAX_CACHE_SIZE = 500;
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// Load cache from localStorage on module init
function loadFaviconCache(): Map<string, UrlMetadata> {
  try {
    const stored = localStorage.getItem(FAVICON_CACHE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const now = Date.now();
      const map = new Map<string, UrlMetadata>();
      // Filter out expired entries during load
      for (const [key, value] of Object.entries(parsed)) {
        const entry = value as UrlMetadata;
        if (entry.cachedAt && now - entry.cachedAt > CACHE_TTL_MS) continue;
        map.set(key, entry);
      }
      return map;
    }
  } catch (e) {
    console.warn('[FaviconCache] Failed to load:', e);
  }
  return new Map();
}

// Save cache to localStorage with size limit
function saveFaviconCache(cache: Map<string, UrlMetadata>): void {
  try {
    // Trim oldest entries if cache is too large
    if (cache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(cache.entries());
      const trimmed = entries.slice(-MAX_CACHE_SIZE);
      cache.clear();
      trimmed.forEach(([k, v]) => cache.set(k, v));
    }
    
    const obj = Object.fromEntries(cache);
    localStorage.setItem(FAVICON_CACHE_KEY, JSON.stringify(obj));
  } catch (e) {
    console.warn('[FaviconCache] Failed to save:', e);
  }
}

// Initialize cache from localStorage
const metadataCache = loadFaviconCache();

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function useUrlMetadata(url: string | null): UseUrlMetadataResult {
  const [metadata, setMetadata] = useState<UrlMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { isOnline } = useNetworkStatus();

  useEffect(() => {
    if (!url) {
      setMetadata(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const domain = extractDomain(url);

    // Check cache first
    const cached = metadataCache.get(url);
    if (cached) {
      setMetadata(cached);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Set initial domain-based metadata immediately for fast UI
    setMetadata({
      title: null,
      favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      domain,
    });

    // Skip network fetch if offline - use domain fallback
    if (!isOnline) {
      setIsLoading(false);
      setError(null);
      return;
    }

    // Abort any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const fetchMetadata = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: fnError } = await supabase.functions.invoke('fetch-url-metadata', {
          body: { url },
        });

        if (controller.signal.aborted) return;

        if (fnError) {
          console.error('[useUrlMetadata] Function error:', fnError);
          setError('Failed to fetch metadata');
          return;
        }

        const result: UrlMetadata = {
          title: data?.title || null,
          favicon: data?.favicon || `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
          domain: data?.domain || domain,
          cachedAt: Date.now(),
        };

        // Cache the result in memory and localStorage
        metadataCache.set(url, result);
        saveFaviconCache(metadataCache);
        setMetadata(result);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('[useUrlMetadata] Error:', err);
        setError('Failed to fetch metadata');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    fetchMetadata();

    return () => {
      controller.abort();
    };
  }, [url, isOnline]);

  return { metadata, isLoading, error, isOffline: !isOnline };
}
