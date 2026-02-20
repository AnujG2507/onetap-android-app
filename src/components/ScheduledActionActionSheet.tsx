// Action sheet for a single scheduled action - similar to BookmarkActionSheet
import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  Play, 
  Edit2, 
  Trash2, 
  Clock, 
  Link, 
  FileText, 
  Phone,
  X,
  Calendar,
  RefreshCw,
  CalendarDays,
  Repeat,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { ContactAvatar } from '@/components/ContactAvatar';
import type { ScheduledAction, RecurrenceType } from '@/types/scheduledAction';
import { formatTriggerTime, formatRecurrence } from '@/lib/scheduledActionsManager';
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

interface ScheduledActionActionSheetProps {
  action: ScheduledAction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (id: string) => void;
  onEdit: (action: ScheduledAction) => void;
  onDelete: (id: string) => void;
  startInEditMode?: boolean;
}

export function ScheduledActionActionSheet({
  action,
  open,
  onOpenChange,
  onToggle,
  onEdit,
  onDelete,
  startInEditMode = false,
}: ScheduledActionActionSheetProps) {
  const { t } = useTranslation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Swipe-to-close gesture
  const startY = useRef(0);
  const currentY = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    currentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    currentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const deltaY = currentY.current - startY.current;
    if (deltaY > 80) {
      triggerHaptic('light');
      onOpenChange(false);
    }
  }, [onOpenChange]);

  const handleAction = useCallback((actionFn: () => void) => {
    triggerHaptic('light');
    actionFn();
    onOpenChange(false);
  }, [onOpenChange]);

  const handleToggleAction = useCallback(() => {
    if (!action) return;
    triggerHaptic('light');
    onToggle(action.id);
  }, [action, onToggle]);

  const handleEditAction = useCallback(() => {
    if (!action) return;
    handleAction(() => onEdit(action));
  }, [action, handleAction, onEdit]);

  const handleDeleteAction = useCallback(() => {
    triggerHaptic('medium');
    setShowDeleteConfirm(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!action) return;
    triggerHaptic('medium');
    onDelete(action.id);
    setShowDeleteConfirm(false);
    onOpenChange(false);
  }, [action, onDelete, onOpenChange]);

  // Auto-enter edit mode if requested
  useEffect(() => {
    if (open && startInEditMode && action) {
      // Delay slightly to let sheet open
      const timer = setTimeout(() => {
        onEdit(action);
        onOpenChange(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, startInEditMode, action, onEdit, onOpenChange]);

  if (!action) return null;

  const getDestinationIcon = () => {
    switch (action.destination.type) {
      case 'file': return <FileText className="h-5 w-5" />;
      case 'url': return <Link className="h-5 w-5" />;
      case 'contact': 
        // Contact avatar handles its own background
        return (
          <ContactAvatar
            photoUri={action.destination.photoUri}
            name={action.destination.contactName}
            className="h-full w-full rounded-xl text-sm"
            fallbackIcon={<Phone className="h-5 w-5" />}
          />
        );
    }
  };
  
  // Check if contact has avatar (photo or name for initials)
  const isContactWithAvatar = action.destination.type === 'contact' && 
    (action.destination.photoUri || action.destination.contactName);

  const getRecurrenceIcon = (recurrence: RecurrenceType) => {
    switch (recurrence) {
      case 'once': return <Clock className="h-4 w-4" />;
      case 'daily': return <RefreshCw className="h-4 w-4" />;
      case 'weekly': return <CalendarDays className="h-4 w-4" />;
      case 'yearly': return <Calendar className="h-4 w-4" />;
    }
  };

  const getDestinationName = () => {
    switch (action.destination.type) {
      case 'file': return action.destination.name;
      case 'url': return action.destination.uri;
      case 'contact': return action.destination.contactName;
    }
  };

  const isExpired = action.recurrence === 'once' && action.triggerTime < Date.now();

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent 
          side="bottom" 
          className="rounded-t-3xl px-0 landscape:max-h-[95vh]"
        >
          {/* Grab handle */}
          <div 
            className="flex justify-center pt-2 pb-4 landscape:pb-2 cursor-grab active:cursor-grabbing"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Action header */}
          <div className="px-5 landscape:px-4 pb-4 landscape:pb-3 border-b">
            <div className="flex items-start gap-3 landscape:gap-2">
              <div className={cn(
                "w-12 h-12 landscape:w-10 landscape:h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden",
                !isContactWithAvatar && (action.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')
              )}>
                {getDestinationIcon()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base landscape:text-sm break-words">{action.name}</h3>
                <p className="text-sm landscape:text-xs text-muted-foreground break-all">{getDestinationName()}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs landscape:text-[10px] ${isExpired ? 'text-muted-foreground' : 'text-primary'}`}>
                    {isExpired ? t('scheduledActionSheet.expired') : formatTriggerTime(action.triggerTime)}
                  </span>
                  <span className="text-xs landscape:text-[10px] text-muted-foreground flex items-center gap-1">
                    {getRecurrenceIcon(action.recurrence)}
                    {formatRecurrence(action.recurrence)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="px-5 landscape:px-4 pt-4 landscape:pt-3 space-y-2 landscape:space-y-1.5">
            {/* Enable/Disable toggle */}
            <div className="flex items-center justify-between py-3 landscape:py-2 px-4 landscape:px-3 rounded-xl bg-muted/50">
              <div className="flex items-center gap-3 landscape:gap-2">
                <Clock className="h-5 w-5 landscape:h-4 landscape:w-4 text-muted-foreground" />
                <span className="font-medium landscape:text-sm">{t('scheduledActionSheet.enabled')}</span>
              </div>
              <Switch
                checked={action.enabled}
                onCheckedChange={handleToggleAction}
              />
            </div>

            {/* Edit button */}
            <Button
              variant="ghost"
              className="w-full justify-start h-12 landscape:h-10 px-4 landscape:px-3 gap-3 landscape:gap-2"
              onClick={handleEditAction}
            >
              <Edit2 className="h-5 w-5 landscape:h-4 landscape:w-4" />
              <span className="landscape:text-sm">{t('scheduledActionSheet.editAction')}</span>
            </Button>

            {/* Delete button */}
            <Button
              variant="ghost"
              className="w-full justify-start h-12 landscape:h-10 px-4 landscape:px-3 gap-3 landscape:gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleDeleteAction}
            >
              <Trash2 className="h-5 w-5 landscape:h-4 landscape:w-4" />
              <span className="landscape:text-sm">{t('scheduledActionSheet.deleteAction')}</span>
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('scheduledActionSheet.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('scheduledActionSheet.deleteDesc', { name: action.name })}
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
