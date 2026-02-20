import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, Type, Smile, X, ImageOff, Globe, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { triggerSelectionFeedback } from '@/lib/haptics';
import { Input } from '@/components/ui/input';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { PlatformIcon } from '@/components/PlatformIcon';
import { isValidImageSource, buildImageSources } from '@/lib/imageUtils';
import { detectPlatform, type PlatformInfo } from '@/lib/platformIcons';
import { getPlatformColor } from '@/lib/platformColors';
import type { ShortcutIcon, IconType } from '@/types/shortcut';

interface IconPickerProps {
  thumbnail?: string;
  platformIcon?: string; // Platform icon key from platformIcons.ts (e.g., 'youtube', 'netflix')
  faviconUrl?: string; // Favicon URL for unrecognized URLs
  selectedIcon: ShortcutIcon;
  onSelect: (icon: ShortcutIcon) => void;
}

// Streamlined emoji list - file types and generic icons (platform-specific removed)
const COMMON_EMOJIS = [
  // File types (primary use case for emoji mode)
  '🖼️', '📄', '📑', '📊', '📽️', '📝', '📃', '📁',
  // Actions/categories
  '⭐', '❤️', '🔥', '💡', '🎯', '🚀', '📱', '🏠',
  // Misc useful
  '🎨', '💻', '📦', '📚', '⚙️', '🔔', '📍', '🔗',
];

