import { useState, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Smartphone, Bell, Share2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
import { triggerHaptic } from '@/lib/haptics';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { buildImageSources } from '@/lib/imageUtils';
import { formatContentInfo } from '@/lib/contentResolver';
import type { ContentSource } from '@/types/shortcut';

interface SharedFileActionSheetProps {
  file: ContentSource;
  onCreateShortcut: () => void;
  onCreateReminder: () => void;
  onDismiss: () => void;
  /** Hide "Remind Later" button (e.g. for slideshow shares) */
  hideReminder?: boolean;
  /** Override display name (e.g. "3 images" for slideshow) */
  displayName?: string;
  /** Override display subtitle */
  displaySubtitle?: string;
}

export function SharedFileActionSheet({
  file,
  onCreateShortcut,
  onCreateReminder,
  onDismiss,
  hideReminder = false,
  displayName,
  displaySubtitle,
}: SharedFileActionSheetProps) {
  const { t } = useTranslation();
  const [isExiting, setIsExiting] = useState(false);

  // Register sheet with back button handler
  useSheetBackHandler('shared-file-action-sheet', true, onDismiss);

  // Swipe-to-close gesture
  const touchStartY = useRef<number | null>(null);
  const touchCurrentY = useRef<number | null>(null);
  const SWIPE_CLOSE_THRESHOLD = 80;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchCurrentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (touchStartY.current !== null && touchCurrentY.current !== null) {
      const deltaY = touchCurrentY.current - touchStartY.current;
      if (deltaY > SWIPE_CLOSE_THRESHOLD) {
        triggerHaptic('light');
        handleDismiss();
      }
    }
    touchStartY.current = null;
    touchCurrentY.current = null;
  }, []);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 200);
  };

  const handleCreateShortcut = () => {
    setIsExiting(true);
    setTimeout(onCreateShortcut, 200);
  };

  const handleCreateReminder = () => {
    setIsExiting(true);
    setTimeout(onCreateReminder, 200);
  };

  const isImage = file.mimeType?.startsWith('image/');
  const isMultiImage = !!displayName && displayName.match(/^\d+ images?$/i);
  const info = formatContentInfo(file);

  // Build image sources for thumbnail preview
  const imageSources = useMemo(() => {
    if (!isImage || isMultiImage) return [];
    return buildImageSources(file.thumbnailData, file.uri);
  }, [isImage, isMultiImage, file.thumbnailData, file.uri]);

  const fileName = displayName || file.name || info.label;
  const fileSubtitle = displaySubtitle || info.sublabel;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pb-8 bg-black/50 animate-in fade-in duration-200">
      <div
        className={cn(
          "w-full max-w-sm landscape:max-w-lg bg-card rounded-2xl shadow-xl border border-border overflow-hidden",
          "animate-in slide-in-from-bottom-4 duration-300",
          isExiting && "animate-out fade-out slide-out-to-bottom-4 duration-200"
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Swipe indicator */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 landscape:px-3 py-3 landscape:py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 landscape:h-3.5 landscape:w-3.5 text-primary" />
            <span className="text-sm landscape:text-xs font-medium text-foreground">{t('sharedUrl.linkReceived', 'File received')}</span>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1.5 -me-1 rounded-full hover:bg-muted transition-colors"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* File Preview Card */}
        <div className="px-4 landscape:px-3 py-4 landscape:py-3 border-b border-border">
          <div className="flex items-center gap-3 landscape:gap-2">
            <div className={cn(
              "flex-shrink-0 w-12 h-12 landscape:w-10 landscape:h-10 rounded-lg overflow-hidden flex items-center justify-center",
              !isImage && "bg-primary/10"
            )}>
              {isMultiImage ? (
                /* Multi-image: stacked layers icon */
                <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                  <Layers className="h-6 w-6 landscape:h-5 landscape:w-5 text-primary" />
                </div>
              ) : isImage && imageSources.length > 0 ? (
                /* Single image: actual thumbnail */
                <ImageWithFallback
                  sources={imageSources}
                  fallback={<span className="text-2xl landscape:text-xl">{info.emoji}</span>}
                  alt=""
                  className="h-full w-full object-cover"
                  containerClassName="h-full w-full flex items-center justify-center"
                />
              ) : (
                /* Non-image file: emoji fallback */
                <span className="text-2xl landscape:text-xl">{info.emoji}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm landscape:text-xs font-medium text-foreground break-words">
                {fileName}
              </p>
              <p className="text-xs landscape:text-[10px] text-muted-foreground">
                {fileSubtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-4 landscape:px-3 py-4 landscape:py-3">
          <div className="flex gap-3 landscape:gap-2">
            {/* One Tap Access */}
            <Button
              className="flex-1 gap-2 landscape:h-9"
              onClick={handleCreateShortcut}
            >
              <Smartphone className="h-4 w-4 landscape:h-3.5 landscape:w-3.5" />
              <span className="landscape:text-xs">{t('sharedUrl.shortcut')}</span>
            </Button>

            {/* Remind Later */}
            {!hideReminder && (
              <Button
                variant="outline"
                className="flex-1 gap-2 landscape:h-9"
                onClick={handleCreateReminder}
              >
                <Bell className="h-4 w-4 landscape:h-3.5 landscape:w-3.5" />
                <span className="landscape:text-xs">{t('sharedUrl.remindLater')}</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
