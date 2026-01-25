import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '@/i18n';

/**
 * Hook to detect and respond to RTL (Right-to-Left) language direction.
 * Provides utilities for handling RTL-aware swipe gestures and positioning.
 */
export function useRTL() {
  const { i18n } = useTranslation();
  const [isRTL, setIsRTL] = useState(false);

  useEffect(() => {
    // Check if current language is RTL
    const currentLangCode = i18n.language?.split('-')[0] || 'en';
    const currentLang = supportedLanguages.find(l => l.code === currentLangCode);
    const rtl = currentLang?.rtl || false;
    
    setIsRTL(rtl);
    
    // Also ensure document direction is set correctly
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  }, [i18n.language]);

  /**
   * Returns the correct swipe direction multiplier for RTL.
   * In RTL, "swipe left to delete" becomes "swipe right to delete".
   */
  const swipeMultiplier = isRTL ? -1 : 1;

  /**
   * Normalizes a horizontal delta for RTL.
   * Positive delta always means "towards end" (right in LTR, left in RTL).
   */
  const normalizeSwipeDelta = (deltaX: number): number => {
    return deltaX * swipeMultiplier;
  };

  /**
   * Returns the menu side that should slide in from.
   * In LTR: right side. In RTL: left side.
   */
  const menuSide = isRTL ? 'left' : 'right';

  /**
   * Returns the correct swipe close direction.
   * In LTR: swipe right closes right-side menu.
   * In RTL: swipe left closes left-side menu.
   */
  const shouldCloseOnSwipe = (deltaX: number): boolean => {
    if (isRTL) {
      return deltaX < -50; // Swipe left to close in RTL
    }
    return deltaX > 50; // Swipe right to close in LTR
  };

  /**
   * Gets the appropriate delete swipe direction check.
   * Returns true if the swipe indicates a delete action.
   */
  const isDeleteSwipe = (deltaX: number): boolean => {
    if (isRTL) {
      return deltaX > 0; // Swipe right to delete in RTL
    }
    return deltaX < 0; // Swipe left to delete in LTR
  };

  /**
   * Gets the transform value for swipe-to-delete, respecting RTL.
   */
  const getSwipeTransform = (deltaX: number, maxSwipe: number): number => {
    if (isRTL) {
      return Math.min(Math.max(deltaX * 0.5, 0), maxSwipe);
    }
    return Math.max(Math.min(deltaX * 0.5, 0), -maxSwipe);
  };

  return {
    isRTL,
    swipeMultiplier,
    normalizeSwipeDelta,
    menuSide,
    shouldCloseOnSwipe,
    isDeleteSwipe,
    getSwipeTransform,
  };
}

export type UseRTLReturn = ReturnType<typeof useRTL>;
