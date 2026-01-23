import { useRef, useCallback } from 'react';
import { triggerHaptic } from '@/lib/haptics';

interface SwipeConfig {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number; // minimum swipe distance
  velocityThreshold?: number; // minimum velocity for quick swipes
  enabled?: boolean;
}

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  threshold = 80,
  velocityThreshold = 0.3,
  enabled = true,
}: SwipeConfig): SwipeHandlers {
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const currentX = useRef(0);
  const isHorizontalSwipe = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;
    
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    currentX.current = touch.clientX;
    startTime.current = Date.now();
    isHorizontalSwipe.current = false;
  }, [enabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;
    
    const touch = e.touches[0];
    currentX.current = touch.clientX;
    
    // Determine if this is a horizontal swipe (after some movement)
    const deltaX = Math.abs(touch.clientX - startX.current);
    const deltaY = Math.abs(touch.clientY - startY.current);
    
    // If horizontal movement is greater than vertical, it's a horizontal swipe
    if (deltaX > 10 && deltaX > deltaY * 1.5) {
      isHorizontalSwipe.current = true;
    }
  }, [enabled]);

  const handleTouchEnd = useCallback(() => {
    if (!enabled || !isHorizontalSwipe.current) return;
    
    const deltaX = currentX.current - startX.current;
    const deltaTime = Date.now() - startTime.current;
    const velocity = Math.abs(deltaX) / deltaTime; // pixels per ms
    
    // Check if swipe meets threshold (distance OR velocity)
    const meetsDistanceThreshold = Math.abs(deltaX) >= threshold;
    const meetsVelocityThreshold = velocity >= velocityThreshold && Math.abs(deltaX) >= threshold / 2;
    
    if (meetsDistanceThreshold || meetsVelocityThreshold) {
      if (deltaX < 0 && onSwipeLeft) {
        // Swipe left -> go to next tab
        triggerHaptic('light');
        onSwipeLeft();
      } else if (deltaX > 0 && onSwipeRight) {
        // Swipe right -> go to previous tab
        triggerHaptic('light');
        onSwipeRight();
      }
    }
    
    // Reset
    isHorizontalSwipe.current = false;
  }, [enabled, threshold, velocityThreshold, onSwipeLeft, onSwipeRight]);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}
