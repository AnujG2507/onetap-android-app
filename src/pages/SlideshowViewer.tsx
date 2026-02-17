import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ExternalLink, Share2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShortcuts } from '@/hooks/useShortcuts';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { motion, AnimatePresence } from 'framer-motion';
import PinchZoomImage from '@/components/PinchZoomImage';

const CONTROLS_AUTO_HIDE_MS = 3000;

export default function SlideshowViewer() {
  const { shortcutId } = useParams<{ shortcutId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getShortcut } = useShortcuts();
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [autoAdvanceInterval, setAutoAdvanceInterval] = useState(0);
  const [title, setTitle] = useState('Slideshow');
  const [isLoading, setIsLoading] = useState(true);
  
  // Full-quality image URLs converted for WebView display
  const [convertedUrls, setConvertedUrls] = useState<Map<number, string>>(new Map());
  const [imageLoadStates, setImageLoadStates] = useState<Map<number, 'loading' | 'ready' | 'error'>>(new Map());
  
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoAdvanceRef = useRef<NodeJS.Timeout | null>(null);

  // Load shortcut data - try hook first, fallback to direct localStorage read
  useEffect(() => {
    if (!shortcutId) {
      setIsLoading(false);
      return;
    }
    
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
      
      // Usage is tracked by native SlideshowProxyActivity - no need to track here
    } else if (shortcut && shortcut.type === 'file' && shortcut.fileType === 'image') {
      // Single image file shortcut - treat as one-image slideshow
      setImages([shortcut.contentUri]);
      setThumbnails(shortcut.thumbnailData ? [shortcut.thumbnailData] : []);
      setTitle(shortcut.name);
    }
    
    setIsLoading(false);
  }, [shortcutId, getShortcut]);

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
    // Toggle play/pause on tap
    if (autoAdvanceInterval > 0) {
      setIsPlaying(prev => !prev);
    }
    
    // Toggle controls visibility
    if (showControls) {
      setShowControls(false);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    } else {
      resetControlsTimeout();
    }
  }, [showControls, resetControlsTimeout, autoAdvanceInterval]);

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

  const handleSwipeDown = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Pause slideshow when zooming in
  const handleZoomChange = useCallback((isZoomed: boolean) => {
    if (isZoomed && isPlaying) {
      setIsPlaying(false);
    }
  }, [isPlaying]);

  const handleShare = useCallback(async () => {
    const currentImage = images[currentIndex];
    if (!currentImage) return;
    try {
      await Share.share({
        title: title,
        url: currentImage,
        dialogTitle: 'Share image...',
      });
    } catch (error) {
      console.log('[SlideshowViewer] Share cancelled or failed:', error);
    }
  }, [images, currentIndex, title]);

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


  // Get current image source (prioritize full-quality, fallback to thumbnail)
  const currentImageSrc = getImageSource(currentIndex);
  const currentLoadState = imageLoadStates.get(currentIndex) || 'loading';
  const showLoadingIndicator = currentLoadState === 'loading' && Capacitor.isNativePlatform();

  // Loading skeleton state
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        {/* Pulsing skeleton for loading state */}
        <div className="w-full h-full relative">
          {/* Image skeleton */}
          <div className="absolute inset-0 bg-muted/20 animate-pulse" />
          
          {/* Top bar skeleton */}
          <div className="absolute top-0 left-0 right-0 p-4 pt-safe bg-gradient-to-b from-black/60 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full animate-pulse" />
                <div className="w-24 h-5 bg-white/20 rounded animate-pulse" />
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-7 bg-white/20 rounded-full animate-pulse" />
                <div className="w-10 h-10 bg-white/20 rounded-full animate-pulse" />
              </div>
            </div>
          </div>
          
          {/* Bottom bar skeleton */}
          <div className="absolute bottom-0 left-0 right-0 p-4 pb-safe bg-gradient-to-t from-black/60 to-transparent">
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-4 bg-white/20 rounded animate-pulse" />
              <div className="flex items-center gap-1.5">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="w-2 h-2 bg-white/20 rounded-full animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <p className="text-lg">{t('slideshow.notFound')}</p>
          <Button variant="ghost" onClick={handleClose} className="mt-4 text-white">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.back')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black select-none">
      {/* Main image area with pinch-zoom */}
      <div className="absolute inset-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full"
          >
            <PinchZoomImage
              src={currentImageSrc}
              alt={`Image ${currentIndex + 1}`}
              showLoading={showLoadingIndicator}
              onLoad={() => handleImageLoad(currentIndex)}
              onError={() => handleImageError(currentIndex)}
              onTap={handleTap}
              onSwipeLeft={handleNext}
              onSwipeRight={handlePrevious}
              onSwipeDown={handleSwipeDown}
              onZoomChange={handleZoomChange}
            />
          </motion.div>
        </AnimatePresence>
      </div>

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
              className="absolute top-0 left-0 right-0 px-4 pb-4 pt-header-safe bg-gradient-to-b from-black/60 to-transparent"
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
                  
                  {/* Share */}
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={handleShare}
                    className="text-white hover:bg-white/20"
                  >
                    <Share2 className="h-5 w-5" />
                  </Button>
                  
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
              <div className="flex flex-col items-center gap-2">
                {/* Play/Pause status indicator (only show if auto-advance is configured) */}
                {autoAdvanceInterval > 0 && (
                  <span className={`text-white/60 text-xs ${!isPlaying ? 'animate-pulse' : ''}`}>
                    {isPlaying ? t('slideshow.playing') : t('slideshow.paused')}
                  </span>
                )}
                
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
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
