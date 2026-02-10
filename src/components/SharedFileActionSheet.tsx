import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Smartphone, Bell, Share2, Image, Video, Music, FileText, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
import { triggerHaptic } from '@/lib/haptics';
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

function getFileIcon(mimeType?: string) {
  if (!mimeType) return File;
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.startsWith('video/')) return Video;
  if (mimeType.startsWith('audio/')) return Music;
  if (mimeType === 'application/pdf') return FileText;
  return File;
}

function getFileTypeLabel(mimeType?: string): string {
  if (!mimeType) return 'File';
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.startsWith('video/')) return 'Video';
  if (mimeType.startsWith('audio/')) return 'Audio';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('application/')) return 'Document';
  return 'File';
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

  const FileIcon = getFileIcon(file.mimeType);
  const fileName = displayName || file.name || getFileTypeLabel(file.mimeType);
  const fileSubtitle = displaySubtitle || (file.mimeType ? getFileTypeLabel(file.mimeType) : 'File');

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
            <div className="flex-shrink-0 w-10 h-10 landscape:w-8 landscape:h-8 rounded-lg bg-muted flex items-center justify-center">
              <FileIcon className="h-5 w-5 landscape:h-4 landscape:w-4 text-muted-foreground" />
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
