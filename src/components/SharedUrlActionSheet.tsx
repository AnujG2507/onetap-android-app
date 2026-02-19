import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Bookmark, Smartphone, Share2, ChevronLeft, Play, Zap, Pencil, Check, WifiOff, Bell, Globe } from 'lucide-react';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useUrlMetadata } from '@/hooks/useUrlMetadata';
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { getAllFolders } from '@/lib/savedLinksManager';
import { detectPlatform } from '@/lib/platformIcons';
import { PlatformIcon } from '@/components/PlatformIcon';
import { triggerHaptic } from '@/lib/haptics';

interface SharedUrlActionSheetProps {
  url: string;
  onSaveToLibrary: (data?: { title?: string; description?: string; tag?: string | null }) => void;
  onCreateShortcut: (title?: string) => void;
  onCreateReminder: () => void;
  onDismiss: () => void;
}

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function SharedUrlActionSheet({
  url,
  onSaveToLibrary,
  onCreateShortcut,
  onCreateReminder,
  onDismiss,
}: SharedUrlActionSheetProps) {
  const { t } = useTranslation();
  const [isExiting, setIsExiting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [viewMode, setViewMode] = useState<'choose' | 'edit'>('choose');
  
  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTag, setEditTag] = useState<string | null>(null);
  
  const domain = extractDomain(url);
  const { isOnline } = useNetworkStatus();
  const { metadata, isLoading } = useUrlMetadata(url);
  const { thumbnailUrl, platform: videoPlatform, isLoading: thumbnailLoading } = useVideoThumbnail(url);
  const detectedPlatform = useMemo(() => detectPlatform(url), [url]);
  const folders = getAllFolders();

  // Register sheet with back button handler (always open when mounted)
  useSheetBackHandler('shared-url-action-sheet', true, onDismiss);

  // Swipe-to-close gesture tracking
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
      // Swipe down to close
      if (deltaY > SWIPE_CLOSE_THRESHOLD) {
        triggerHaptic('light');
        handleDismiss();
      }
    }
    touchStartY.current = null;
    touchCurrentY.current = null;
  }, []);

  // Pre-fill title when metadata loads
  useEffect(() => {
    if (metadata?.title && !editTitle) {
      setEditTitle(metadata.title);
    }
  }, [metadata?.title]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 200);
  };

  const handleSaveWithEdit = () => {
    // Transition to edit mode
    setViewMode('edit');
  };

  const handleQuickSave = () => {
    // Show success state first
    setShowSuccess(true);
    triggerHaptic('success');
    
    // Call save immediately
    onSaveToLibrary({
      title: metadata?.title || undefined,
      description: undefined,
      tag: null,
    });
    
    // Dismiss after showing success animation
    setTimeout(() => {
      setIsExiting(true);
      setTimeout(onDismiss, 200);
    }, 800);
  };

  const handleConfirmSave = () => {
    setIsExiting(true);
    setTimeout(() => {
      onSaveToLibrary({
        title: editTitle.trim() || undefined,
        description: editDescription.trim() || undefined,
        tag: editTag,
      });
    }, 200);
  };

  const handleCancelEdit = () => {
    setViewMode('choose');
  };

  const handleCreateShortcut = () => {
    setIsExiting(true);
    setTimeout(() => onCreateShortcut(metadata?.title || undefined), 200);
  };

  const handleCreateReminder = () => {
    setIsExiting(true);
    setTimeout(onCreateReminder, 200);
  };

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
        {/* Success State */}
        {showSuccess ? (
          <div className="px-4 py-12 landscape:py-8 flex flex-col items-center justify-center gap-3 landscape:gap-2">
            <div className="w-16 h-16 landscape:w-12 landscape:h-12 rounded-full bg-green-500/10 flex items-center justify-center animate-scale-in">
              <div className="w-12 h-12 landscape:w-9 landscape:h-9 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="h-6 w-6 landscape:h-5 landscape:w-5 text-white animate-fade-in" strokeWidth={3} />
              </div>
            </div>
            <p className="text-sm landscape:text-xs font-medium text-foreground animate-fade-in">{t('sharedUrl.savedToLibrary')}</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-4 landscape:px-3 py-3 landscape:py-2 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                {viewMode === 'edit' ? (
                  <>
                    <button
                      onClick={handleCancelEdit}
                      className="p-1 -ms-1 rounded-full hover:bg-muted transition-colors"
                      aria-label={t('common.back')}
                    >
                      <ChevronLeft className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
                    </button>
                    <span className="text-sm landscape:text-xs font-medium text-foreground">{t('sharedUrl.saveToLibrary')}</span>
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4 landscape:h-3.5 landscape:w-3.5 text-primary" />
                    <span className="text-sm landscape:text-xs font-medium text-foreground">{t('sharedUrl.linkReceived')}</span>
                  </>
                )}
              </div>
              <button
                onClick={handleDismiss}
                className="p-1.5 -me-1 rounded-full hover:bg-muted transition-colors"
                aria-label={t('common.close')}
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* Offline indicator */}
            {!isOnline && (
              <div className="flex items-center gap-2 px-4 landscape:px-3 py-2 landscape:py-1.5 bg-warning/10 border-b border-border">
                <WifiOff className="h-3.5 w-3.5 landscape:h-3 landscape:w-3 text-warning-foreground flex-shrink-0" />
                <span className="text-xs landscape:text-[10px] text-warning-foreground">{t('sharedUrl.offlineMode')}</span>
              </div>
            )}

        {/* URL Preview Card */}
        <div className="px-4 landscape:px-3 py-4 landscape:py-3 border-b border-border">
          {/* Video Thumbnail Preview */}
          {videoPlatform && (thumbnailUrl || thumbnailLoading) && (
            <div className="mb-3 landscape:mb-2">
              <div className="relative aspect-video landscape:aspect-[2/1] rounded-lg overflow-hidden bg-muted">
                {thumbnailLoading ? (
                  <Skeleton className="absolute inset-0" />
                ) : thumbnailUrl ? (
                  <ImageWithFallback
                    sources={[thumbnailUrl]}
                    fallback={
                      <div className="absolute inset-0 flex items-center justify-center bg-muted">
                        <Play className="h-10 w-10 text-muted-foreground" />
                      </div>
                    }
                    alt="Video thumbnail"
                    className="w-full h-full object-cover"
                    containerClassName="w-full h-full"
                    showSkeleton={false}
                  />
                ) : null}
                {/* Play button overlay - always visible */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className={cn(
                    "w-12 h-12 landscape:w-10 landscape:h-10 rounded-full flex items-center justify-center",
                    "bg-black/60 backdrop-blur-sm"
                  )}>
                    <Play className="h-6 w-6 landscape:h-5 landscape:w-5 text-white fill-white ms-0.5" />
                  </div>
                </div>
                {/* Platform badge */}
                <div className={cn(
                  "absolute top-2 start-2 px-2 py-0.5 rounded text-xs landscape:text-[10px] font-medium",
                  videoPlatform === 'youtube' 
                    ? "bg-red-600 text-white" 
                    : "bg-[#1ab7ea] text-white"
                )}>
                  {videoPlatform === 'youtube' ? 'YouTube' : 'Vimeo'}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 landscape:gap-2">
            {/* Platform icon or Favicon */}
            {detectedPlatform ? (
              <PlatformIcon platform={detectedPlatform} size="md" />
            ) : (
              <div className="flex-shrink-0 w-10 h-10 landscape:w-8 landscape:h-8 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                {isLoading ? (
                  <Skeleton className="w-6 h-6 landscape:w-5 landscape:h-5 rounded" />
                ) : metadata?.favicon ? (
                  <ImageWithFallback
                    sources={[metadata.favicon]}
                    fallback={<Globe className="h-5 w-5 landscape:h-4 landscape:w-4 text-muted-foreground" />}
                    alt=""
                    className="w-6 h-6 landscape:w-5 landscape:h-5 object-contain"
                    containerClassName="flex items-center justify-center"
                    showSkeleton={false}
                  />
                ) : (
                  <Globe className="h-5 w-5 landscape:h-4 landscape:w-4 text-muted-foreground" />
                )}
              </div>
            )}
            
            {/* Title and Domain */}
            <div className="flex-1 min-w-0">
              {isLoading ? (
                <>
                  <Skeleton className="h-4 landscape:h-3 w-3/4 mb-1.5" />
                  <Skeleton className="h-3 landscape:h-2.5 w-1/2" />
                </>
              ) : (
                <>
                  <p className="text-sm landscape:text-xs font-medium text-foreground break-words">
                    {metadata?.title || domain}
                  </p>
                  <p className="text-xs landscape:text-[10px] text-muted-foreground break-all">
                    {domain}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {viewMode === 'choose' ? (
          /* Action Buttons - 2x2 grid matching ClipboardSuggestion */
          <div className="px-4 landscape:px-3 py-4 landscape:py-3 space-y-3 landscape:space-y-2">
            {/* Primary action row */}
            <div className="flex gap-3 landscape:gap-2">
              {/* Quick Save */}
              <Button
                className="flex-1 gap-2 landscape:h-9"
                onClick={handleQuickSave}
                disabled={isLoading}
              >
                <Zap className="h-4 w-4 landscape:h-3.5 landscape:w-3.5" />
                <span className="landscape:text-xs">{isLoading ? t('common.loading') : t('sharedUrl.quickSave')}</span>
              </Button>
              
              {/* Edit & Save */}
              <Button
                variant="outline"
                className="flex-1 gap-2 landscape:h-9"
                onClick={handleSaveWithEdit}
              >
                <Pencil className="h-4 w-4 landscape:h-3.5 landscape:w-3.5" />
                <span className="landscape:text-xs">{t('sharedUrl.editAndSave')}</span>
              </Button>
            </div>
            
            {/* Secondary actions row */}
            <div className="flex gap-3 landscape:gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-2 landscape:h-9"
                onClick={handleCreateShortcut}
              >
                <Smartphone className="h-4 w-4 landscape:h-3.5 landscape:w-3.5" />
                <span className="landscape:text-xs">{t('sharedUrl.shortcut')}</span>
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2 landscape:h-9"
                onClick={handleCreateReminder}
              >
                <Bell className="h-4 w-4 landscape:h-3.5 landscape:w-3.5" />
                <span className="landscape:text-xs">{t('sharedUrl.remindLater')}</span>
              </Button>
            </div>
          </div>
        ) : (
          /* Edit Form */
          <div className="px-4 landscape:px-3 py-4 landscape:py-3 space-y-4 landscape:space-y-3">
            {/* Portrait: stacked, Landscape: 2-column */}
            <div className="landscape:grid landscape:grid-cols-2 landscape:gap-3">
              {/* Title */}
              <div className="space-y-1.5 landscape:space-y-1">
                <label className="text-xs landscape:text-[10px] font-medium text-muted-foreground">{t('sharedUrl.title')}</label>
                <div className="relative">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder={metadata?.title || domain}
                    className="pe-8 landscape:h-9"
                  />
                  {editTitle && (
                    <button
                      onClick={() => setEditTitle('')}
                      className="absolute end-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted"
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5 landscape:space-y-1 mt-4 landscape:mt-0">
                <label className="text-xs landscape:text-[10px] font-medium text-muted-foreground">{t('sharedUrl.descriptionOptional')}</label>
                <div className="relative">
                  <Textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder={t('sharedUrl.addNote')}
                    className="min-h-[60px] landscape:min-h-[50px] resize-none pe-8"
                  />
                  {editDescription && (
                    <button
                      onClick={() => setEditDescription('')}
                      className="absolute end-2 top-2 p-1 rounded-full hover:bg-muted"
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Folder/Tag Selection */}
            <div className="space-y-1.5 landscape:space-y-1">
              <label className="text-xs landscape:text-[10px] font-medium text-muted-foreground">{t('sharedUrl.folderOptional')}</label>
              <ScrollArea className="w-full">
                <div className="flex gap-2 landscape:gap-1.5 pb-2">
                  <button
                    type="button"
                    onClick={() => setEditTag(null)}
                    className={cn(
                      "px-3 py-1.5 landscape:px-2 landscape:py-1 rounded-full text-xs landscape:text-[10px] font-medium whitespace-nowrap transition-colors",
                      editTag === null
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {t('sharedUrl.none')}
                  </button>
                  {folders.map((folder) => (
                    <button
                      key={folder}
                      type="button"
                      onClick={() => setEditTag(folder)}
                      className={cn(
                        "px-3 py-1.5 landscape:px-2 landscape:py-1 rounded-full text-xs landscape:text-[10px] font-medium whitespace-nowrap transition-colors",
                        editTag === folder
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {folder}
                    </button>
                  ))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>

            {/* Save Button */}
            <Button className="w-full gap-2 landscape:h-9" onClick={handleConfirmSave}>
              <Bookmark className="h-4 w-4 landscape:h-3.5 landscape:w-3.5" />
              <span className="landscape:text-xs">{t('sharedUrl.saveToLibrary')}</span>
            </Button>
          </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
