// Scheduled Actions List - displays all scheduled actions in a sheet
// With search, filter, sort, selection mode, and bulk actions
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { 
  Plus, 
  Clock, 
  Shield, 
  Bell, 
  Check, 
  X, 
  Search,
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarClock,
  RefreshCw,
  Calendar,
  CalendarDays,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Sparkles,
  Link,
  Phone,
  ArrowRight,
} from 'lucide-react';
import { useScheduledActions } from '@/hooks/useScheduledActions';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
import { ScheduledActionEditor } from './ScheduledActionEditor';
import { ScheduledActionItem } from './ScheduledActionItem';
import { ScheduledActionActionSheet } from './ScheduledActionActionSheet';
import type { ScheduledAction, RecurrenceType } from '@/types/scheduledAction';
import { 
  getSelectedIds, 
  toggleSelection, 
  clearSelection, 
  selectAll,
  onSelectionChange,
  getSortPreferences,
  saveSortPreferences,
  type SortMode,
} from '@/lib/scheduledActionsManager';
import { triggerHaptic } from '@/lib/haptics';
import { useToast } from '@/hooks/use-toast';
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

interface ScheduledActionsListProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNew: () => void;
  onGoToNotifications?: () => void;
}

interface PermissionStatus {
  notifications: boolean;
  alarms: boolean;
  checked: boolean;
}

const RECURRENCE_FILTERS: { value: RecurrenceType | 'all'; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'All', icon: null },
  { value: 'once', label: 'Once', icon: <Clock className="h-3 w-3" /> },
  { value: 'daily', label: 'Daily', icon: <RefreshCw className="h-3 w-3" /> },
  { value: 'weekly', label: 'Weekly', icon: <CalendarDays className="h-3 w-3" /> },
  { value: 'yearly', label: 'Yearly', icon: <Calendar className="h-3 w-3" /> },
];

