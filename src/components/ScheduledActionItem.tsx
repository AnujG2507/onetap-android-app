// Individual scheduled action item with swipe-to-delete
import { useState, useRef, useCallback } from 'react';
import { 
  FileText, 
  Link, 
  Phone, 
  Trash2,
  Clock,
  Calendar,
  CalendarDays,
  CalendarClock,
  Pencil
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import { formatTriggerTime, formatRecurrence } from '@/lib/scheduledActionsManager';
import type { ScheduledAction, RecurrenceType } from '@/types/scheduledAction';
import { triggerHaptic } from '@/lib/haptics';

interface ScheduledActionItemProps {
  action: ScheduledAction;
  isDeleting: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
}

const SWIPE_THRESHOLD = 80;
const SWIPE_DELETE_THRESHOLD = 120;

export function ScheduledActionItem({ 
  action, 
  isDeleting,
  onToggle, 
  onDelete,
  onEdit 
}: ScheduledActionItemProps) {
  const [showActions, setShowActions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Swipe state
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const hasTriggeredHaptic = useRef(false);

  const getDestinationIcon = () => {
    switch (action.destination.type) {
      case 'file':
        return <FileText className="h-5 w-5" />;
      case 'url':
        return <Link className="h-5 w-5" />;
      case 'contact':
        return <Phone className="h-5 w-5" />;
    }
  };

  const getRecurrenceIcon = (recurrence: RecurrenceType) => {
    switch (recurrence) {
      case 'once':
        return <Clock className="h-3.5 w-3.5" />;
      case 'daily':
        return <Calendar className="h-3.5 w-3.5" />;
      case 'weekly':
        return <CalendarDays className="h-3.5 w-3.5" />;
      case 'yearly':
        return <CalendarClock className="h-3.5 w-3.5" />;
    }
  };

  const isPast = action.triggerTime < Date.now() && action.recurrence === 'once';
  const isExpired = isPast && action.enabled;

  // Swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    isHorizontalSwipe.current = null;
    hasTriggeredHaptic.current = false;
    setIsSwiping(false);
    // Stop propagation to prevent tab navigation from capturing this touch
    e.stopPropagation();
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

    // Only handle left swipes for delete
    if (isHorizontalSwipe.current && deltaX < 0) {
      e.preventDefault();
      e.stopPropagation(); // Prevent tab navigation from capturing horizontal swipe
      // Apply resistance
      const resistance = 0.6;
      const limitedDelta = Math.max(deltaX * resistance, -SWIPE_DELETE_THRESHOLD);
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
    if (swipeX <= -SWIPE_THRESHOLD) {
      // Swipe left = show delete confirmation
      triggerHaptic('warning');
      setShowDeleteConfirm(true);
    }

    // Reset swipe state
    setSwipeX(0);
    setTimeout(() => setIsSwiping(false), 100);
    isHorizontalSwipe.current = null;
  }, [swipeX]);

  const handleCardClick = useCallback(() => {
    if (!isSwiping) {
      setShowActions(!showActions);
    }
  }, [isSwiping, showActions]);

  const handleDeleteClick = useCallback(() => {
    triggerHaptic('warning');
    setShowDeleteConfirm(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    triggerHaptic('medium');
    onDelete();
    setShowDeleteConfirm(false);
    setShowActions(false);
  }, [onDelete]);

  return (
    <>
      <div 
        className={cn(
          "relative overflow-hidden rounded-2xl",
          isDeleting && "opacity-30 pointer-events-none"
        )}
      >
        {/* Delete action background */}
        <div 
          className={cn(
            "absolute inset-y-0 right-0 flex items-center justify-end px-4 bg-destructive transition-opacity rounded-r-2xl",
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
            "bg-card border border-border p-4 transition-all cursor-pointer",
            !action.enabled && "opacity-50",
            isExpired && "border-destructive/30"
          )}
          style={{
            transform: `translateX(${swipeX}px)`,
            transition: isSwiping ? 'none' : 'transform 0.2s ease-out',
          }}
          onClick={handleCardClick}
          onContextMenu={(e) => {
            e.preventDefault();
            setShowActions(!showActions);
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <div className="flex items-start gap-3">
            {/* Destination icon */}
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
              action.enabled && !isExpired ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}>
              {getDestinationIcon()}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm truncate">{action.name}</h4>
              <p className={cn(
                "text-xs mt-0.5",
                isExpired ? "text-destructive" : "text-muted-foreground"
              )}>
                {isExpired ? 'Expired — ' : ''}{formatTriggerTime(action.triggerTime)}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                {getRecurrenceIcon(action.recurrence)}
                <span>{formatRecurrence(action.recurrence)}</span>
              </div>
            </div>

            {/* Actions: edit, toggle, delete */}
            <div 
              className="flex items-center gap-1 relative z-10" 
              onClick={(e) => e.stopPropagation()}
            >
              {showActions ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      onEdit();
                      setShowActions(false);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={handleDeleteClick}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Switch
                  checked={action.enabled}
                  onCheckedChange={onToggle}
                  className="data-[state=checked]:bg-primary"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete scheduled action?</AlertDialogTitle>
            <AlertDialogDescription>
              "{action.name}" will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
