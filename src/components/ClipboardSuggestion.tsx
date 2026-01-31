import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Clipboard, X, ChevronLeft, Check, Zap, BookmarkPlus, Bell, Edit3, Link, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerSelectionFeedback, triggerHaptic } from '@/lib/haptics';
import { useUrlMetadata } from '@/hooks/useUrlMetadata';
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail';
import { PlatformIcon } from '@/components/PlatformIcon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { getAllFolders, getFolderIcon } from '@/lib/savedLinksManager';
import { getIconByName } from '@/components/FolderIconPicker';
import { detectPlatform } from '@/lib/platformIcons';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

interface ClipboardSuggestionProps {
  url: string;
  onCreateShortcut: (url: string) => void;
  onSaveToLibrary: (url: string, data?: { title?: string; description?: string; tag?: string | null }) => void;
  onCreateReminder: (url: string) => void;
  onDismiss: () => void;
}

const SWIPE_THRESHOLD = 80;
const AUTO_DISMISS_MS = 15000; // 15 seconds

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return url.slice(0, 30);
  }
}

export function ClipboardSuggestion({ 
  url, 
  onCreateShortcut, 
  onSaveToLibrary, 
  onCreateReminder,
  onDismiss 
}: ClipboardSuggestionProps) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [viewMode, setViewMode] = useState<'choose' | 'edit'>('choose');
  const [showSuccess, setShowSuccess] = useState(false);
  
  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTag, setEditTag] = useState<string | null>(null);
  
  // Timer control
  const [isPaused, setIsPaused] = useState(false);
  const timerStartRef = useRef<number>(Date.now());
  const remainingTimeRef = useRef<number>(AUTO_DISMISS_MS);
  
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const domain = extractDomain(url);
  
  // Network status
  const { isOnline } = useNetworkStatus();
  
  // Fetch metadata
  const { metadata, isLoading: isMetadataLoading } = useUrlMetadata(url);
  const { thumbnailUrl, platform: videoPlatform } = useVideoThumbnail(url);
  
  // Get available folders
  const folders = useMemo(() => getAllFolders(), []);
  
  // Detect platform for icon
  const platform = useMemo(() => detectPlatform(url), [url]);

  // Animate in on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Initialize edit title when metadata loads
  useEffect(() => {
    if (metadata?.title && !editTitle) {
      setEditTitle(metadata.title);
    }
  }, [metadata?.title, editTitle]);

  // Auto-dismiss with pause support
  useEffect(() => {
    if (showSuccess || viewMode === 'edit') return;
    
    if (isPaused) {
      // Store remaining time when paused
      remainingTimeRef.current = remainingTimeRef.current - (Date.now() - timerStartRef.current);
      return;
    }
    
    timerStartRef.current = Date.now();
    const timer = setTimeout(() => {
      handleDismiss();
    }, remainingTimeRef.current);
    
    return () => clearTimeout(timer);
  }, [isPaused, showSuccess, viewMode]);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss();
    }, 200);
  }, [onDismiss]);

  const handleQuickSave = () => {
    triggerHaptic('success');
    setShowSuccess(true);
    onSaveToLibrary(url, { 
      title: metadata?.title || undefined,
    });
    setTimeout(() => {
      handleDismiss();
    }, 800);
  };

  const handleEditSave = () => {
    setViewMode('edit');
    setIsPaused(true);
  };

  const handleSaveFromEdit = () => {
    triggerHaptic('success');
    setShowSuccess(true);
    onSaveToLibrary(url, {
      title: editTitle || undefined,
      description: editDescription || undefined,
      tag: editTag,
    });
    setTimeout(() => {
      handleDismiss();
    }, 800);
  };

  const handleBackToChoose = () => {
    setViewMode('choose');
    setIsPaused(false);
    remainingTimeRef.current = AUTO_DISMISS_MS; // Reset timer
    timerStartRef.current = Date.now();
  };

  const handleCreateShortcut = () => {
    setIsExiting(true);
    setTimeout(() => {
      onCreateShortcut(url);
    }, 150);
  };

  const handleCreateReminder = () => {
    setIsExiting(true);
    setTimeout(() => {
      onCreateReminder(url);
    }, 150);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (viewMode === 'edit') return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    setIsSwiping(false);
    setIsPaused(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || viewMode === 'edit') return;

    const deltaX = e.touches[0].clientX - touchStartRef.current.x;
    const deltaY = e.touches[0].clientY - touchStartRef.current.y;

    // Only start swiping if horizontal movement is dominant
    if (!isSwiping && Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
      setIsSwiping(true);
    }

    if (isSwiping) {
      setSwipeX(deltaX);
    }
  };

  const handleTouchEnd = () => {
    if (viewMode === 'edit') return;
    
    if (Math.abs(swipeX) > SWIPE_THRESHOLD) {
      triggerSelectionFeedback();
      handleDismiss();
    } else {
      setSwipeX(0);
      setIsPaused(false);
    }
    touchStartRef.current = null;
    setIsSwiping(false);
  };

  // Success state
  if (showSuccess) {
    return (
      <div
        className={cn(
          "fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] inset-x-4 z-50",
          "transition-all duration-300 ease-out",
          isVisible && !isExiting 
            ? "translate-y-0 opacity-100" 
            : "translate-y-4 opacity-0"
        )}
      >
        <div className="bg-card/95 backdrop-blur-md border border-border rounded-2xl shadow-lg overflow-hidden p-6 landscape:p-4 flex flex-col items-center gap-2">
          <div className="h-12 w-12 landscape:h-10 landscape:w-10 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check className="h-6 w-6 landscape:h-5 landscape:w-5 text-green-500" />
          </div>
          <p className="text-foreground landscape:text-sm font-medium">{t('sharedUrl.savedToLibrary')}</p>
        </div>
      </div>
    );
  }

  // Edit mode
  if (viewMode === 'edit') {
    return (
      <div
        className={cn(
          "fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] inset-x-4 z-50",
          "transition-all duration-300 ease-out",
          isVisible && !isExiting 
            ? "translate-y-0 opacity-100" 
            : "translate-y-4 opacity-0"
        )}
      >
        <div className="bg-card/95 backdrop-blur-md border border-border rounded-2xl shadow-lg overflow-hidden landscape:max-w-lg landscape:mx-auto">
          {/* Header */}
          <div className="p-4 landscape:p-3 pb-0">
            <div className="flex items-center justify-between">
              <button
                onClick={handleBackToChoose}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                <span className="text-sm landscape:text-xs font-medium">{t('sharedUrl.saveToLibrary')}</span>
              </button>
              <button
                onClick={handleDismiss}
                className="p-1 -m-1 rounded-full hover:bg-muted/50 transition-colors"
                aria-label={t('clipboard.dismiss')}
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
          
          {/* Form */}
          <div className="p-4 landscape:p-3 space-y-4 landscape:space-y-3">
            {/* Portrait: stacked, Landscape: 2-column */}
            <div className="landscape:grid landscape:grid-cols-2 landscape:gap-3">
              {/* Title */}
              <div className="space-y-1.5 landscape:space-y-1">
                <Label htmlFor="edit-title" className="text-xs landscape:text-[10px] text-muted-foreground">
                  {t('sharedUrl.title')}
                </Label>
                <Input
                  id="edit-title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder={domain}
                  className="h-10 landscape:h-9"
                />
              </div>
              
              {/* Description */}
              <div className="space-y-1.5 landscape:space-y-1 mt-4 landscape:mt-0">
                <Label htmlFor="edit-desc" className="text-xs landscape:text-[10px] text-muted-foreground">
                  {t('sharedUrl.descriptionOptional')}
                </Label>
                <Input
                  id="edit-desc"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder={t('sharedUrl.addNote')}
                  className="h-10 landscape:h-9"
                />
              </div>
            </div>
            
            {/* Folder picker */}
            <div className="space-y-1.5 landscape:space-y-1">
              <Label className="text-xs landscape:text-[10px] text-muted-foreground">
                {t('sharedUrl.folderOptional')}
              </Label>
              <div className="flex flex-wrap gap-2 landscape:gap-1.5">
                <button
                  onClick={() => setEditTag(null)}
                  className={cn(
                    "px-3 py-1.5 landscape:px-2 landscape:py-1 rounded-lg text-sm landscape:text-xs font-medium transition-all",
                    editTag === null
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {t('sharedUrl.none')}
                </button>
                {folders.map((folderName) => {
                  const iconName = getFolderIcon(folderName);
                  const IconComponent = iconName ? getIconByName(iconName) : null;
                  
                  return (
                    <button
                      key={folderName}
                      onClick={() => setEditTag(folderName)}
                      className={cn(
                        "px-3 py-1.5 landscape:px-2 landscape:py-1 rounded-lg text-sm landscape:text-xs font-medium transition-all flex items-center gap-1.5",
                        editTag === folderName
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {IconComponent && <IconComponent className="h-3.5 w-3.5 landscape:h-3 landscape:w-3" />}
                      {folderName}
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* Save button */}
            <button
              onClick={handleSaveFromEdit}
              className={cn(
                "w-full py-3 landscape:py-2 rounded-xl font-medium landscape:text-sm",
                "bg-primary text-primary-foreground",
                "flex items-center justify-center gap-2",
                "active:scale-[0.98] transition-all"
              )}
            >
              <BookmarkPlus className="h-4 w-4 landscape:h-3.5 landscape:w-3.5" />
              {t('sharedUrl.saveToLibrary')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Choose mode (default)
  return (
    <div
      className={cn(
        "fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] inset-x-4 z-50",
        "transition-all duration-300 ease-out",
        isVisible && !isExiting 
          ? "translate-y-0 opacity-100" 
          : "translate-y-4 opacity-0"
      )}
    >
      <div 
        className={cn(
          "bg-card/95 backdrop-blur-md border border-border rounded-2xl shadow-lg overflow-hidden landscape:max-w-lg landscape:mx-auto",
          !isSwiping && "transition-transform duration-200"
        )}
        style={{ 
          transform: `translateX(${swipeX}px)`,
          opacity: Math.max(0.3, 1 - Math.abs(swipeX) / 150)
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Progress bar for auto-dismiss */}
        <div className="h-1 bg-muted overflow-hidden">
          <div 
            className={cn(
              "h-full bg-primary/50",
              !isPaused && viewMode === 'choose' && "animate-shrink-width"
            )}
            style={{ 
              animationDuration: `${AUTO_DISMISS_MS / 1000}s`,
              animationPlayState: isPaused ? 'paused' : 'running'
            }}
          />
        </div>
        
        <div className="p-4 landscape:p-3">
          {/* Offline indicator */}
          {!isOnline && (
            <div className="flex items-center gap-2 px-3 py-2 landscape:py-1.5 mb-3 landscape:mb-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <WifiOff className="h-3.5 w-3.5 landscape:h-3 landscape:w-3 flex-shrink-0" />
              <span className="text-xs landscape:text-[10px]">{t('clipboard.offlineMode')}</span>
            </div>
          )}
          
          {/* Header row */}
          <div className="flex items-start justify-between gap-3 mb-3 landscape:mb-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clipboard className="h-4 w-4 landscape:h-3.5 landscape:w-3.5" />
              <span className="text-xs landscape:text-[10px] font-medium uppercase tracking-wide">{t('clipboard.detected')}</span>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 -m-1 rounded-full hover:bg-muted/50 transition-colors"
              aria-label={t('clipboard.dismiss')}
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* URL preview with metadata */}
          <div className="bg-muted/30 rounded-xl p-3 landscape:p-2 mb-4 landscape:mb-3">
            {thumbnailUrl ? (
              // Video thumbnail
              <div className="relative mb-2 landscape:mb-1.5 rounded-lg overflow-hidden aspect-video landscape:aspect-[2/1] bg-muted">
                <img 
                  src={thumbnailUrl} 
                  alt="" 
                  className="w-full h-full object-cover"
                />
                <div className={cn(
                  "absolute inset-0 flex items-center justify-center bg-black/30",
                )}>
                  <div className={cn(
                    "h-12 w-12 landscape:h-10 landscape:w-10 rounded-full flex items-center justify-center",
                    videoPlatform === 'youtube' ? "bg-red-600" : "bg-blue-500"
                  )}>
                    <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-white border-b-[8px] border-b-transparent ms-1" />
                  </div>
                </div>
              </div>
            ) : null}
            
            <div className="flex items-center gap-3 landscape:gap-2">
              {/* Favicon/Platform icon */}
              <div className="h-10 w-10 landscape:h-8 landscape:w-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                {isMetadataLoading ? (
                  <Skeleton className="h-6 w-6 landscape:h-5 landscape:w-5 rounded" />
                ) : metadata?.favicon ? (
                  <img 
                    src={metadata.favicon} 
                    alt="" 
                    className="h-6 w-6 landscape:h-5 landscape:w-5 rounded"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : platform ? (
                  <PlatformIcon platform={platform} size="md" className="text-muted-foreground" />
                ) : (
                  <Link className="h-5 w-5 landscape:h-4 landscape:w-4 text-muted-foreground" />
                )}
              </div>
              
              {/* Title and domain */}
              <div className="flex-1 min-w-0">
                {isMetadataLoading ? (
                  <>
                    <Skeleton className="h-4 landscape:h-3 w-32 mb-1" />
                    <Skeleton className="h-3 landscape:h-2.5 w-20" />
                  </>
                ) : (
                  <>
                    <p className="text-foreground font-medium truncate text-sm landscape:text-xs">
                      {metadata?.title || domain}
                    </p>
                    <p className="text-xs landscape:text-[10px] text-muted-foreground truncate">
                      {domain}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons - 2x2 grid */}
          <div className="grid grid-cols-2 gap-2 landscape:gap-1.5">
            {/* Quick Save */}
            <button
              onClick={handleQuickSave}
              disabled={isMetadataLoading}
              className={cn(
                "flex items-center justify-center gap-2 py-3 landscape:py-2 px-4 landscape:px-3 rounded-xl",
                "bg-primary text-primary-foreground font-medium",
                "active:scale-[0.97] transition-all",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <BookmarkPlus className="h-4 w-4 landscape:h-3.5 landscape:w-3.5" />
              <span className="text-sm landscape:text-xs">{t('clipboard.quickSave')}</span>
            </button>
            
            {/* Edit & Save */}
            <button
              onClick={handleEditSave}
              className={cn(
                "flex items-center justify-center gap-2 py-3 landscape:py-2 px-4 landscape:px-3 rounded-xl",
                "bg-muted/50 text-foreground font-medium",
                "active:scale-[0.97] transition-all"
              )}
            >
              <Edit3 className="h-4 w-4 landscape:h-3.5 landscape:w-3.5" />
              <span className="text-sm landscape:text-xs">{t('clipboard.editSave')}</span>
            </button>
            
            {/* Shortcut */}
            <button
              onClick={handleCreateShortcut}
              className={cn(
                "flex items-center justify-center gap-2 py-3 landscape:py-2 px-4 landscape:px-3 rounded-xl",
                "bg-muted/50 text-foreground font-medium",
                "active:scale-[0.97] transition-all"
              )}
            >
              <Zap className="h-4 w-4 landscape:h-3.5 landscape:w-3.5" />
              <span className="text-sm landscape:text-xs">{t('clipboard.shortcut')}</span>
            </button>
            
            {/* Remind Later */}
            <button
              onClick={handleCreateReminder}
              className={cn(
                "flex items-center justify-center gap-2 py-3 landscape:py-2 px-4 landscape:px-3 rounded-xl",
                "bg-muted/50 text-foreground font-medium",
                "active:scale-[0.97] transition-all"
              )}
            >
              <Bell className="h-4 w-4 landscape:h-3.5 landscape:w-3.5" />
              <span className="text-sm landscape:text-xs">{t('clipboard.remindLater')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
