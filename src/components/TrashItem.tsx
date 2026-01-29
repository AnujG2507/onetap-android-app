import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, RotateCcw, Clock, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HorizontalScrollText } from '@/components/HorizontalScrollText';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { getDaysRemaining, type TrashedLink } from '@/lib/savedLinksManager';
import { useRTL } from '@/hooks/useRTL';

interface TrashItemProps {
  link: TrashedLink;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

function extractFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
  } catch {
    return '';
  }
}

const SWIPE_THRESHOLD = 80;
const SWIPE_ACTION_THRESHOLD = 120;

export function TrashItem({ link, onRestore, onDelete }: TrashItemProps) {
  const { t } = useTranslation();
  const { isRTL } = useRTL();
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isUrlExpanded, setIsUrlExpanded] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const hasTriggeredHaptic = useRef(false);

  const daysRemaining = getDaysRemaining(link.deletedAt, link.retentionDays);
  const faviconUrl = extractFaviconUrl(link.url);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    isHorizontalSwipe.current = null;
    hasTriggeredHaptic.current = false;
    setIsSwiping(false);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;

    // Determine swipe direction on first significant movement
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
        if (isHorizontalSwipe.current) {
          setIsSwiping(true);
        }
      }
    }

    // Handle horizontal swipes
    if (isHorizontalSwipe.current) {
      e.preventDefault();
      // Apply resistance at edges
      const resistance = 0.6;
      const limitedDelta = Math.max(
        Math.min(deltaX * resistance, SWIPE_ACTION_THRESHOLD),
        -SWIPE_ACTION_THRESHOLD
      );
      setSwipeX(limitedDelta);

      // Haptic feedback when crossing threshold
      if (Math.abs(limitedDelta) >= SWIPE_THRESHOLD && !hasTriggeredHaptic.current) {
        hasTriggeredHaptic.current = true;
        triggerHaptic('light');
      } else if (Math.abs(limitedDelta) < SWIPE_THRESHOLD && hasTriggeredHaptic.current) {
        hasTriggeredHaptic.current = false;
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    // RTL-aware: In LTR, swipe right=restore, left=delete
    // In RTL, swipe left=restore, right=delete
    if (isRTL) {
      if (swipeX <= -SWIPE_THRESHOLD) {
        triggerHaptic('success');
        onRestore(link.id);
      } else if (swipeX >= SWIPE_THRESHOLD) {
        triggerHaptic('warning');
        onDelete(link.id);
      }
    } else {
      if (swipeX >= SWIPE_THRESHOLD) {
        triggerHaptic('success');
        onRestore(link.id);
      } else if (swipeX <= -SWIPE_THRESHOLD) {
        triggerHaptic('warning');
        onDelete(link.id);
      }
    }

    // Reset swipe state
    setSwipeX(0);
    setTimeout(() => setIsSwiping(false), 100);
    isHorizontalSwipe.current = null;
  }, [swipeX, onRestore, onDelete, link.id, isRTL]);

  // RTL-aware: determine which side shows which action
  const restoreVisible = isRTL ? swipeX < -20 : swipeX > 20;
  const deleteVisible = isRTL ? swipeX > 20 : swipeX < -20;
  const restoreWidth = isRTL ? Math.abs(Math.min(swipeX, 0)) + 20 : Math.max(swipeX, 0) + 20;
  const deleteWidth = isRTL ? Math.max(swipeX, 0) + 20 : Math.abs(Math.min(swipeX, 0)) + 20;
  const restoreTriggered = isRTL ? swipeX <= -SWIPE_THRESHOLD : swipeX >= SWIPE_THRESHOLD;
  const deleteTriggered = isRTL ? swipeX >= SWIPE_THRESHOLD : swipeX <= -SWIPE_THRESHOLD;

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Restore action background - RTL-aware positioning */}
      <div
        className={cn(
          "absolute inset-y-0 flex items-center px-4 bg-primary transition-opacity",
          isRTL ? "end-0 justify-end" : "start-0 justify-start",
          restoreVisible ? "opacity-100" : "opacity-0"
        )}
        style={{ width: restoreWidth }}
      >
        <RotateCcw
          className={cn(
            "h-5 w-5 text-primary-foreground transition-transform",
            restoreTriggered && "scale-110"
          )}
        />
      </div>

      {/* Delete action background - RTL-aware positioning */}
      <div
        className={cn(
          "absolute inset-y-0 flex items-center px-4 bg-destructive transition-opacity",
          isRTL ? "start-0 justify-start" : "end-0 justify-end",
          deleteVisible ? "opacity-100" : "opacity-0"
        )}
        style={{ width: deleteWidth }}
      >
        <Trash2
          className={cn(
            "h-5 w-5 text-destructive-foreground transition-transform",
            deleteTriggered && "scale-110"
          )}
        />
      </div>

      {/* Main content */}
      <div
        className="flex items-start gap-3 p-3 bg-muted/50 border border-border/50"
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.2s ease-out',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Favicon */}
        <div className="h-10 w-10 rounded-lg bg-background border flex items-center justify-center shrink-0 overflow-hidden">
          {faviconUrl ? (
            <img
              src={faviconUrl}
              alt=""
              className="h-5 w-5"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="h-5 w-5 rounded bg-muted" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <HorizontalScrollText className="text-sm font-medium text-foreground">
            {link.title}
          </HorizontalScrollText>
          <div 
            className="flex items-start gap-1 text-xs text-muted-foreground mt-0.5 text-start hover:text-muted-foreground/80 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setIsUrlExpanded(!isUrlExpanded);
            }}
          >
            <span className={cn("break-all", !isUrlExpanded && "line-clamp-2")}>
              {link.url}
            </span>
            <ChevronDown 
              className={cn(
                "h-3 w-3 shrink-0 mt-0.5 transition-transform duration-200",
                isUrlExpanded && "rotate-180"
              )} 
            />
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            {link.tag && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {link.tag}
              </Badge>
            )}
            <span
              className={cn(
                "text-[10px] flex items-center gap-1",
                daysRemaining <= 7 ? "text-destructive" : "text-muted-foreground"
              )}
            >
              <Clock className="h-3 w-3" />
              {daysRemaining === 0
                ? t('trash.expiresToday')
                : daysRemaining === 1
                ? t('trash.expiresTomorrow')
                : t('trash.daysLeft', { days: daysRemaining })}
            </span>
          </div>
        </div>

        {/* Actions (fallback for non-touch) */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
            onClick={() => onRestore(link.id)}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(link.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