export function IconPicker({ thumbnail, platformIcon, faviconUrl, selectedIcon, onSelect }: IconPickerProps) {
  const { t } = useTranslation();
  const [textValue, setTextValue] = useState(
    selectedIcon.type === 'text' ? selectedIcon.value : ''
  );
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUserScrolling = useRef(true);
  
  // Collapse by default for recognized platforms (auto-detected icon)
  const [isExpanded, setIsExpanded] = useState(!platformIcon);
  
  // Validate thumbnail before showing thumbnail option
  const validThumbnail = useMemo(() => 
    thumbnail && isValidImageSource(thumbnail) ? thumbnail : null,
  [thumbnail]);
  
  // Get platform info for rendering
  const platformInfo = useMemo(() => 
    platformIcon ? detectPlatform(`https://${platformIcon}.com`) : null,
  [platformIcon]);
  
  // Build image sources for the thumbnail preview
  const thumbnailSources = useMemo(() => 
    buildImageSources(selectedIcon.type === 'thumbnail' ? selectedIcon.value : null, validThumbnail),
  [selectedIcon.type, selectedIcon.value, validThumbnail]);
  
  // Reset thumbnail failed state when thumbnail changes
  useEffect(() => {
    setThumbnailFailed(false);
  }, [thumbnail]);

  // Scroll to selected emoji when switching to emoji type or on selection
  useEffect(() => {
    if (!scrollContainerRef.current || selectedIcon.type !== 'emoji') return;
    
    const index = COMMON_EMOJIS.indexOf(selectedIcon.value);
    if (index < 0) return;
    
    isUserScrolling.current = false;
    
    const container = scrollContainerRef.current;
    const buttons = container.querySelectorAll('button');
    const targetButton = buttons[index] as HTMLElement;
    
    if (targetButton) {
      const buttonCenter = targetButton.offsetLeft + targetButton.offsetWidth / 2;
      const scrollPosition = buttonCenter - container.clientWidth / 2;
      container.scrollTo({ left: scrollPosition, behavior: 'smooth' });
    }
    
    // Reset flag after scroll animation completes
    const timer = setTimeout(() => {
      isUserScrolling.current = true;
    }, 400);
    
    return () => clearTimeout(timer);
  }, [selectedIcon.type, selectedIcon.value]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Handle scroll to detect centered emoji and auto-select
  const handleScroll = useCallback(() => {
    if (!isUserScrolling.current || !scrollContainerRef.current) return;
    
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      if (!scrollContainerRef.current) return;
      
      const container = scrollContainerRef.current;
      const containerCenter = container.scrollLeft + container.clientWidth / 2;
      
      // Find which button is closest to center
      const buttons = container.querySelectorAll('button');
      let closestIndex = 0;
      let closestDistance = Infinity;
      
      buttons.forEach((button, index) => {
        const buttonCenter = (button as HTMLElement).offsetLeft + button.clientWidth / 2;
        const distance = Math.abs(containerCenter - buttonCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
      
      const centeredEmoji = COMMON_EMOJIS[closestIndex];
      if (centeredEmoji && centeredEmoji !== selectedIcon.value) {
        triggerSelectionFeedback();
        onSelect({ type: 'emoji', value: centeredEmoji });
      }
    }, 100);
  }, [selectedIcon.value, onSelect]);

  // Build icon types array with platform/favicon option when available
  const iconTypes: { type: IconType; icon: React.ReactNode; label: string }[] = [
    // Platform icon option - shown first when available
    ...(platformIcon && platformInfo ? [{ 
      type: 'platform' as IconType, 
      icon: <Globe className="h-5 w-5" />, 
      label: platformInfo.name 
    }] : []),
    // Favicon option - shown for unrecognized URLs when favicon is available
    ...(faviconUrl && !platformIcon ? [{ 
      type: 'favicon' as IconType, 
      icon: <Globe className="h-5 w-5" />, 
      label: t('iconPicker.website') 
    }] : []),
    // Thumbnail option
    ...(validThumbnail && !thumbnailFailed ? [{ 
      type: 'thumbnail' as IconType, 
      icon: <ImageIcon className="h-5 w-5" />, 
      label: t('iconPicker.image') 
    }] : []),
    // Emoji option
    { type: 'emoji', icon: <Smile className="h-5 w-5" />, label: t('iconPicker.emoji') },
    // Text option
    { type: 'text', icon: <Type className="h-5 w-5" />, label: t('iconPicker.text') },
  ];

  // For recognized platforms, show a compact collapsed state with expand option
  const hasAutoDetectedIcon = !!(platformIcon && platformInfo);

  return (
    <div className="space-y-3 landscape:space-y-2">
      {/* Collapsed state for recognized platforms - shows auto-detected badge */}
      <AnimatePresence mode="wait">
        {hasAutoDetectedIcon && !isExpanded && (
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={() => setIsExpanded(true)}
            className="w-full flex items-center justify-between gap-3 landscape:gap-2 px-4 py-3 landscape:px-3 landscape:py-2 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-left"
          >
            <div className="flex items-center gap-3 landscape:gap-2">
              {/* Mini platform icon preview */}
              <div className="h-10 w-10 landscape:h-8 landscape:w-8 rounded-xl landscape:rounded-lg overflow-hidden">
                <PlatformIcon platform={platformInfo} size="md" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{t('iconPicker.icon')}</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Check className="h-3 w-3 text-primary" />
                  {t('iconPicker.autoDetected', { platform: platformInfo.name })}
                </span>
              </div>
            </div>
            <motion.div
              animate={{ rotate: 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </motion.div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Expanded state header for recognized platforms */}
      {hasAutoDetectedIcon && isExpanded && (
        <button 
          onClick={() => setIsExpanded(false)}
          className="w-full flex items-center justify-between gap-2 py-1 text-left"
        >
          <p className="text-sm font-medium text-foreground">{t('iconPicker.icon')}</p>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            {t('iconPicker.collapse')}
            <motion.div
              animate={{ rotate: 180 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-3 w-3" />
            </motion.div>
          </span>
        </button>
      )}


      <AnimatePresence>
        {(isExpanded || !hasAutoDetectedIcon) && (
          <motion.div
            initial={hasAutoDetectedIcon ? { opacity: 0, height: 0 } : false}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="space-y-4 landscape:space-y-2 overflow-hidden"
          >
          {/* Icon type selector */}
          <div className="flex gap-2 landscape:gap-1.5 pt-2 landscape:pt-1 flex-wrap">
            {iconTypes.map(({ type, icon, label }) => (
              <button
                key={type}
                onClick={() => {
                  if (type === 'platform' && platformIcon) {
                    onSelect({ type: 'platform', value: platformIcon });
                  } else if (type === 'favicon' && faviconUrl) {
                    onSelect({ type: 'favicon', value: faviconUrl });
                  } else if (type === 'thumbnail' && thumbnail) {
                    onSelect({ type: 'thumbnail', value: thumbnail });
                  } else if (type === 'emoji') {
                    onSelect({ type: 'emoji', value: COMMON_EMOJIS[0] });
                  } else if (type === 'text') {
                    onSelect({ type: 'text', value: textValue || 'A' });
                  }
                }}
                className={cn(
                  "flex items-center gap-2 landscape:gap-1.5 px-4 py-2 landscape:px-3 landscape:py-1.5 rounded-full text-sm landscape:text-xs font-medium transition-colors",
                  selectedIcon.type === type
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                )}
              >
                <span className="[&>svg]:h-5 [&>svg]:w-5 landscape:[&>svg]:h-4 landscape:[&>svg]:w-4">{icon}</span>
                {label}
              </button>
            ))}
          </div>
          
          {/* Icon preview - for platform, favicon, thumbnail, and text types */}
          {selectedIcon.type !== 'emoji' && selectedIcon.type !== 'text' && (
            <div 
              key={`preview-${selectedIcon.type}`}
              className="flex justify-center py-4 landscape:py-2 animate-fade-in"
            >
              <div
                className={cn(
                  "h-16 w-16 landscape:h-12 landscape:w-12 rounded-2xl landscape:rounded-xl flex items-center justify-center elevation-2 overflow-hidden",
                  selectedIcon.type === 'thumbnail' ? 'p-0 bg-primary' : '',
                  selectedIcon.type === 'favicon' ? 'bg-white dark:bg-gray-100 shadow-sm' : '',
                )}
              >
                {selectedIcon.type === 'platform' && platformInfo && (
                  <PlatformIcon platform={platformInfo} size="lg" />
                )}
                {selectedIcon.type === 'favicon' && (
                  <img 
                    src={selectedIcon.value} 
                    alt="Website icon" 
                    className="h-[70%] w-[70%] object-contain"
                  />
                )}
                {selectedIcon.type === 'thumbnail' && thumbnailSources.length > 0 && (
                  <ImageWithFallback
                    sources={thumbnailSources}
                    fallback={<ImageOff className="h-6 w-6 text-primary-foreground/50" />}
                    alt="Icon preview"
                    className="h-full w-full object-cover"
                    containerClassName="h-full w-full flex items-center justify-center"
                    onAllFailed={() => setThumbnailFailed(true)}
                    showSkeleton={false}
                  />
                )}
                {selectedIcon.type === 'thumbnail' && thumbnailSources.length === 0 && (
                  <ImageOff className="h-6 w-6 text-primary-foreground/50" />
                )}
              </div>
            </div>
          )}
          
          {/* Emoji picker - native horizontal scroll */}
          {selectedIcon.type === 'emoji' && (
            <div 
              key="emoji-scroll"
              className="py-4 landscape:py-2 animate-fade-in relative"
            >
              {/* Left fade gradient */}
              <div className="absolute left-0 top-0 bottom-0 w-12 landscape:w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
              
              {/* Right fade gradient */}
              <div className="absolute right-0 top-0 bottom-0 w-12 landscape:w-8 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
              
              <div 
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex gap-2 landscape:gap-1.5 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-[calc(50%-28px)] landscape:px-[calc(50%-22px)]"
              >
                {COMMON_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => onSelect({ type: 'emoji', value: emoji })}
                    className={cn(
                      "h-14 w-14 landscape:h-11 landscape:w-11 shrink-0 rounded-xl landscape:rounded-lg text-2xl landscape:text-xl flex items-center justify-center transition-all duration-200 snap-center",
                      selectedIcon.value === emoji
                        ? "scale-110 bg-primary/15 ring-2 ring-primary"
                        : "scale-90 opacity-50 bg-secondary hover:opacity-75"
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {selectedIcon.type === 'text' && (
            <div key="text-input" className="animate-fade-in relative">
              <Input
                value={textValue}
                onChange={(e) => {
                  const value = e.target.value.slice(0, 2);
                  setTextValue(value);
                  onSelect({ type: 'text', value: value || 'A' });
                }}
                placeholder={t('iconPicker.textPlaceholder')}
                maxLength={2}
                className="text-center text-lg landscape:text-base font-medium h-12 landscape:h-10 pr-10"
              />
              {textValue && (
                <button
                  type="button"
                  onClick={() => {
                    setTextValue('');
                    onSelect({ type: 'text', value: 'A' });
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                  aria-label={t('common.clearText')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
