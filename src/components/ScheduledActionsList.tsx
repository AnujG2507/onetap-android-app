// Scheduled Actions List - displays all scheduled actions in a sheet
import { useState, useRef, useCallback, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Plus, Clock, Bug, Shield, Bell, Check, X } from 'lucide-react';
import { useScheduledActions } from '@/hooks/useScheduledActions';
import { ScheduledActionEditor } from './ScheduledActionEditor';
import { ScheduledActionItem } from './ScheduledActionItem';
import type { ScheduledAction } from '@/types/scheduledAction';
import { triggerHaptic } from '@/lib/haptics';
import { useToast } from '@/hooks/use-toast';

interface ScheduledActionsListProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNew: () => void;
}

interface PermissionStatus {
  notifications: boolean;
  alarms: boolean;
  checked: boolean;
}

export function ScheduledActionsList({ 
  isOpen, 
  onClose, 
  onCreateNew 
}: ScheduledActionsListProps) {
  const { 
    actions, 
    toggleAction, 
    deleteScheduledAction, 
    createScheduledAction, 
    checkPermissions,
    requestPermissions,
    openAlarmSettings,
  } = useScheduledActions();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingAction, setEditingAction] = useState<ScheduledAction | null>(null);
  const [isTestingAlarm, setIsTestingAlarm] = useState(false);
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>({
    notifications: false,
    alarms: false,
    checked: false,
  });
  const { toast } = useToast();
  
  // Swipe-to-close gesture
  const startY = useRef(0);
  const currentY = useRef(0);
  const isAtTop = useRef(true);

  // Check permissions when sheet opens
  useEffect(() => {
    if (isOpen && !permissionStatus.checked) {
      checkPermissions().then(status => {
        setPermissionStatus({
          notifications: status.notifications,
          alarms: status.alarms,
          checked: true,
        });
      });
    }
  }, [isOpen, permissionStatus.checked, checkPermissions]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    currentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    currentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const deltaY = currentY.current - startY.current;
    
    if (isAtTop.current && deltaY > 80) {
      triggerHaptic('light');
      onClose();
    }
  }, [onClose]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    isAtTop.current = e.currentTarget.scrollTop <= 0;
  }, []);

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

  // Request all permissions at once
  const handleRequestAllPermissions = async () => {
    triggerHaptic('medium');
    setIsRequestingPermissions(true);
    
    try {
      const result = await requestPermissions();
      
      setPermissionStatus({
        notifications: result.notifications,
        alarms: result.alarms,
        checked: true,
      });

      if (result.notifications && result.alarms) {
        toast({
          title: 'All permissions granted!',
          description: 'Scheduled actions will work correctly.',
        });
      } else if (!result.alarms) {
        toast({
          title: 'Please enable exact alarms',
          description: 'Tap to open settings and enable "Alarms & reminders".',
          action: <Button size="sm" variant="outline" onClick={() => openAlarmSettings()}>Open Settings</Button>,
          duration: 8000,
        });
      } else if (!result.notifications) {
        toast({
          title: 'Notification permission denied',
          description: "You won't receive reminders without notification permission.",
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Permission request error:', error);
      toast({
        title: 'Failed to request permissions',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setIsRequestingPermissions(false);
    }
  };

  // Test alarm: creates a scheduled action that fires in 10 seconds
  const handleTestAlarm = async () => {
    setIsTestingAlarm(true);
    triggerHaptic('medium');
    
    try {
      // Create a test action that fires in 10 seconds
      const triggerTime = Date.now() + 10 * 1000;
      console.log('[TestAlarm] Creating test action with triggerTime:', triggerTime, 'which is', new Date(triggerTime).toISOString());
      
      const action = await createScheduledAction({
        name: `Test Alarm (${new Date(triggerTime).toLocaleTimeString()})`,
        destination: {
          type: 'url',
          uri: 'https://example.com/test-alarm',
          name: 'Test Alarm URL',
        },
        triggerTime,
        recurrence: 'once',
        recurrenceAnchor: { hour: new Date(triggerTime).getHours(), minute: new Date(triggerTime).getMinutes() },
      });
      
      if (action) {
        console.log('[TestAlarm] Test action created successfully:', action.id);
        toast({
          title: 'Test alarm scheduled',
          description: 'You should receive a notification in ~10 seconds.',
        });
      } else {
        console.error('[TestAlarm] Failed to create test action');
        toast({
          title: 'Test failed',
          description: 'Could not create test alarm. Check console logs.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('[TestAlarm] Error creating test alarm:', error);
      toast({
        title: 'Test failed',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setIsTestingAlarm(false);
    }
  };

  const allPermissionsGranted = permissionStatus.notifications && permissionStatus.alarms;

  const sortedActions = [...actions].sort((a, b) => {
    // Enabled first, then by trigger time
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.triggerTime - b.triggerTime;
  });

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent 
        side="bottom" 
        className="h-[85vh] rounded-t-3xl px-0 pb-0 flex flex-col"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Grab handle */}
        <div className="flex justify-center pt-2 pb-4 shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <SheetHeader className="px-5 pb-4 shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold">Scheduled Actions</SheetTitle>
            <div className="flex gap-2">
              <Button
                variant={allPermissionsGranted ? "outline" : "default"}
                size="sm"
                onClick={handleRequestAllPermissions}
                disabled={isRequestingPermissions}
                className="text-xs gap-1.5 h-8"
              >
                <Shield className="h-3.5 w-3.5" />
                {isRequestingPermissions ? 'Requesting...' : allPermissionsGranted ? 'Permissions OK' : 'Grant Permissions'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleTestAlarm}
                disabled={isTestingAlarm}
                className="text-xs gap-1.5 h-8 text-muted-foreground hover:text-foreground"
              >
                <Bug className="h-3.5 w-3.5" />
                {isTestingAlarm ? 'Testing...' : 'Test Alarm'}
              </Button>
            </div>
          </div>
          
          {/* Permission Status Indicator */}
          {permissionStatus.checked && (
            <div className="flex gap-3 mt-2 text-xs">
              <div className={`flex items-center gap-1 ${permissionStatus.notifications ? 'text-green-600' : 'text-destructive'}`}>
                <Bell className="h-3 w-3" />
                <span>Notifications</span>
                {permissionStatus.notifications ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              </div>
              <div className={`flex items-center gap-1 ${permissionStatus.alarms ? 'text-green-600' : 'text-destructive'}`}>
                <Clock className="h-3 w-3" />
                <span>Alarms</span>
                {permissionStatus.alarms ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              </div>
            </div>
          )}
        </SheetHeader>

        <ScrollArea 
          className="flex-1 px-5"
          onScrollCapture={handleScroll}
        >
          <div className="pb-24">
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
        </ScrollArea>

        {/* Floating add button */}
        {sortedActions.length > 0 && (
          <div className="absolute bottom-6 left-0 right-0 px-5 shrink-0">
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
