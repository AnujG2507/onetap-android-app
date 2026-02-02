import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ExternalLink, Play, Pause, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShortcuts } from '@/hooks/useShortcuts';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import { Capacitor } from '@capacitor/core';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';

const SWIPE_THRESHOLD = 50;
const CONTROLS_AUTO_HIDE_MS = 3000;

export default function SlideshowViewer() {
  const { shortcutId } = useParams<{ shortcutId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getShortcut, incrementUsage } = useShortcuts();
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [autoAdvanceInterval, setAutoAdvanceInterval] = useState(0);
  const [title, setTitle] = useState('Slideshow');
  
  // Full-quality image URLs converted for WebView display
  const [convertedUrls, setConvertedUrls] = useState<Map<number, string>>(new Map());
  const [imageLoadStates, setImageLoadStates] = useState<Map<number, 'loading' | 'ready' | 'error'>>(new Map());
  
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoAdvanceRef = useRef<NodeJS.Timeout | null>(null);

  // Load shortcut data - try hook first, fallback to direct localStorage read
  useEffect(() => {
    if (!shortcutId) return;
    
    // Try to get from hook state first
    let shortcut = getShortcut(shortcutId);
    
    // Fallback: read directly from localStorage (handles deep link navigation)
    if (!shortcut) {
      try {
        const stored = localStorage.getItem('quicklaunch_shortcuts');
        if (stored) {
          const allShortcuts = JSON.parse(stored);
          shortcut = allShortcuts.find((s: { id: string; type: string }) => s.id === shortcutId);
        }
      } catch (e) {
        console.error('[SlideshowViewer] Failed to read from localStorage:', e);
      }
    }
    
    if (shortcut && shortcut.type === 'slideshow') {
      setImages(shortcut.imageUris || []);
      setThumbnails(shortcut.imageThumbnails || []);
      setAutoAdvanceInterval(shortcut.autoAdvanceInterval || 0);
      setTitle(shortcut.name);
      
      // Set initial playing state based on auto-advance setting
      if (shortcut.autoAdvanceInterval && shortcut.autoAdvanceInterval > 0) {
        setIsPlaying(true);
      }
      
      // Increment usage on view
      incrementUsage(shortcutId);
    }
  }, [shortcutId, getShortcut, incrementUsage]);

  // Convert content:// URIs to WebView-accessible URLs for full-quality display
  useEffect(() => {
    if (images.length === 0) return;
    
    // Initialize loading states
    const initialStates = new Map<number, 'loading' | 'ready' | 'error'>();
    images.forEach((_, index) => initialStates.set(index, 'loading'));
    setImageLoadStates(initialStates);
    
    // Convert URIs on native platform
    if (Capacitor.isNativePlatform()) {
      const newConverted = new Map<number, string>();
      images.forEach((uri, index) => {
        if (uri.startsWith('content://') || uri.startsWith('file://')) {
          const converted = Capacitor.convertFileSrc(uri);
          newConverted.set(index, converted);
        } else if (uri.startsWith('http')) {
          // HTTP URLs can be used directly
          newConverted.set(index, uri);
        }
      });
      setConvertedUrls(newConverted);
    }
  }, [images]);

  // Get the best available image source for an index
  const getImageSource = useCallback((index: number): string => {
    // Priority 1: Converted full-quality URI (native platform)
    const converted = convertedUrls.get(index);
    if (converted) return converted;
    
    // Priority 2: Original URI (for web or HTTP sources)
    const original = images[index];
    if (original?.startsWith('http')) return original;
    if (original?.startsWith('data:')) return original;
    
    // Priority 3: Thumbnail as fallback
    const thumbnail = thumbnails[index];
    if (thumbnail) {
      return thumbnail.startsWith('data:') 
        ? thumbnail 
        : `data:image/jpeg;base64,${thumbnail}`;
    }
    
    return '';
  }, [convertedUrls, images, thumbnails]);

  // Handle image load success
  const handleImageLoad = useCallback((index: number) => {
    setImageLoadStates(prev => new Map(prev).set(index, 'ready'));
  }, []);

  // Handle image load error - fallback to thumbnail
  const handleImageError = useCallback((index: number) => {
    setImageLoadStates(prev => new Map(prev).set(index, 'error'));
  }, []);

  // Auto-hide controls
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, CONTROLS_AUTO_HIDE_MS);
  }, []);

  // Auto-advance logic
  useEffect(() => {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
    }

    if (isPlaying && autoAdvanceInterval > 0 && images.length > 1) {
      autoAdvanceRef.current = setTimeout(() => {
        setCurrentIndex(prev => (prev + 1) % images.length);
      }, autoAdvanceInterval * 1000);
    }

    return () => {
      if (autoAdvanceRef.current) {
        clearTimeout(autoAdvanceRef.current);
      }
    };
  }, [isPlaying, autoAdvanceInterval, images.length, currentIndex]);

  // Initialize controls timeout
  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [resetControlsTimeout]);

  const handleTap = useCallback(() => {
    if (showControls) {
      setShowControls(false);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    } else {
      resetControlsTimeout();
    }
  }, [showControls, resetControlsTimeout]);

  const handlePrevious = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + images.length) % images.length);
    resetControlsTimeout();
    // Pause auto-advance on manual navigation
    setIsPlaying(false);
  }, [images.length, resetControlsTimeout]);

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % images.length);
    resetControlsTimeout();
    // Pause auto-advance on manual navigation
    setIsPlaying(false);
  }, [images.length, resetControlsTimeout]);

  const handleSwipe = useCallback((_: never, info: PanInfo) => {
    if (Math.abs(info.offset.x) > SWIPE_THRESHOLD) {
      if (info.offset.x > 0) {
        handlePrevious();
      } else {
        handleNext();
      }
    } else if (info.offset.y < -SWIPE_THRESHOLD) {
      // Swipe up - no action currently
    } else if (info.offset.y > SWIPE_THRESHOLD) {
      // Swipe down - close viewer
      navigate(-1);
    }
  }, [handlePrevious, handleNext, navigate]);

  const handleOpenWith = useCallback(async () => {
    const currentImage = images[currentIndex];
    if (!currentImage) return;

    if (Capacitor.isNativePlatform()) {
      try {
        await ShortcutPlugin.openWithExternalApp({
          uri: currentImage,
          mimeType: 'image/*',
        });
      } catch (error) {
        console.error('[SlideshowViewer] Error opening with external app:', error);
      }
    } else {
      window.open(currentImage, '_blank');
    }
  }, [images, currentIndex]);

  const handleClose = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const togglePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
    resetControlsTimeout();
  }, [resetControlsTimeout]);

  // Get current image source (prioritize full-quality, fallback to thumbnail)
  const currentImageSrc = getImageSource(currentIndex);
  const currentLoadState = imageLoadStates.get(currentIndex) || 'loading';
  const showLoadingIndicator = currentLoadState === 'loading' && Capacitor.isNativePlatform();

  if (images.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <p className="text-lg">{t('slideshow.notFound', 'Slideshow not found')}</p>
          <Button variant="ghost" onClick={handleClose} className="mt-4 text-white">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.back', 'Back')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black select-none">
      {/* Main image area with gesture handling */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        onClick={handleTap}
        onPanEnd={handleSwipe}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full flex items-center justify-center relative"
          >
            {/* Loading indicator */}
            {showLoadingIndicator && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              </div>
            )}
            
            {/* Full-quality image */}
            <img
              src={currentImageSrc}
              alt={`Image ${currentIndex + 1}`}
              className="max-w-full max-h-full object-contain"
              onLoad={() => handleImageLoad(currentIndex)}
              onError={() => handleImageError(currentIndex)}
            />
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Controls overlay */}
      <AnimatePresence>
        {showControls && (
          <>
            {/* Top bar */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="absolute top-0 left-0 right-0 p-4 pt-safe bg-gradient-to-b from-black/60 to-transparent"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={handleClose}
                    className="text-white hover:bg-white/20"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <span className="text-white font-medium">{title}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Image counter */}
                  <span className="text-white/80 text-sm bg-black/40 px-3 py-1 rounded-full">
                    {currentIndex + 1} / {images.length}
                  </span>
                  
                  {/* Open with external app */}
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={handleOpenWith}
                    className="text-white hover:bg-white/20"
                  >
                    <ExternalLink className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </motion.div>

            {/* Navigation arrows (sides) */}
            {images.length > 1 && (
              <>
                <motion.button
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 rounded-full text-white hover:bg-black/60 transition-colors"
                  onClick={(e) => { e.stopPropagation(); handlePrevious(); }}
                >
                  <ChevronLeft className="h-6 w-6" />
                </motion.button>
                
                <motion.button
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 rounded-full text-white hover:bg-black/60 transition-colors"
                  onClick={(e) => { e.stopPropagation(); handleNext(); }}
                >
                  <ChevronRight className="h-6 w-6" />
                </motion.button>
              </>
            )}

            {/* Bottom bar with dots and play/pause */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-0 left-0 right-0 p-4 pb-safe bg-gradient-to-t from-black/60 to-transparent"
            >
              <div className="flex items-center justify-center gap-4">
                {/* Dot indicators (max 10 visible) */}
                <div className="flex items-center gap-1.5">
                  {images.slice(0, 10).map((_, index) => (
                    <button
                      key={index}
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setCurrentIndex(index);
                        setIsPlaying(false);
                        resetControlsTimeout();
                      }}
                      className={`w-2 h-2 rounded-full transition-all ${
                        index === currentIndex 
                          ? 'bg-white w-4' 
                          : 'bg-white/50 hover:bg-white/80'
                      }`}
                    />
                  ))}
                  {images.length > 10 && (
                    <span className="text-white/60 text-xs ml-1">+{images.length - 10}</span>
                  )}
                </div>

                {/* Play/Pause button (only show if auto-advance is configured) */}
                {autoAdvanceInterval > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); togglePlayPause(); }}
                    className="text-white hover:bg-white/20 ml-4"
                  >
                    {isPlaying ? (
                      <Pause className="h-5 w-5" />
                    ) : (
                      <Play className="h-5 w-5" />
                    )}
                  </Button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
