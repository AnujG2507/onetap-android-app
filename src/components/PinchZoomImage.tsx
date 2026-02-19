import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface PinchZoomImageProps {
  src: string;
  alt: string;
  showLoading?: boolean;
  onLoad?: () => void;
  onError?: () => void;
  onTap?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeDown?: () => void;
  onZoomChange?: (isZoomed: boolean) => void;
}

// Use refs to avoid stale closure issues in setTimeout callbacks
const useLatestCallback = <T extends (...args: any[]) => any>(callback: T | undefined) => {
  const ref = useRef(callback);
  useEffect(() => {
    ref.current = callback;
  }, [callback]);
  return ref;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const SWIPE_THRESHOLD = 50;
const DOUBLE_TAP_DELAY = 300;

export default function PinchZoomImage({
  src,
  alt,
  showLoading = false,
  onLoad,
  onError,
  onTap,
  onSwipeLeft,
  onSwipeRight,
  onSwipeDown,
  onZoomChange,
}: PinchZoomImageProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isZoomed, setIsZoomed] = useState(false);
  
  // Use refs for callbacks to avoid stale closures in setTimeout
  const onTapRef = useLatestCallback(onTap);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const lastTapRef = useRef<number>(0);
  const initialPinchDistanceRef = useRef<number | null>(null);
  const initialScaleRef = useRef<number>(1);
  const startPosRef = useRef({ x: 0, y: 0 });
  const lastPosRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);

  // Reset zoom when image changes
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsZoomed(false);
  }, [src]);

  // Notify parent when zoom state changes
  useEffect(() => {
    onZoomChange?.(isZoomed);
  }, [isZoomed, onZoomChange]);

  // Calculate distance between two touch points
  const getDistance = (touch1: React.Touch, touch2: React.Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Get center point between two touches
  const getCenter = (touch1: React.Touch, touch2: React.Touch): { x: number; y: number } => {
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2,
    };
  };

  // Constrain position to keep image within bounds
  const constrainPosition = useCallback((x: number, y: number, currentScale: number) => {
    if (currentScale <= 1) return { x: 0, y: 0 };
    
    const container = containerRef.current;
    const image = imageRef.current;
    if (!container || !image) return { x, y };

    const containerRect = container.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    
    // Calculate how much the scaled image extends beyond the container
    const scaledWidth = image.naturalWidth * currentScale;
    const scaledHeight = image.naturalHeight * currentScale;
    
    // Calculate max pan distance
    const maxX = Math.max(0, (scaledWidth - containerRect.width) / 2);
    const maxY = Math.max(0, (scaledHeight - containerRect.height) / 2);

    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, []);

  // Handle double tap to zoom
  const handleDoubleTap = useCallback((clientX: number, clientY: number) => {
    if (isZoomed) {
      // Zoom out
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setIsZoomed(false);
    } else {
      // Zoom in centered on tap point
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const offsetX = (centerX - clientX) * (DOUBLE_TAP_SCALE - 1);
        const offsetY = (centerY - clientY) * (DOUBLE_TAP_SCALE - 1);
        
        const constrained = constrainPosition(offsetX, offsetY, DOUBLE_TAP_SCALE);
        setPosition(constrained);
      }
      setScale(DOUBLE_TAP_SCALE);
      setIsZoomed(true);
    }
  }, [isZoomed, constrainPosition]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touches = e.touches;
    if (touches.length === 2) {
      // Pinch start
      initialPinchDistanceRef.current = getDistance(touches[0], touches[1]);
      initialScaleRef.current = scale;
      e.preventDefault();
    } else if (touches.length === 1) {
      // Single touch - check for double tap or start pan
      const now = Date.now();
      const timeSinceLastTap = now - lastTapRef.current;
      
      startPosRef.current = {
        x: touches[0].clientX,
        y: touches[0].clientY,
      };
      lastPosRef.current = { ...position };
      isPanningRef.current = false;
      
      if (timeSinceLastTap < DOUBLE_TAP_DELAY) {
        handleDoubleTap(touches[0].clientX, touches[0].clientY);
        lastTapRef.current = 0;
        e.preventDefault();
      } else {
        lastTapRef.current = now;
      }
    }
  }, [scale, position, isZoomed, handleDoubleTap]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touches = e.touches;
    if (touches.length === 2 && initialPinchDistanceRef.current !== null) {
      // Pinch zoom
      const currentDistance = getDistance(touches[0], touches[1]);
      const scaleChange = currentDistance / initialPinchDistanceRef.current;
      let newScale = initialScaleRef.current * scaleChange;
      newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
      
      setScale(newScale);
      setIsZoomed(newScale > 1);
      
      // Adjust position to zoom toward pinch center
      if (newScale <= 1) {
        setPosition({ x: 0, y: 0 });
      }
      
      e.preventDefault();
    } else if (touches.length === 1 && scale > 1) {
      // Pan when zoomed
      const deltaX = touches[0].clientX - startPosRef.current.x;
      const deltaY = touches[0].clientY - startPosRef.current.y;
      
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        isPanningRef.current = true;
      }
      
      const newX = lastPosRef.current.x + deltaX;
      const newY = lastPosRef.current.y + deltaY;
      const constrained = constrainPosition(newX, newY, scale);
      
      setPosition(constrained);
      e.preventDefault();
    }
  }, [scale, constrainPosition]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (initialPinchDistanceRef.current !== null) {
      initialPinchDistanceRef.current = null;
      
      // Snap to min scale if close
      if (scale < 1.1) {
        setScale(1);
        setPosition({ x: 0, y: 0 });
        setIsZoomed(false);
      }
      return;
    }
    
    // Handle swipe gestures when not zoomed
    if (scale <= 1 && !isPanningRef.current && e.changedTouches.length === 1) {
      const deltaX = e.changedTouches[0].clientX - startPosRef.current.x;
      const deltaY = e.changedTouches[0].clientY - startPosRef.current.y;
      
      // Detect swipe direction
      if (Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX > 0) {
          onSwipeRight?.();
        } else {
          onSwipeLeft?.();
        }
      } else if (deltaY > SWIPE_THRESHOLD && Math.abs(deltaY) > Math.abs(deltaX)) {
        onSwipeDown?.();
      } else if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
        // Simple tap detected - use timeout to differentiate from double-tap
        const tapTime = lastTapRef.current;
        setTimeout(() => {
          // Only fire tap if no second tap occurred (not a double-tap)
          // Use ref to get the latest callback, avoiding stale closure
          if (lastTapRef.current === tapTime) {
            onTapRef.current?.();
          }
        }, DOUBLE_TAP_DELAY + 50);
      }
    }
    
    isPanningRef.current = false;
  }, [scale, onSwipeLeft, onSwipeRight, onSwipeDown, onTapRef]);

  // Mouse wheel zoom for desktop
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    let newScale = scale + delta;
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    
    setScale(newScale);
    setIsZoomed(newScale > 1);
    
    if (newScale <= 1) {
      setPosition({ x: 0, y: 0 });
    } else {
      const constrained = constrainPosition(position.x, position.y, newScale);
      setPosition(constrained);
    }
  }, [scale, position, constrainPosition]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center overflow-hidden touch-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* Loading indicator */}
      {showLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <Loader2 className="h-8 w-8 text-white animate-spin" />
        </div>
      )}
      
      <motion.img
        ref={imageRef}
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain select-none"
        style={{
          touchAction: 'none',
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transformOrigin: 'center center',
        }}
        animate={{
          scale: scale,
          x: position.x,
          y: position.y,
        }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 30,
        }}
        onLoad={onLoad}
        onError={onError}
        draggable={false}
      />
      
      {/* Zoom indicator */}
      {isZoomed && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-2 py-1 rounded-full pointer-events-none">
          {Math.round(scale * 100)}%
        </div>
      )}
    </div>
  );
}
