import { useRef, useCallback, useState, useMemo } from 'react';
import { Globe, GripVertical, ChevronDown, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TruncatedText } from '@/components/ui/expandable-text';
import { cn } from '@/lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { triggerHaptic } from '@/lib/haptics';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { SavedLink } from '@/lib/savedLinksManager';
import { getSettings } from '@/lib/settingsManager';
import { detectPlatform } from '@/lib/platformIcons';
import { PlatformIcon } from '@/components/PlatformIcon';
import { useRTL } from '@/hooks/useRTL';

interface BookmarkItemProps {
  link: SavedLink;
  onTap: () => void;
  onToggleShortlist: (id: string) => void;
  onCreateShortcut?: (url: string) => void;
  onDelete?: (id: string) => void;
  onPermanentDelete?: (id: string) => void;
  isDragDisabled?: boolean;
  isSelectionMode?: boolean;
}

function extractFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
  } catch {
    return '';
  }
}

const LONG_PRESS_DURATION = 500;
const SWIPE_THRESHOLD = 80; // Minimum swipe distance to trigger delete
const SWIPE_DELETE_THRESHOLD = 150; // Auto-delete threshold

export function BookmarkItem({ 
  link, 
  onTap, 
  onToggleShortlist, 
  onCreateShortcut,
  onDelete,
  onPermanentDelete,
  isDragDisabled,
  isSelectionMode = false,
}: BookmarkItemProps) {
  const { isRTL, isDeleteSwipe, getSwipeTransform } = useRTL();
  const faviconUrl = extractFaviconUrl(link.url);
  const platform = useMemo(() => detectPlatform(link.url), [link.url]);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [isUrlExpanded, setIsUrlExpanded] = useState(false);
  
  // Swipe state
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: link.id,
    disabled: isDragDisabled,
  });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  
  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleShortlist(link.id);
  };

  const handleLongPressStart = useCallback(() => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      triggerHaptic('medium');
      // Long press now triggers selection instead of shortcut creation
      onToggleShortlist(link.id);
    }, LONG_PRESS_DURATION);
  }, [link.id, onToggleShortlist]);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleConfirmCreateShortcut = useCallback(() => {
    if (onCreateShortcut) {
      onCreateShortcut(link.url);
    }
    setShowConfirmDialog(false);
  }, [link.url, onCreateShortcut]);

  const handleClick = useCallback(() => {
    if (!isLongPress.current && !isSwiping) {
      // In selection mode, tapping anywhere toggles selection
      if (isSelectionMode) {
        onToggleShortlist(link.id);
      } else {
        onTap();
      }
    }
    isLongPress.current = false;
  }, [onTap, isSelectionMode, onToggleShortlist, link.id, isSwiping]);

  // Swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isSelectionMode) return; // Disable swipe in selection mode
    
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    isHorizontalSwipe.current = null;
    setIsSwiping(false);
    
    // Also trigger long press start
    handleLongPressStart();
  }, [isSelectionMode, handleLongPressStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isSelectionMode) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;
    
    // Determine swipe direction on first significant movement
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
        if (isHorizontalSwipe.current) {
          // Cancel long press when swiping
          handleLongPressEnd();
          setIsSwiping(true);
          e.stopPropagation(); // Prevent tab swipe from firing
        }
      }
    }
    
    // Only handle horizontal swipes for delete action (RTL-aware)
    if (isHorizontalSwipe.current && isDeleteSwipe(deltaX)) {
      e.preventDefault();
      e.stopPropagation(); // Prevent tab swipe from firing
      // Calculate swipe distance with resistance (RTL-aware)
      const swipeDistance = getSwipeTransform(deltaX, SWIPE_DELETE_THRESHOLD);
      setSwipeX(swipeDistance);
      
      // Haptic feedback when crossing threshold
      if (Math.abs(deltaX) >= SWIPE_THRESHOLD && Math.abs(swipeX) < SWIPE_THRESHOLD) {
        triggerHaptic('light');
      }
    }
  }, [isSelectionMode, handleLongPressEnd, swipeX, isDeleteSwipe, getSwipeTransform]);

  const handleTouchEnd = useCallback(() => {
    handleLongPressEnd();
    
    if (Math.abs(swipeX) >= SWIPE_THRESHOLD && onDelete) {
      // Show confirmation dialog instead of immediate delete
      triggerHaptic('warning');
      setShowDeleteConfirmDialog(true);
    }
    
    // Reset swipe state
    setSwipeX(0);
    setTimeout(() => setIsSwiping(false), 100);
    isHorizontalSwipe.current = null;
  }, [swipeX, onDelete, handleLongPressEnd]);

  const handleMoveToTrash = useCallback(() => {
    if (onDelete) {
      onDelete(link.id);
    }
    setShowDeleteConfirmDialog(false);
  }, [onDelete, link.id]);

  const handlePermanentDeleteAction = useCallback(() => {
    if (onPermanentDelete) {
      onPermanentDelete(link.id);
    }
    setShowDeleteConfirmDialog(false);
  }, [onPermanentDelete, link.id]);
  
  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      style={style}
      className={cn(
        "relative overflow-hidden rounded-xl",
        isDragging && "opacity-50 shadow-lg scale-[1.02] z-50"
      )}
    >
      {/* Delete action background - RTL-aware positioning */}
      <div 
        className={cn(
          "absolute inset-y-0 flex items-center px-4 bg-destructive transition-opacity",
          // Position on the correct side based on text direction
          isRTL ? "start-0 justify-start" : "end-0 justify-end",
          Math.abs(swipeX) > 20 ? "opacity-100" : "opacity-0"
        )}
        style={{ width: Math.abs(swipeX) + 20 }}
      >
        <Trash2 className={cn(
          "h-5 w-5 text-destructive-foreground transition-transform",
          Math.abs(swipeX) >= SWIPE_THRESHOLD && "scale-110"
        )} />
      </div>
      
      {/* Main content */}
      <div
        className={cn(
          "w-full flex items-start gap-2 p-4",
          "bg-card hover:bg-muted/50",
          "transition-all duration-200",
          "text-start group border",
          // Selection mode visual feedback
          isSelectionMode && link.isShortlisted
            ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
            : "border-border/50"
        )}
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.2s ease-out',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Drag Handle */}
        {!isDragDisabled && (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center pt-1 cursor-grab active:cursor-grabbing touch-none animate-fade-in"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-5 w-5 text-primary/70" />
              </button>
            </TooltipTrigger>
            <TooltipContent side={isRTL ? "right" : "left"} className="text-xs">
              Drag to reorder
            </TooltipContent>
          </Tooltip>
        )}
        
        {/* Checkbox for shortlisting - only visible in selection mode */}
        {isSelectionMode && (
          <div 
            className="flex items-center justify-center pt-1"
            onClick={handleCheckboxClick}
          >
            <Checkbox 
              checked={link.isShortlisted || false}
              className="h-5 w-5"
            />
          </div>
        )}
        
        {/* Clickable content area */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleClick();
            }
          }}
          onMouseDown={handleLongPressStart}
          onMouseUp={handleLongPressEnd}
          onMouseLeave={handleLongPressEnd}
          className="flex-1 flex items-start gap-3 min-w-0 overflow-hidden text-start active:scale-[0.99] transition-transform select-none cursor-pointer"
        >
          {/* Platform icon or Favicon */}
          {platform ? (
            <PlatformIcon platform={platform} size="md" />
          ) : (
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted overflow-hidden">
              {faviconUrl ? (
                <img 
                  src={faviconUrl} 
                  alt="" 
                  className="h-6 w-6 object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <Globe className={cn("h-5 w-5 text-muted-foreground", faviconUrl && "hidden")} />
            </div>
          )}
          
          {/* Content */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <TruncatedText
              text={link.title}
              className="font-medium text-foreground"
            />
            <div 
              className={cn(
                "flex items-start gap-1 text-xs text-muted-foreground mt-0.5 text-start",
                !isSelectionMode && "hover:text-muted-foreground/80 cursor-pointer"
              )}
              onClick={(e) => {
                if (isSelectionMode) return; // Disable expansion in selection mode
                e.stopPropagation();
                setIsUrlExpanded(!isUrlExpanded);
              }}
            >
              <span className={cn("break-all", !isUrlExpanded && "line-clamp-2")}>
                {link.url}
              </span>
              {!isSelectionMode && (
                <ChevronDown 
                  className={cn(
                    "h-3 w-3 shrink-0 mt-0.5 transition-transform duration-200",
                    isUrlExpanded && "rotate-180"
                  )} 
                />
              )}
            </div>
            {link.description && (
              <p className="text-xs text-muted-foreground/80 mt-1.5 line-clamp-2">
                {link.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {link.tag && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                  {link.tag}
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground/50">
                {new Date(link.createdAt).toLocaleDateString(undefined, { 
                  month: 'short', 
                  day: 'numeric',
                  year: link.createdAt < Date.now() - 365 * 24 * 60 * 60 * 1000 ? 'numeric' : undefined
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Create Shortcut Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create Shortcut?</AlertDialogTitle>
            <AlertDialogDescription>
              Create a home screen shortcut for "{link.title}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCreateShortcut}>
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bookmark?</AlertDialogTitle>
            <AlertDialogDescription>
              "{link.title}" will be moved to trash. Items in trash are automatically deleted after {getSettings().trashRetentionDays} days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleMoveToTrash}
              className="border border-warning/40 bg-warning/10 text-warning-foreground hover:bg-warning/20"
            >
              Move to Trash
            </AlertDialogAction>
            <AlertDialogAction 
              onClick={handlePermanentDeleteAction}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
