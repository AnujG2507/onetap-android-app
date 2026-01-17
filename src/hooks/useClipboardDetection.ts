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

async function readClipboardUrl(): Promise<string | null> {
  const processClipboardText = (value: string): string | null => {
    const trimmed = value.trim();
    
    // Skip if empty, contains newlines, or has spaces (URLs don't have unencoded spaces)
    if (!trimmed || trimmed.includes('\n') || trimmed.includes(' ')) {
      return null;
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

  const checkClipboard = useCallback(async () => {
    if (!enabled) return;
    
    const url = await readClipboardUrl();
    if (url && !wasUrlRecentlyShown(url)) {
      setDetectedUrl(url);
      markUrlAsShown(url);
    }
  }, [enabled]);

  const dismissDetection = useCallback(() => {
    setDetectedUrl(null);
  }, []);

  // Check on initial mount
  useEffect(() => {
    if (!enabled || hasCheckedRef.current) return;
    hasCheckedRef.current = true;
    checkClipboard();
  }, [enabled, checkClipboard]);

  // Check on app resume
  useEffect(() => {
    if (!enabled) return;

    const listener = App.addListener('appStateChange', (state) => {
      if (state.isActive) {
        // Reset the check flag when app resumes so we detect new URLs
        checkClipboard();
      }
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, [enabled, checkClipboard]);

  return {
    detectedUrl,
    dismissDetection,
  };
}
