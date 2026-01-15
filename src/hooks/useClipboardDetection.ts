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
  try {
    // Try Capacitor clipboard first
    const { value } = await CapClipboard.read();
    if (value) {
      // Check if it's a valid URL
      if (isValidUrl(value)) {
        return value;
      }
      // Try adding https prefix
      const withProtocol = value.startsWith('http') ? value : `https://${value}`;
      if (isValidUrl(withProtocol)) {
        return withProtocol;
      }
    }
  } catch {
    // Fallback to web clipboard API
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        if (isValidUrl(text)) {
          return text;
        }
        const withProtocol = text.startsWith('http') ? text : `https://${text}`;
        if (isValidUrl(withProtocol)) {
          return withProtocol;
        }
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
