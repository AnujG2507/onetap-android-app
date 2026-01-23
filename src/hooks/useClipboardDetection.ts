import { useState, useEffect, useCallback, useRef } from 'react';
import { App } from '@capacitor/app';
import { Clipboard as CapClipboard } from '@capacitor/clipboard';
import { isValidUrl } from '@/lib/contentResolver';

const DETECTION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const SHOWN_URLS_KEY = 'clipboard_shown_urls';

interface ShownUrlEntry {
  url: string;
  timestamp: number;
}

function getShownUrls(): ShownUrlEntry[] {
  try {
    const stored = localStorage.getItem(SHOWN_URLS_KEY);
    if (!stored) return [];
    const entries: ShownUrlEntry[] = JSON.parse(stored);
    // Filter out expired entries
    const now = Date.now();
    return entries.filter(e => now - e.timestamp < DETECTION_COOLDOWN_MS);
  } catch {
    return [];
  }
}

function markUrlAsShown(url: string): void {
  try {
    const entries = getShownUrls();
    entries.push({ url, timestamp: Date.now() });
    localStorage.setItem(SHOWN_URLS_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage errors
  }
}

function wasUrlRecentlyShown(url: string): boolean {
  const entries = getShownUrls();
  return entries.some(e => e.url === url);
}

// Regex pattern to match URLs in text
const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

function extractUrlFromText(text: string): string | null {
  const matches = text.match(URL_PATTERN);
  if (!matches || matches.length === 0) {
    return null;
  }
  
  // Return the first valid URL found
  for (const match of matches) {
    // Clean up trailing punctuation that might have been captured
    let cleanUrl = match.replace(/[.,;:!?)]+$/, '');
    
    if (isValidUrl(cleanUrl)) {
      return cleanUrl;
    }
  }
  
  return null;
}

async function readClipboardUrl(): Promise<string | null> {
  const processClipboardText = (value: string): string | null => {
    const trimmed = value.trim();
    
    if (!trimmed) {
      return null;
    }
    
    // If it contains newlines or spaces, try to extract a URL from it
    if (trimmed.includes('\n') || trimmed.includes(' ')) {
      return extractUrlFromText(trimmed);
    }
    
    // Check if it's already a valid URL
    if (isValidUrl(trimmed)) {
      return trimmed;
    }
    
    // Only try adding https if it looks like a domain pattern (has a dot)
    if (trimmed.includes('.') && !trimmed.startsWith('http')) {
      const withProtocol = `https://${trimmed}`;
      if (isValidUrl(withProtocol)) {
        return withProtocol;
      }
    }
    
    return null;
  };

  try {
    // Try Capacitor clipboard first
    const { value } = await CapClipboard.read();
    if (value) {
      const result = processClipboardText(value);
      if (result) return result;
    }
  } catch {
    // Fallback to web clipboard API
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const result = processClipboardText(text);
        if (result) return result;
      }
    } catch {
      // Clipboard access denied or unavailable
    }
  }
  return null;
}

export interface ClipboardDetection {
  detectedUrl: string | null;
  dismissDetection: () => void;
}

export function useClipboardDetection(enabled: boolean = true): ClipboardDetection {
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
  const hasCheckedRef = useRef(false);
  const enabledRef = useRef(enabled);
  
  // Keep ref in sync with prop
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const checkClipboard = useCallback(async () => {
    if (!enabledRef.current) return;
    
    try {
      const url = await readClipboardUrl();
      if (url && !wasUrlRecentlyShown(url)) {
        setDetectedUrl(url);
        markUrlAsShown(url);
      }
    } catch (error) {
      console.warn('[useClipboardDetection] Error reading clipboard:', error);
    }
  }, []);

  const dismissDetection = useCallback(() => {
    setDetectedUrl(null);
  }, []);

  // Check on initial mount - only once
  useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;
    
    if (enabledRef.current) {
      checkClipboard();
    }
  }, [checkClipboard]);

  // Check on app resume
  useEffect(() => {
    let listenerHandle: { remove: () => void } | null = null;
    let isSubscribed = true;

    App.addListener('appStateChange', (state) => {
      if (state.isActive && enabledRef.current && isSubscribed) {
        checkClipboard();
      }
    }).then(handle => {
      if (isSubscribed) {
        listenerHandle = handle;
      } else {
        handle.remove();
      }
    }).catch(err => {
      console.warn('[useClipboardDetection] Failed to add app state listener:', err);
    });

    return () => {
      isSubscribed = false;
      listenerHandle?.remove();
    };
  }, [checkClipboard]);

  // Clear detection when disabled
  useEffect(() => {
    if (!enabled && detectedUrl) {
      setDetectedUrl(null);
    }
  }, [enabled, detectedUrl]);

  return {
    detectedUrl: enabled ? detectedUrl : null,
    dismissDetection,
  };
}
