// Scheduled Actions List - displays all scheduled actions in a sheet
import { useState, useRef, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { 
  FileText, 
  Link, 
  Phone, 
  Plus, 
  Trash2,
  Clock,
  Calendar,
  CalendarDays,
  CalendarClock,
  Pencil
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useScheduledActions } from '@/hooks/useScheduledActions';
import { formatTriggerTime, formatRecurrence } from '@/lib/scheduledActionsManager';
import { ScheduledActionEditor } from './ScheduledActionEditor';
import type { ScheduledAction, RecurrenceType } from '@/types/scheduledAction';
import { triggerHaptic } from '@/lib/haptics';

interface ScheduledActionsListProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNew: () => void;
}

export function ScheduledActionsList({ 
  isOpen, 
  onClose, 
  onCreateNew 
}: ScheduledActionsListProps) {
  const { actions, toggleAction, deleteScheduledAction } = useScheduledActions();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingAction, setEditingAction] = useState<ScheduledAction | null>(null);
  
  // Swipe-to-close gesture
  const startY = useRef(0);
  const currentY = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    currentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    currentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const deltaY = currentY.current - startY.current;
    
    if (scrollTop <= 0 && deltaY > 80) {
      triggerHaptic('light');
      onClose();
    }
  }, [onClose]);

  const handleToggle = async (id: string) => {
    triggerHaptic('light');
    await toggleAction(id);
  };

  const handleDelete = async (id: string) => {
    triggerHaptic('medium');
    setDeletingId(id);
    await deleteScheduledAction(id);
    setDeletingId(null);
  };

  const handleEdit = (action: ScheduledAction) => {
    triggerHaptic('light');
    setEditingAction(action);
  };

  const handleEditSaved = () => {
    setEditingAction(null);
  };

  const sortedActions = [...actions].sort((a, b) => {
    // Enabled first, then by trigger time
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.triggerTime - b.triggerTime;
  });

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent 
        side="bottom" 
        className="h-[85vh] rounded-t-3xl px-0 pb-0"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Grab handle */}
        <div className="flex justify-center pt-2 pb-4">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <SheetHeader className="px-5 pb-4">
          <SheetTitle className="text-lg font-semibold">Scheduled Actions</SheetTitle>
        </SheetHeader>

        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-5 pb-24"
        >
          {sortedActions.length === 0 ? (
            <EmptyState onCreateNew={onCreateNew} />
          ) : (
            <div className="space-y-3">
              {sortedActions.map((action) => (
                <ScheduledActionItem
                  key={action.id}
                  action={action}
                  isDeleting={deletingId === action.id}
                  onToggle={() => handleToggle(action.id)}
                  onDelete={() => handleDelete(action.id)}
                  onEdit={() => handleEdit(action)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Floating add button */}
        {sortedActions.length > 0 && (
          <div className="absolute bottom-6 left-0 right-0 px-5">
            <Button
              onClick={onCreateNew}
              className="w-full h-12 rounded-2xl gap-2 shadow-lg"
            >
              <Plus className="h-5 w-5" />
              Schedule new action
            </Button>
          </div>
        )}
      </SheetContent>

      {/* Edit dialog */}
      {editingAction && (
        <ScheduledActionEditor
          action={editingAction}
          isOpen={!!editingAction}
          onClose={() => setEditingAction(null)}
          onSaved={handleEditSaved}
        />
      )}
    </Sheet>
  );
}

// Empty state component
function EmptyState({ onCreateNew }: { onCreateNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <Clock className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-medium mb-2">No scheduled actions</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-[240px]">
        Schedule a file, link, or contact to open at a specific time.
      </p>
      <Button onClick={onCreateNew} className="gap-2">
        <Plus className="h-4 w-4" />
        Schedule your first action
      </Button>
    </div>
  );
}

// Individual action item
function ScheduledActionItem({ 
  action, 
  isDeleting,
  onToggle, 
  onDelete,
  onEdit 
}: { 
  action: ScheduledAction;
  isDeleting: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [showDelete, setShowDelete] = useState(false);

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

  return (
    <div 
      className={cn(
        "relative rounded-2xl bg-card border border-border p-4 transition-all",
        !action.enabled && "opacity-50",
        isDeleting && "opacity-30 pointer-events-none",
        isExpired && "border-destructive/30"
      )}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowDelete(!showDelete);
      }}
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
        <div className="flex items-center gap-1">
          {showDelete ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                  setShowDelete(false);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
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

      {/* Tap to show edit/delete, tap again to hide */}
      <button
        className="absolute inset-0 z-10"
        onClick={() => setShowDelete(!showDelete)}
        aria-label={showDelete ? 'Hide options' : 'Show options'}
      />
    </div>
  );
}
