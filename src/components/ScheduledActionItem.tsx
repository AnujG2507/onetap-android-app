// Individual scheduled action item with selection mode and swipe-to-delete
import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, 
  Link, 
  Phone, 
  Trash2,
  Clock,
  Calendar,
  CalendarDays,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
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
import { ContactAvatar } from '@/components/ContactAvatar';
import type { ScheduledAction, RecurrenceType } from '@/types/scheduledAction';
import { triggerHaptic } from '@/lib/haptics';
import { useRTL } from '@/hooks/useRTL';

interface ScheduledActionItemProps {
  action: ScheduledAction;
  isDeleting: boolean;
  isSelected: boolean;
  isSelectionMode: boolean;
  onTap: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onToggleSelection: () => void;
  onEnterSelectionMode: () => void;
}

const SWIPE_THRESHOLD = 80;
const SWIPE_DELETE_THRESHOLD = 120;
const LONG_PRESS_DURATION = 500;

export function ScheduledActionItem({ 
  action, 
  isDeleting,
  isSelected,
  isSelectionMode,
  onTap,
  onToggle,
  onDelete,
  onToggleSelection,
  onEnterSelectionMode,
}: ScheduledActionItemProps) {
  const { t } = useTranslation();
  const { isRTL, isDeleteSwipe, getSwipeTransform } = useRTL();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  
  // Swipe state
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const hasTriggeredHaptic = useRef(false);
  
  // Long press state
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  const hasMovedRef = useRef(false);

  const getDestinationIcon = () => {
    switch (action.destination.type) {
      case 'file':
        return <FileText className="h-5 w-5" />;
      case 'url':
        return <Link className="h-5 w-5" />;
      case 'contact':
        // Show contact avatar with photo or initials fallback
        return (
          <ContactAvatar
            photoUri={action.destination.photoUri}
            name={action.destination.contactName}
            className="h-full w-full text-sm"
            fallbackIcon={<Phone className="h-5 w-5" />}
          />
        );
    }
  };

  const getRecurrenceIcon = (recurrence: RecurrenceType) => {
    switch (recurrence) {
      case 'once':
        return <Clock className="h-3.5 w-3.5" />;
      case 'daily':
        return <RefreshCw className="h-3.5 w-3.5" />;
      case 'weekly':
        return <CalendarDays className="h-3.5 w-3.5" />;
      case 'yearly':
        return <Calendar className="h-3.5 w-3.5" />;
    }
  };

  const isPast = action.triggerTime < Date.now() && action.recurrence === 'once';
  const isExpired = isPast && action.enabled;

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    isHorizontalSwipe.current = null;
    hasTriggeredHaptic.current = false;
    hasMovedRef.current = false;
    isLongPressRef.current = false;
    setIsSwiping(false);
    e.stopPropagation();
    
    // Start long press timer
    longPressTimerRef.current = setTimeout(() => {
      if (!hasMovedRef.current) {
        isLongPressRef.current = true;
        triggerHaptic('medium');
        if (!isSelectionMode) {
          onEnterSelectionMode();
        }
        onToggleSelection();
      }
    }, LONG_PRESS_DURATION);
  }, [isSelectionMode, onEnterSelectionMode, onToggleSelection]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;

    // Cancel long press if moved
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      hasMovedRef.current = true;
      clearLongPressTimer();
    }

    // Determine swipe direction on first significant movement
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
        if (isHorizontalSwipe.current) {
          setIsSwiping(true);
        }
      }
    }

    // Only handle swipes for delete (RTL-aware direction)
    if (!isSelectionMode && isHorizontalSwipe.current && isDeleteSwipe(deltaX)) {
      e.preventDefault();
      e.stopPropagation();
      const swipeDistance = getSwipeTransform(deltaX, SWIPE_DELETE_THRESHOLD);
      setSwipeX(swipeDistance);

      // Haptic feedback when crossing threshold
      if (Math.abs(swipeDistance) >= SWIPE_THRESHOLD && !hasTriggeredHaptic.current) {
        hasTriggeredHaptic.current = true;
        triggerHaptic('light');
      } else if (Math.abs(swipeDistance) < SWIPE_THRESHOLD && hasTriggeredHaptic.current) {
        hasTriggeredHaptic.current = false;
      }
    }
  }, [isSelectionMode, clearLongPressTimer, isDeleteSwipe, getSwipeTransform]);

  const handleTouchEnd = useCallback(() => {
    clearLongPressTimer();
    
    // Handle swipe completion (RTL-aware threshold check)
    if (isSwiping && Math.abs(swipeX) >= SWIPE_THRESHOLD) {
      triggerHaptic('warning');
      setShowDeleteConfirm(true);
    }

    // Reset swipe state
    setSwipeX(0);
    setTimeout(() => setIsSwiping(false), 100);
    isHorizontalSwipe.current = null;
    
    // Handle tap (if not long press and not moved and not swiping)
    if (!isLongPressRef.current && !hasMovedRef.current && !isSwiping) {
      if (isSelectionMode) {
        onToggleSelection();
      } else {
        triggerHaptic('light');
        onTap();
      }
    }
  }, [isSwiping, swipeX, isSelectionMode, onToggleSelection, onTap, clearLongPressTimer]);

  const handleConfirmDelete = useCallback(() => {
    triggerHaptic('medium');
    onDelete();
    setShowDeleteConfirm(false);
  }, [onDelete]);

  const handleCheckboxChange = useCallback(() => {
    triggerHaptic('light');
    onToggleSelection();
  }, [onToggleSelection]);

  const handleToggleSwitch = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');
    onToggle();
  }, [onToggle]);

  const handleDescriptionClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (!isSelectionMode && action.description && action.description.length > 40) {
      setIsDescriptionExpanded(prev => !prev);
      triggerHaptic('light');
    }
  }, [isSelectionMode, action.description]);

  return (
    <>
      <div 
        className={cn(
          "relative overflow-hidden rounded-2xl",
          isDeleting && "opacity-30 pointer-events-none"
        )}
      >
        {/* Delete action background - RTL-aware positioning */}
        {!isSelectionMode && (
          <div 
            className={cn(
              "absolute inset-y-0 flex items-center px-4 bg-destructive transition-opacity",
              isRTL ? "start-0 justify-start rounded-s-2xl" : "end-0 justify-end rounded-e-2xl",
              Math.abs(swipeX) > 20 ? "opacity-100" : "opacity-0"
            )}
            style={{ width: Math.abs(swipeX) + 20 }}
          >
            <Trash2 className={cn(
              "h-5 w-5 text-destructive-foreground transition-transform",
              Math.abs(swipeX) >= SWIPE_THRESHOLD && "scale-110"
            )} />
          </div>
        )}

        {/* Main content */}
        <div
          className={cn(
            "bg-card border border-border p-4 transition-all cursor-pointer rounded-2xl",
            !action.enabled && !isSelected && "opacity-50",
            isExpired && !isSelected && "border-destructive/30",
            isSelected && "ring-2 ring-primary bg-primary/5 border-primary"
          )}
          style={{
            transform: `translateX(${swipeX}px)`,
            transition: isSwiping ? 'none' : 'transform 0.2s ease-out',
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={() => {
            clearLongPressTimer();
            setSwipeX(0);
            setIsSwiping(false);
          }}
        >
          <div className="flex items-start gap-3">
            {/* Selection checkbox */}
            {isSelectionMode && (
              <div 
                className="flex items-center justify-center pt-2"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={handleCheckboxChange}
                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
              </div>
            )}

            {/* Destination icon */}
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl shrink-0 overflow-hidden",
              action.enabled && !isExpired ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}>
              {getDestinationIcon()}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm truncate">{action.name}</h4>
              {action.description && (
                <div 
                  className={cn(
                    "mt-0.5",
                    !isSelectionMode && action.description.length > 40 && "cursor-pointer"
                  )}
                  onClick={handleDescriptionClick}
                >
                  <div className="flex items-start gap-1">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.p
                        key={isDescriptionExpanded ? 'expanded' : 'collapsed'}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className={cn(
                          "text-xs text-muted-foreground flex-1",
                          !isDescriptionExpanded && "line-clamp-1"
                        )}
                      >
                        {action.description}
                      </motion.p>
                    </AnimatePresence>
                    {!isSelectionMode && action.description.length > 40 && (
                      <motion.div
                        animate={{ rotate: isDescriptionExpanded ? 180 : 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      >
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      </motion.div>
                    )}
                  </div>
                </div>
              )}
              <p className={cn(
                "text-xs mt-0.5",
                isExpired ? "text-destructive" : "text-muted-foreground"
              )}>
                {isExpired ? t('scheduledActionItem.expired') + ' — ' : ''}{formatTriggerTime(action.triggerTime)}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                {getRecurrenceIcon(action.recurrence)}
                <span>{formatRecurrence(action.recurrence)}</span>
              </div>
            </div>

            {/* Toggle switch (only when not in selection mode) */}
            {!isSelectionMode && (
              <div 
                className="flex items-center relative z-10 pt-2" 
                onClick={handleToggleSwitch}
              >
                <Switch
                  checked={action.enabled}
                  onCheckedChange={() => {}}
                  className="data-[state=checked]:bg-primary pointer-events-none"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('scheduledActionItem.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('scheduledActionItem.deleteDesc', { name: action.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
