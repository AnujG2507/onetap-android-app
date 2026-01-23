// Action sheet for a single scheduled action - similar to BookmarkActionSheet
import { useState, useRef, useCallback, useEffect } from 'react';
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
import { triggerHaptic } from '@/lib/haptics';
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
      case 'contact': return <Phone className="h-5 w-5" />;
    }
  };

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
          className="rounded-t-3xl px-0 pb-6"
        >
          {/* Grab handle */}
          <div 
            className="flex justify-center pt-2 pb-4 cursor-grab active:cursor-grabbing"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Action header */}
          <div className="px-5 pb-4 border-b">
            <div className="flex items-start gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                action.enabled 
                  ? 'bg-primary/10 text-primary' 
                  : 'bg-muted text-muted-foreground'
              }`}>
                {getDestinationIcon()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base truncate">{action.name}</h3>
                <p className="text-sm text-muted-foreground truncate">{getDestinationName()}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs ${isExpired ? 'text-muted-foreground' : 'text-primary'}`}>
                    {isExpired ? 'Expired' : formatTriggerTime(action.triggerTime)}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    {getRecurrenceIcon(action.recurrence)}
                    {formatRecurrence(action.recurrence)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="px-5 pt-4 space-y-2">
            {/* Enable/Disable toggle */}
            <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-muted/50">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Enabled</span>
              </div>
              <Switch
                checked={action.enabled}
                onCheckedChange={handleToggleAction}
              />
            </div>

            {/* Edit button */}
            <Button
              variant="ghost"
              className="w-full justify-start h-12 px-4 gap-3"
              onClick={handleEditAction}
            >
              <Edit2 className="h-5 w-5" />
              Edit action
            </Button>

            {/* Delete button */}
            <Button
              variant="ghost"
              className="w-full justify-start h-12 px-4 gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleDeleteAction}
            >
              <Trash2 className="h-5 w-5" />
              Delete action
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete scheduled action?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{action.name}" and cancel any scheduled alarms.
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
