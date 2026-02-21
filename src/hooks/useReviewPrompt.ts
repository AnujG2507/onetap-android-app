import { useState, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { openInAppBrowser } from '@/lib/inAppBrowser';

const FIRST_USE_KEY = 'onetap_first_use_date';
const REVIEW_DONE_KEY = 'onetap_review_prompt_done';
const JITTER_KEY = 'onetap_review_jitter_days';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=app.onetap.access';

const MIN_DAYS = 5;
const MAX_JITTER_DAYS = 2;
const EXPIRE_DAYS = 30;
const MIN_SHORTCUTS = 3;

function getDaysSince(dateStr: string): number {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return (now - then) / (1000 * 60 * 60 * 24);
}

function getStoredJitter(): number {
  try {
    const stored = localStorage.getItem(JITTER_KEY);
    if (stored !== null) return Number(stored);
    const jitter = Math.floor(Math.random() * (MAX_JITTER_DAYS + 1));
    localStorage.setItem(JITTER_KEY, String(jitter));
    return jitter;
  } catch {
    return 0;
  }
}

export function useReviewPrompt(shortcutCount: number) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only on native Android
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

    try {
      // Already done?
      if (localStorage.getItem(REVIEW_DONE_KEY) === 'true') return;

      const firstUse = localStorage.getItem(FIRST_USE_KEY);
      if (!firstUse) return;

      const days = getDaysSince(firstUse);
      const requiredDays = MIN_DAYS + getStoredJitter();

      // Expire silently after 30 days if not enough shortcuts
      if (days > EXPIRE_DAYS && shortcutCount < MIN_SHORTCUTS) {
        localStorage.setItem(REVIEW_DONE_KEY, 'true');
        return;
      }

      if (days >= requiredDays && shortcutCount >= MIN_SHORTCUTS) {
        setVisible(true);
      }
    } catch {
      // Ignore storage errors
    }
  }, [shortcutCount]);

  const markDone = useCallback(() => {
    try {
      localStorage.setItem(REVIEW_DONE_KEY, 'true');
      localStorage.removeItem(JITTER_KEY);
    } catch {
      // Ignore
    }
    setVisible(false);
  }, []);

  const dismiss = useCallback(() => {
    markDone();
  }, [markDone]);

  const openReview = useCallback(async () => {
    markDone();
    await openInAppBrowser(PLAY_STORE_URL);
  }, [markDone]);

  return {
    shouldShow: visible,
    dismiss,
    openReview,
  };
}
