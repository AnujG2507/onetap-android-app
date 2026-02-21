// Notifications Page - Full-page view for managing scheduled actions
// With search, filter, sort, selection mode, and bulk actions
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
  Link,
  Phone,
  HelpCircle,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { useScheduledActions } from '@/hooks/useScheduledActions';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
import { useTutorial } from '@/hooks/useTutorial';
import { ScheduledActionEditor } from './ScheduledActionEditor';
import { ScheduledActionItem } from './ScheduledActionItem';
import { ScheduledActionActionSheet } from './ScheduledActionActionSheet';
import { ScheduledActionCreator } from './ScheduledActionCreator';
import { AppMenu } from './AppMenu';
import { TrashSheet } from './TrashSheet';
import { SettingsPage } from './SettingsPage';
import { EmptyStateWithValueProp } from './EmptyStateWithValueProp';
import { TutorialCoachMarks } from './TutorialCoachMarks';
import { BatteryOptimizationHelp } from './BatteryOptimizationHelp';
import { MissedNotificationsBanner } from './MissedNotificationsBanner';
import { PermissionWarningBanner } from './PermissionWarningBanner';
import type { ScheduledAction, RecurrenceType, ScheduledActionDestination } from '@/types/scheduledAction';
import { 
  getSelectedIds, 
  toggleSelection, 
  clearSelection, 
  selectAll,
  onSelectionChange,
  getSortPreferences,
  saveSortPreferences,
  formatTriggerTime,
  formatRecurrence,
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

interface NotificationsPageProps {
  onSelectionModeChange?: (isSelectionMode: boolean) => void;
  clearSelectionSignal?: number;
  /** Initial destination for creating a reminder (from Access tab) */
  initialDestination?: ScheduledActionDestination | null;
  /** Called when the initial destination has been consumed */
  onInitialDestinationConsumed?: () => void;
  /** Called when the creator form is opened or closed */
  onCreatorOpenChange?: (isOpen: boolean) => void;
  /** Called when the editor is opened or closed */
  onEditorOpenChange?: (isOpen: boolean) => void;
}

interface PermissionStatus {
  notifications: boolean;
  alarms: boolean;
  checked: boolean;
}

type StatusFilter = 'all' | 'active' | 'disabled' | 'expired';

const RECURRENCE_FILTERS: { value: RecurrenceType | 'all'; labelKey: string; icon: React.ReactNode }[] = [
  { value: 'all', labelKey: 'notificationsPage.filterAll', icon: null },
  { value: 'once', labelKey: 'notificationsPage.filterOnce', icon: <Clock className="h-3 w-3" /> },
  { value: 'daily', labelKey: 'notificationsPage.filterDaily', icon: <RefreshCw className="h-3 w-3" /> },
  { value: 'weekly', labelKey: 'notificationsPage.filterWeekly', icon: <CalendarDays className="h-3 w-3" /> },
  { value: 'yearly', labelKey: 'notificationsPage.filterYearly', icon: <Calendar className="h-3 w-3" /> },
];

const STATUS_FILTERS: { value: StatusFilter; labelKey: string; icon: React.ReactNode }[] = [
  { value: 'all', labelKey: 'notificationsPage.statusAll', icon: null },
  { value: 'active', labelKey: 'notificationsPage.statusActive', icon: <CheckCircle2 className="h-3 w-3" /> },
  { value: 'disabled', labelKey: 'notificationsPage.statusDisabled', icon: <XCircle className="h-3 w-3" /> },
  { value: 'expired', labelKey: 'notificationsPage.statusExpired', icon: <AlertCircle className="h-3 w-3" /> },
];

export function NotificationsPage({ 
  onSelectionModeChange,
  clearSelectionSignal,
  initialDestination,
  onInitialDestinationConsumed,
  onCreatorOpenChange,
  onEditorOpenChange,
}: NotificationsPageProps) {
  const { t } = useTranslation();
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
  const [actionSheetActionId, setActionSheetActionId] = useState<string | null>(null);
  
  // Derive fresh action from actions array to keep sheet in sync with state changes
  const actionSheetAction = useMemo(() => 
    actions.find(a => a.id === actionSheetActionId) ?? null,
    [actions, actionSheetActionId]
  );
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>({
    notifications: false,
    alarms: false,
    checked: false,
  });
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [recurrenceFilter, setRecurrenceFilter] = useState<RecurrenceType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  
  // Sort state
  const [sortMode, setSortMode] = useState<SortMode>(() => getSortPreferences().mode);
  const [sortReversed, setSortReversed] = useState(() => getSortPreferences().reversed);
  
  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  
  // Creator mode - track the destination for the creator
  const [showCreator, setShowCreator] = useState(false);
  const [creatorDestination, setCreatorDestination] = useState<ScheduledActionDestination | null>(null);
  const processedDestinationRef = useRef<string | null>(null);
  
  // Trash state
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  
  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  
  // Battery help state
  const [isBatteryHelpOpen, setIsBatteryHelpOpen] = useState(false);
  
  // Scroll state for hiding bottom button
  const [isBottomButtonVisible, setIsBottomButtonVisible] = useState(true);
  const lastScrollTop = useRef(0);
  
  const { toast } = useToast();
  const tutorial = useTutorial('reminders', { ready: actions.length > 0 });

  // Register sheets with back button handler
  const handleCloseActionSheet = useCallback(() => setActionSheetActionId(null), []);
  const handleCloseEditor = useCallback(() => setEditingAction(null), []);
  const handleCloseBulkDeleteConfirm = useCallback(() => setShowBulkDeleteConfirm(false), []);
  const handleCloseCreator = useCallback(() => setShowCreator(false), []);
  const handleCloseTrash = useCallback(() => setIsTrashOpen(false), []);
  const handleCloseSettings = useCallback(() => setShowSettings(false), []);
  
  useSheetBackHandler('notifications-action-sheet', !!actionSheetAction, handleCloseActionSheet);
  useSheetBackHandler('notifications-editor', !!editingAction, handleCloseEditor);
  useSheetBackHandler('notifications-bulk-delete-confirm', showBulkDeleteConfirm, handleCloseBulkDeleteConfirm, 10);
  useSheetBackHandler('notifications-creator', showCreator, handleCloseCreator);
  useSheetBackHandler('notifications-trash-sheet', isTrashOpen, handleCloseTrash);
  useSheetBackHandler('notifications-settings-page', showSettings, handleCloseSettings);

  // Load selection state and subscribe to changes
  useEffect(() => {
    const loadSelection = () => {
      setSelectedIds(getSelectedIds());
    };
    loadSelection();
    const unsubscribe = onSelectionChange(loadSelection);
    return unsubscribe;
  }, []);

  // Notify parent of selection mode changes
  useEffect(() => {
    onSelectionModeChange?.(isSelectionMode);
  }, [isSelectionMode, onSelectionModeChange]);

  // Notify parent when creator is opened/closed
  useEffect(() => {
    onCreatorOpenChange?.(showCreator);
  }, [showCreator, onCreatorOpenChange]);

  // Notify parent when editor is opened/closed
  useEffect(() => {
    onEditorOpenChange?.(!!editingAction);
  }, [editingAction, onEditorOpenChange]);

  // Exit selection mode when all items are deselected
  useEffect(() => {
    if (isSelectionMode && selectedIds.size === 0) {
      setIsSelectionMode(false);
    }
  }, [selectedIds.size, isSelectionMode]);

  // Clear selection when clearSelectionSignal changes
  useEffect(() => {
    if (clearSelectionSignal && clearSelectionSignal > 0) {
      clearSelection();
      setIsSelectionMode(false);
    }
  }, [clearSelectionSignal]);

  // Handle initial destination from Access tab
  useEffect(() => {
    if (initialDestination) {
      const destKey = JSON.stringify(initialDestination);
      if (processedDestinationRef.current !== destKey) {
        processedDestinationRef.current = destKey;
        setCreatorDestination(initialDestination);
        setShowCreator(true);
        onInitialDestinationConsumed?.();
      }
    }
  }, [initialDestination, onInitialDestinationConsumed]);

  // Check permissions on mount
  useEffect(() => {
    if (!permissionStatus.checked) {
      checkPermissions().then(status => {
        setPermissionStatus({
          notifications: status.notifications,
          alarms: status.alarms,
          checked: true,
        });
      });
    }
  }, [permissionStatus.checked, checkPermissions]);

  // Helper to determine action status
  const getActionStatus = useCallback((action: ScheduledAction): 'active' | 'disabled' | 'expired' => {
    const isPast = action.triggerTime < Date.now() && action.recurrence === 'once';
    if (!action.enabled) return 'disabled';
    if (isPast) return 'expired';
    return 'active';
  }, []);

  // Computed: filter counts (recurrence)
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

  // Computed: status counts
  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: actions.length,
      active: 0,
      disabled: 0,
      expired: 0,
    };
    actions.forEach(a => {
      counts[getActionStatus(a)]++;
    });
    return counts;
  }, [actions, getActionStatus]);

  // Computed: filtered and sorted actions
  const filteredActions = useMemo(() => {
    let result = [...actions];
    
    // Apply search filter (includes name, destination, and time description)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(a => {
        // Search by name
        if (a.name.toLowerCase().includes(query)) return true;
        
        // Search by destination
        if (a.destination.type === 'url' && a.destination.uri.toLowerCase().includes(query)) return true;
        if (a.destination.type === 'file' && a.destination.name.toLowerCase().includes(query)) return true;
        if (a.destination.type === 'contact' && a.destination.contactName.toLowerCase().includes(query)) return true;
        
        // Search by time description (Today, Tomorrow, day names, dates)
        const timeDesc = formatTriggerTime(a.triggerTime).toLowerCase();
        if (timeDesc.includes(query)) return true;
        
        // Search by recurrence type
        const recurrenceDesc = formatRecurrence(a.recurrence).toLowerCase();
        if (recurrenceDesc.includes(query)) return true;
        
        return false;
      });
    }
    
    // Apply recurrence filter
    if (recurrenceFilter !== 'all') {
      result = result.filter(a => a.recurrence === recurrenceFilter);
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter(a => getActionStatus(a) === statusFilter);
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
  }, [actions, searchQuery, recurrenceFilter, statusFilter, sortMode, sortReversed, getActionStatus]);

  // Check if any filters are active
  const hasActiveFilters = searchQuery.trim() || recurrenceFilter !== 'all' || statusFilter !== 'all';

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setRecurrenceFilter('all');
    setStatusFilter('all');
    triggerHaptic('light');
  }, []);

  // Handlers
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
    setActionSheetActionId(null);
  };

  const handleItemTap = (action: ScheduledAction) => {
    setActionSheetActionId(action.id);
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
    toast({ description: t('notificationsPage.selectionCleared') });
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
    
    toast({ description: t('notificationsPage.bulkEnabled', { count: idsToEnable.length }) });
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
    
    toast({ description: t('notificationsPage.bulkDisabled', { count: idsToDisable.length }) });
    clearSelection();
    setIsSelectionMode(false);
  };

  const handleBulkDelete = async () => {
    triggerHaptic('medium');
    const count = selectedIds.size;
    
    for (const id of selectedIds) {
      await deleteScheduledAction(id);
    }
    
    toast({ description: t('notificationsPage.bulkDeleted', { count }) });
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
          title: t('notificationsPage.permissionsGranted'),
          description: t('notificationsPage.permissionsGrantedDesc'),
        });
      } else if (!result.alarms) {
        toast({
          title: t('notificationsPage.enableAlarms'),
          description: t('notificationsPage.enableAlarmsDesc'),
          action: <Button size="sm" variant="outline" onClick={() => openAlarmSettings()}>{t('notificationsPage.openSettings')}</Button>,
          duration: 8000,
        });
      } else if (!result.notifications) {
        toast({
          title: t('notificationsPage.notificationDenied'),
          description: t('notificationsPage.notificationDeniedDesc'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Permission request error:', error);
      toast({
        title: t('notificationsPage.permissionsFailed'),
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setIsRequestingPermissions(false);
    }
  };

  const handleCreateNew = () => {
    setCreatorDestination(null);
    setShowCreator(true);
  };

  const handleCreatorComplete = () => {
    setShowCreator(false);
    setCreatorDestination(null);
  };

  const handleCreatorBack = () => {
    setShowCreator(false);
    setCreatorDestination(null);
  };

  const allPermissionsGranted = permissionStatus.notifications && permissionStatus.alarms;
  const allSelected = filteredActions.length > 0 && filteredActions.every(a => selectedIds.has(a.id));

  // Show creator view
  if (showCreator) {
    return (
      <ScheduledActionCreator
        onComplete={handleCreatorComplete}
        onBack={handleCreatorBack}
        initialDestination={creatorDestination || undefined}
      />
    );
  }
  // Show settings page
  if (showSettings) {
    return <SettingsPage onBack={() => setShowSettings(false)} />;
  }

  return (
    <div className="flex-1 flex flex-col pb-[calc(3.5rem+var(--android-safe-bottom,0px)+1rem)]">
      {/* Header */}
      <header className="ps-5 pe-5 pt-header-safe pb-4 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Bell className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">{t('notificationsPage.title')}</h1>
          </div>
          <div className="flex gap-2">
            <TooltipProvider delayDuration={500}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={allPermissionsGranted ? "outline" : "default"}
                    size="sm"
                    onClick={handleRequestAllPermissions}
                    disabled={isRequestingPermissions}
                    className="text-xs gap-1.5 h-8"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    {isRequestingPermissions ? t('notificationsPage.requesting') : allPermissionsGranted ? t('notificationsPage.ok') : t('notificationsPage.permissions')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {allPermissionsGranted ? t('notificationsPage.allPermissionsGranted') : t('notificationsPage.grantPermissions')}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsBatteryHelpOpen(true)}
                    className="text-xs gap-1.5 h-8"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t('batteryHelp.helpButton')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <AppMenu onOpenTrash={() => setIsTrashOpen(true)} onOpenSettings={() => setShowSettings(true)} />
          </div>
        </div>
        
        {/* Permission Status Indicator */}
        {permissionStatus.checked && !allPermissionsGranted && (
          <div className="flex gap-3 mt-2 text-xs">
            <div className={`flex items-center gap-1 ${permissionStatus.notifications ? 'text-primary' : 'text-destructive'}`}>
              <Bell className="h-3 w-3" />
              <span>{t('notificationsPage.notificationsLabel')}</span>
              {permissionStatus.notifications ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            </div>
            <div className={`flex items-center gap-1 ${permissionStatus.alarms ? 'text-primary' : 'text-destructive'}`}>
              <Clock className="h-3 w-3" />
              <span>{t('notificationsPage.alarmsLabel')}</span>
              {permissionStatus.alarms ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            </div>
          </div>
        )}
      </header>

      {/* Permission Warning Banner - shows when notifications/alarms permission denied */}
      {permissionStatus.checked && !allPermissionsGranted && (
        <div className="px-5 pb-3 shrink-0">
          <PermissionWarningBanner
            notificationsGranted={permissionStatus.notifications}
            alarmsGranted={permissionStatus.alarms}
            onRequestPermissions={handleRequestAllPermissions}
            onOpenAlarmSettings={openAlarmSettings}
          />
        </div>
      )}

      {/* Missed Notifications Banner */}
      <div className="px-5 pb-3 shrink-0">
        <MissedNotificationsBanner />
      </div>

      {/* Search input with result count */}
      {actions.length > 0 && (
        <div className="px-5 pb-3 shrink-0">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t('notificationsPage.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ps-9 pe-9 h-10"
            />
            {searchQuery && (
              <TooltipProvider delayDuration={500}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t('library.clearSearch')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {/* Search result count */}
          {hasActiveFilters && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted-foreground">
                {t('notificationsPage.searchResults', { count: filteredActions.length })}
              </span>
              {hasActiveFilters && (
                <button
                  onClick={handleClearFilters}
                  className="text-xs text-primary hover:underline"
                >
                  {t('notificationsPage.clearFilters')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Combined Filter bar (Recurrence + Status) */}
      {actions.length > 0 && (
        <div id="tutorial-filter-chips" className="px-5 pb-3 shrink-0">
          <div 
            className="flex gap-2 overflow-x-auto pb-1 no-scrollbar"
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            {/* Recurrence filters */}
            {RECURRENCE_FILTERS.map(filter => {
              const count = filterCounts[filter.value];
              if (filter.value !== 'all' && count === 0) return null;
              
              const isActive = recurrenceFilter === filter.value;
              return (
                <button
                  key={`recurrence-${filter.value}`}
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
                  {t(filter.labelKey)}
                  {count > 0 && (
                    <Badge variant={isActive ? "secondary" : "outline"} className="h-4 px-1 text-[10px]">
                      {count}
                    </Badge>
                  )}
                </button>
              );
            })}
            
            {/* Visual divider */}
            <div className="flex items-center px-1">
              <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            
            {/* Status filters */}
            {STATUS_FILTERS.filter(f => f.value !== 'all').map(filter => {
              const count = statusCounts[filter.value];
              if (count === 0) return null;
              
              const isActive = statusFilter === filter.value;
              return (
                <button
                  key={`status-${filter.value}`}
                  onClick={() => {
                    triggerHaptic('light');
                    setStatusFilter(isActive ? 'all' : filter.value);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive 
                      ? filter.value === 'expired' 
                        ? 'bg-destructive text-destructive-foreground'
                        : filter.value === 'disabled'
                          ? 'bg-muted-foreground text-background'
                          : 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {filter.icon}
                  {t(filter.labelKey)}
                  {count > 0 && (
                    <Badge 
                      variant={isActive ? "secondary" : "outline"} 
                      className={`h-4 px-1 text-[10px] ${
                        isActive && filter.value === 'expired' ? 'bg-destructive-foreground/20' : ''
                      }`}
                    >
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
                <TooltipContent>{t('notificationsPage.sortByTrigger')}</TooltipContent>
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
                <TooltipContent>{t('notificationsPage.sortAlpha')}</TooltipContent>
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
                <TooltipContent>{t('notificationsPage.sortRecurrence')}</TooltipContent>
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
                <TooltipContent>{sortReversed ? t('notificationsPage.reversedOrder') : t('notificationsPage.normalOrder')}</TooltipContent>
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
                {t('notificationsPage.selected', { count: selectedIds.size })}
              </span>
            </div>
            <TooltipProvider delayDuration={500}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearSelection}
                    className="text-xs"
                  >
                    {t('library.clear')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('library.clearTooltip')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}

      <ScrollArea 
        className="flex-1 px-5"
        onScrollCapture={handleScroll}
      >
        <div className="pb-28">
          {filteredActions.length === 0 ? (
            searchQuery || recurrenceFilter !== 'all' || statusFilter !== 'all' ? (
              <NoResultsState onClearFilters={handleClearFilters} />
            ) : (
              <EmptyState onCreateNew={handleCreateNew} />
            )
          ) : (
            <div className="grid grid-cols-1 landscape:grid-cols-2 gap-3">
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
        <div className="fixed bottom-[calc(3.5rem+var(--android-safe-bottom,0px)+1rem)] inset-x-0 px-5 z-10">
          <div className="bg-card border rounded-2xl shadow-lg p-3 flex items-center gap-2">
            <span className="text-sm font-medium text-foreground me-2">
              {t('notificationsPage.selected', { count: selectedIds.size })}
            </span>
            <div className="h-5 w-px bg-border" />
            <TooltipProvider delayDuration={0}>
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
                <TooltipContent>{t('notificationsPage.enableTooltip')}</TooltipContent>
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
                <TooltipContent>{t('notificationsPage.disableTooltip')}</TooltipContent>
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
                <TooltipContent>{t('notificationsPage.deleteTooltip')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="h-5 w-px bg-border" />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearSelection}
              className="h-9 w-9 text-muted-foreground"
              aria-label={t('library.clearSelection')}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

      {/* Floating add button (when not in selection mode) */}
      <div 
        className={cn(
          "fixed inset-x-0 px-5 pb-3 transition-all duration-300 ease-out z-40",
          "bottom-[calc(3.5rem+env(safe-area-inset-bottom))]",
          isBottomButtonVisible && !isSelectionMode && actions.length > 0
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0 pointer-events-none"
        )}
      >
        <TooltipProvider delayDuration={500}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                id="tutorial-add-reminder"
                onClick={handleCreateNew}
                className="w-full h-12 rounded-2xl gap-2 shadow-lg"
              >
                <Plus className="h-5 w-5" />
                {t('notificationsPage.scheduleNew')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('notificationsPage.scheduleNewTooltip')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Action sheet for individual item */}
      <ScheduledActionActionSheet
        action={actionSheetAction}
        open={!!actionSheetAction}
        onOpenChange={(open) => !open && setActionSheetActionId(null)}
        onToggle={(id) => handleToggle(id)}
        onEdit={(action) => {
          setActionSheetActionId(null);
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
            <AlertDialogTitle>{t('notificationsPage.deleteConfirmTitle', { count: selectedIds.size })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('notificationsPage.deleteConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Trash Sheet */}
      <TrashSheet 
        open={isTrashOpen} 
        onOpenChange={setIsTrashOpen}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Tutorial Coach Marks */}
      {tutorial.isActive && actions.length > 0 && (
        <TutorialCoachMarks
          steps={tutorial.steps}
          currentStep={tutorial.currentStep}
          onNext={tutorial.next}
          onPrevious={tutorial.previous}
          onDismiss={tutorial.skip}
        />
      )}
      
      {/* Battery Optimization Help */}
      <BatteryOptimizationHelp
        open={isBatteryHelpOpen}
        onOpenChange={setIsBatteryHelpOpen}
      />
    </div>
  );
}

// Empty state component with animation
function EmptyState({ onCreateNew }: { onCreateNew: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyStateWithValueProp
      variant="reminders"
      icon={<CalendarClock className="h-8 w-8 text-primary" />}
      title={t('notificationsPage.emptyTitle')}
      description={t('notificationsPage.emptyDesc')}
      ctaLabel={t('notificationsPage.scheduleFirst')}
      onCtaClick={onCreateNew}
    />
  );
}

// No results state
function NoResultsState({ onClearFilters }: { onClearFilters: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
        <Search className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-medium mb-2">{t('notificationsPage.noMatchTitle')}</h3>
      <p className="text-sm text-muted-foreground mb-4">
        {t('notificationsPage.noMatchDesc')}
      </p>
      <Button variant="outline" size="sm" onClick={onClearFilters}>
        {t('notificationsPage.clearFilters')}
      </Button>
    </div>
  );
}