export function ScheduledActionsList({ 
  isOpen, 
  onClose, 
  onCreateNew,
  onGoToNotifications,
}: ScheduledActionsListProps) {
  const { 
    actions, 
    toggleAction, 
    deleteScheduledAction, 
    checkPermissions,
    requestPermissions,
    openAlarmSettings,
  } = useScheduledActions();
  
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingAction, setEditingAction] = useState<ScheduledAction | null>(null);
  const [actionSheetAction, setActionSheetAction] = useState<ScheduledAction | null>(null);
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>({
    notifications: false,
    alarms: false,
    checked: false,
  });
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [recurrenceFilter, setRecurrenceFilter] = useState<RecurrenceType | 'all'>('all');
  
  // Sort state
  const [sortMode, setSortMode] = useState<SortMode>(() => getSortPreferences().mode);
  const [sortReversed, setSortReversed] = useState(() => getSortPreferences().reversed);
  
  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  
  // Scroll state for hiding bottom button
  const [isBottomButtonVisible, setIsBottomButtonVisible] = useState(true);
  const lastScrollTop = useRef(0);
  
  const { toast } = useToast();

  // Register internal sheets with back button handler
  const handleCloseActionSheet = useCallback(() => setActionSheetAction(null), []);
  const handleCloseEditor = useCallback(() => setEditingAction(null), []);
  const handleCloseBulkDeleteConfirm = useCallback(() => setShowBulkDeleteConfirm(false), []);
  
  useSheetBackHandler('scheduled-list-action-sheet', !!actionSheetAction, handleCloseActionSheet, 5);
  useSheetBackHandler('scheduled-list-editor', !!editingAction, handleCloseEditor, 5);
  useSheetBackHandler('scheduled-list-bulk-delete', showBulkDeleteConfirm, handleCloseBulkDeleteConfirm, 10);
  
  // Swipe-to-close gesture - only from grab handle area
  const startY = useRef(0);
  const currentY = useRef(0);
  const isSwipingFromGrabHandle = useRef(false);

  // Load selection state and subscribe to changes
  useEffect(() => {
    const loadSelection = () => {
      setSelectedIds(getSelectedIds());
    };
    loadSelection();
    const unsubscribe = onSelectionChange(loadSelection);
    return unsubscribe;
  }, []);

  // Exit selection mode when all items are deselected
  useEffect(() => {
    if (isSelectionMode && selectedIds.size === 0) {
      setIsSelectionMode(false);
    }
  }, [selectedIds.size, isSelectionMode]);

  // Clear search/filter/selection when sheet closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setRecurrenceFilter('all');
      setIsSelectionMode(false);
      clearSelection();
    }
  }, [isOpen]);

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

  // Computed: filter counts
  const filterCounts = useMemo(() => {
    const counts: Record<RecurrenceType | 'all', number> = {
      all: actions.length,
      once: 0,
      daily: 0,
      weekly: 0,
      yearly: 0,
    };
    actions.forEach(a => {
      counts[a.recurrence]++;
    });
    return counts;
  }, [actions]);

  // Computed: filtered and sorted actions
  const filteredActions = useMemo(() => {
    let result = [...actions];
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(a => 
        a.name.toLowerCase().includes(query) ||
        (a.destination.type === 'url' && a.destination.uri.toLowerCase().includes(query)) ||
        (a.destination.type === 'file' && a.destination.name.toLowerCase().includes(query)) ||
        (a.destination.type === 'contact' && a.destination.contactName.toLowerCase().includes(query))
      );
    }
    
    // Apply recurrence filter
    if (recurrenceFilter !== 'all') {
      result = result.filter(a => a.recurrence === recurrenceFilter);
    }
    
    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortMode) {
        case 'next':
          // Enabled first, then by trigger time
          if (a.enabled !== b.enabled) {
            comparison = a.enabled ? -1 : 1;
          } else {
            comparison = a.triggerTime - b.triggerTime;
          }
          break;
          
        case 'alphabetical':
          comparison = a.name.localeCompare(b.name);
          break;
          
        case 'recurrence':
          const order: RecurrenceType[] = ['once', 'daily', 'weekly', 'yearly'];
          comparison = order.indexOf(a.recurrence) - order.indexOf(b.recurrence);
          if (comparison === 0) {
            comparison = a.triggerTime - b.triggerTime;
          }
          break;
      }
      
      return sortReversed ? -comparison : comparison;
    });
    
    return result;
  }, [actions, searchQuery, recurrenceFilter, sortMode, sortReversed]);

  // Handlers
  const handleGrabHandleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    currentY.current = e.touches[0].clientY;
    isSwipingFromGrabHandle.current = true;
  }, []);

  const handleGrabHandleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isSwipingFromGrabHandle.current) return;
    currentY.current = e.touches[0].clientY;
  }, []);

  const handleGrabHandleTouchEnd = useCallback(() => {
    if (!isSwipingFromGrabHandle.current) return;
    
    const deltaY = currentY.current - startY.current;
    if (deltaY > 80) {
      triggerHaptic('light');
      onClose();
    }
    isSwipingFromGrabHandle.current = false;
  }, [onClose]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const scrollDelta = scrollTop - lastScrollTop.current;
    
    // Show button when at top
    if (scrollTop <= 10) {
      setIsBottomButtonVisible(true);
    }
    // Show button when scrolling up (any amount)
    else if (scrollDelta < -2) {
      setIsBottomButtonVisible(true);
    }
    // Hide button when scrolling down (any amount)
    else if (scrollDelta > 2) {
      setIsBottomButtonVisible(false);
    }
    
    lastScrollTop.current = scrollTop;
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
    setActionSheetAction(null);
  };

  const handleItemTap = (action: ScheduledAction) => {
    setActionSheetAction(action);
  };

  const handleEdit = (action: ScheduledAction) => {
    triggerHaptic('light');
    setEditingAction(action);
  };

  const handleEditSaved = () => {
    setEditingAction(null);
  };

  const handleEnterSelectionMode = () => {
    setIsSelectionMode(true);
  };

  const handleToggleSelection = (id: string) => {
    toggleSelection(id);
  };

  const handleSelectAll = () => {
    triggerHaptic('light');
    const allFilteredIds = filteredActions.map(a => a.id);
    allFilteredIds.forEach(id => {
      if (!selectedIds.has(id)) {
        toggleSelection(id);
      }
    });
  };

  const handleClearSelection = () => {
    triggerHaptic('light');
    clearSelection();
    setIsSelectionMode(false);
    toast({ description: 'Selection cleared' });
  };

  const handleBulkEnable = async () => {
    triggerHaptic('medium');
    const idsToEnable = [...selectedIds].filter(id => {
      const action = actions.find(a => a.id === id);
      return action && !action.enabled;
    });
    
    for (const id of idsToEnable) {
      await toggleAction(id);
    }
    
    toast({ description: `Enabled ${idsToEnable.length} action${idsToEnable.length !== 1 ? 's' : ''}` });
    clearSelection();
    setIsSelectionMode(false);
  };

  const handleBulkDisable = async () => {
    triggerHaptic('medium');
    const idsToDisable = [...selectedIds].filter(id => {
      const action = actions.find(a => a.id === id);
      return action && action.enabled;
    });
    
    for (const id of idsToDisable) {
      await toggleAction(id);
    }
    
    toast({ description: `Disabled ${idsToDisable.length} action${idsToDisable.length !== 1 ? 's' : ''}` });
    clearSelection();
    setIsSelectionMode(false);
  };

  const handleBulkDelete = async () => {
    triggerHaptic('medium');
    const count = selectedIds.size;
    
    for (const id of selectedIds) {
      await deleteScheduledAction(id);
    }
    
    toast({ description: `Deleted ${count} action${count !== 1 ? 's' : ''}` });
    clearSelection();
    setIsSelectionMode(false);
    setShowBulkDeleteConfirm(false);
  };

  const handleSortModeChange = (mode: SortMode) => {
    triggerHaptic('light');
    setSortMode(mode);
    saveSortPreferences({ mode, reversed: sortReversed });
  };

  const handleSortReversedToggle = () => {
    triggerHaptic('light');
    const newReversed = !sortReversed;
    setSortReversed(newReversed);
    saveSortPreferences({ mode: sortMode, reversed: newReversed });
  };

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

  const allPermissionsGranted = permissionStatus.notifications && permissionStatus.alarms;
  const allSelected = filteredActions.length > 0 && filteredActions.every(a => selectedIds.has(a.id));

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent 
        side="bottom" 
        className="h-[85vh] rounded-t-3xl px-0 pb-0 flex flex-col"
      >
        {/* Grab handle - swipe to close only from here */}
        <div 
          className="flex justify-center pt-2 pb-4 shrink-0 cursor-grab active:cursor-grabbing"
          onTouchStart={handleGrabHandleTouchStart}
          onTouchMove={handleGrabHandleTouchMove}
          onTouchEnd={handleGrabHandleTouchEnd}
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <SheetHeader className="px-5 pb-3 shrink-0">
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
                {isRequestingPermissions ? 'Requesting...' : allPermissionsGranted ? 'OK' : 'Permissions'}
              </Button>
            </div>
          </div>
          
          {/* Permission Status Indicator */}
          {permissionStatus.checked && !allPermissionsGranted && (
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

        {/* Search input */}
        {actions.length > 0 && (
        <div className="px-5 pb-3 shrink-0">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search actions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ps-9 pe-9 h-10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filter bar */}
        {actions.length > 0 && (
          <div className="px-5 pb-3 shrink-0">
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {RECURRENCE_FILTERS.map(filter => {
                const count = filterCounts[filter.value];
                if (filter.value !== 'all' && count === 0) return null;
                
                const isActive = recurrenceFilter === filter.value;
                return (
                  <button
                    key={filter.value}
                    onClick={() => {
                      triggerHaptic('light');
                      setRecurrenceFilter(filter.value);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                      isActive 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {filter.icon}
                    {filter.label}
                    {count > 0 && (
                      <Badge variant={isActive ? "secondary" : "outline"} className="h-4 px-1 text-[10px]">
                        {count}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Sort controls */}
        {actions.length > 0 && (
          <div className="px-5 pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <TooltipProvider delayDuration={500}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={sortMode === 'next' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleSortModeChange('next')}
                      className="h-7 px-2 text-xs"
                    >
                      <CalendarClock className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Sort by next trigger</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={sortMode === 'alphabetical' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleSortModeChange('alphabetical')}
                      className="h-7 px-2 text-xs"
                    >
                      <ArrowDownAZ className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Sort alphabetically</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={sortMode === 'recurrence' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleSortModeChange('recurrence')}
                      className="h-7 px-2 text-xs"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Group by recurrence</TooltipContent>
                </Tooltip>

                <div className="flex-1" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSortReversedToggle}
                      className="h-7 px-2 text-xs"
                    >
                      {sortReversed ? <ArrowUpAZ className="h-3.5 w-3.5" /> : <ArrowDownAZ className="h-3.5 w-3.5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{sortReversed ? 'Reversed order' : 'Normal order'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}

        {/* Select all row */}
        {isSelectionMode && filteredActions.length > 0 && (
          <div className="px-5 pb-3 shrink-0">
            <div className="flex items-center justify-between bg-muted/50 rounded-xl p-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => {
                    if (allSelected) {
                      handleClearSelection();
                    } else {
                      handleSelectAll();
                    }
                  }}
                />
                <span className="text-sm font-medium">
                  {selectedIds.size} selected
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSelection}
                className="text-xs"
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        <ScrollArea 
          className="flex-1 px-5"
          onScrollCapture={handleScroll}
        >
          <div className="pb-28">
            {filteredActions.length === 0 ? (
              searchQuery || recurrenceFilter !== 'all' ? (
                <NoResultsState onClearFilters={() => {
                  setSearchQuery('');
                  setRecurrenceFilter('all');
                }} />
              ) : (
                <EmptyState onCreateNew={onCreateNew} />
              )
            ) : (
              <div className="space-y-3">
                {filteredActions.map((action) => (
                  <ScheduledActionItem
                    key={action.id}
                    action={action}
                    isDeleting={deletingId === action.id}
                    isSelected={selectedIds.has(action.id)}
                    isSelectionMode={isSelectionMode}
                    onTap={() => handleItemTap(action)}
                    onToggle={() => handleToggle(action.id)}
                    onDelete={() => handleDelete(action.id)}
                    onToggleSelection={() => handleToggleSelection(action.id)}
                    onEnterSelectionMode={handleEnterSelectionMode}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Floating bulk action bar (when selection mode active) */}
        {isSelectionMode && selectedIds.size > 0 && (
          <div className="absolute bottom-6 inset-x-0 px-5 shrink-0 z-10">
            <div className="bg-card border rounded-2xl shadow-lg p-3 flex items-center gap-2">
              <span className="text-sm font-medium text-foreground me-2">
                {selectedIds.size} selected
              </span>
              <div className="h-5 w-px bg-border" />
              <TooltipProvider delayDuration={500}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleBulkEnable}
                      className="h-9 w-9"
                    >
                      <ToggleRight className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Enable selected</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleBulkDisable}
                      className="h-9 w-9"
                    >
                      <ToggleLeft className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Disable selected</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowBulkDeleteConfirm(true)}
                      className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete selected</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="h-5 w-px bg-border" />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearSelection}
                className="h-9 w-9 text-muted-foreground"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        )}

        {/* Floating add button (when not in selection mode) */}
        <div 
          className={cn(
            "absolute inset-x-0 px-5 pb-4 transition-all duration-300 ease-out",
            "bottom-0",
            isBottomButtonVisible && !isSelectionMode && actions.length > 0
              ? "translate-y-0 opacity-100"
              : "translate-y-full opacity-0 pointer-events-none"
          )}
        >
          <Button
            onClick={onCreateNew}
            className="w-full h-12 rounded-2xl gap-2 shadow-lg"
          >
            <Plus className="h-5 w-5" />
            Schedule new action
          </Button>
        </div>
      </SheetContent>

      {/* Action sheet for individual item */}
      <ScheduledActionActionSheet
        action={actionSheetAction}
        open={!!actionSheetAction}
        onOpenChange={(open) => !open && setActionSheetAction(null)}
        onToggle={(id) => handleToggle(id)}
        onEdit={(action) => {
          setActionSheetAction(null);
          handleEdit(action);
        }}
        onDelete={(id) => handleDelete(id)}
      />

      {/* Edit dialog */}
      {editingAction && (
        <ScheduledActionEditor
          action={editingAction}
          isOpen={!!editingAction}
          onClose={() => setEditingAction(null)}
          onSaved={handleEditSaved}
        />
      )}

      {/* Bulk delete confirmation */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} action{selectedIds.size !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected scheduled actions and cancel any scheduled alarms.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

// Empty state component with animation
function EmptyState({ onCreateNew }: { 
  onCreateNew: () => void; 
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center relative">
      {/* Animated floating icons */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <Clock className="absolute top-8 left-8 h-6 w-6 text-primary/20 animate-float" />
        <Calendar className="absolute top-12 right-12 h-5 w-5 text-primary/15 animate-float-delayed" />
        <Bell className="absolute bottom-16 left-12 h-5 w-5 text-primary/20 animate-float" />
        <Link className="absolute top-24 left-1/4 h-4 w-4 text-primary/10 animate-float-delayed" />
        <Phone className="absolute bottom-24 right-16 h-4 w-4 text-primary/15 animate-float" />
      </div>
      
      {/* Main icon with glow */}
      <div className="relative mb-4">
        <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl scale-150" />
        <div className="relative w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <CalendarClock className="h-8 w-8 text-primary" />
        </div>
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

// No results state
function NoResultsState({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
        <Search className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-medium mb-2">No actions match your filter</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Try adjusting your search or filter.
      </p>
      <Button variant="outline" size="sm" onClick={onClearFilters}>
        Clear filters
      </Button>
    </div>
  );
}
