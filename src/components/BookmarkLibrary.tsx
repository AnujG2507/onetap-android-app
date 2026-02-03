import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, X, Bookmark, Trash2, Home, LayoutGrid, List, FolderInput, Clock, SortDesc, ArrowDownAZ, ArrowUpZA, Folder, ArrowDownUp, Edit2, GripVertical, Link2, Bell } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ToastAction } from '@/components/ui/toast';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { 
  getSavedLinks, 
  removeSavedLink, 
  restoreSavedLink,
  addSavedLink,
  updateSavedLink,
  toggleShortlist,
  getShortlistedLinks,
  clearAllShortlist,
  getAllTags,
  getAllFolders,
  PRESET_TAGS,
  reorderLinks,
  moveToFolder,
  removeCustomFolder,
  permanentlyDelete,
  type SavedLink 
} from '@/lib/savedLinksManager';
import { getSettings } from '@/lib/settingsManager';
import { BookmarkItem } from './BookmarkItem';
import { BookmarkDragOverlay } from './BookmarkDragOverlay';
import { BookmarkFolderSection } from './BookmarkFolderSection';
import { CreateFolderDialog } from './CreateFolderDialog';
import { BookmarkActionSheet } from './BookmarkActionSheet';
import { AddBookmarkForm } from './AddBookmarkForm';
import { BulkMoveDialog } from './BulkMoveDialog';
import { AppMenu } from './AppMenu';
import { TrashSheet } from './TrashSheet';
import { SettingsPage } from './SettingsPage';
import { EmptyStateWithValueProp } from './EmptyStateWithValueProp';
import { TutorialCoachMarks } from './TutorialCoachMarks';
import { useToast } from '@/hooks/use-toast';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
import { useTutorial } from '@/hooks/useTutorial';
import { triggerHaptic } from '@/lib/haptics';
import { openInAppBrowser } from '@/lib/inAppBrowser';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  DragOverEvent,
  pointerWithin,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

type ViewMode = 'list' | 'folders';
type SortMode = 'manual' | 'newest' | 'alphabetical' | 'folder';

interface BookmarkLibraryProps {
  onCreateShortcut: (url: string) => void;
  onCreateReminder: (url: string) => void;
  onSelectionModeChange?: (isSelectionMode: boolean) => void;
  /** Increment this value to request clearing the current shortlist/selection from a parent (e.g. Android back button). */
  clearSelectionSignal?: number;
  /** Called when the action sheet is opened or closed */
  onActionSheetOpenChange?: (isOpen: boolean) => void;
}

export function BookmarkLibrary({ 
  onCreateShortcut, 
  onCreateReminder,
  onSelectionModeChange, 
  clearSelectionSignal,
  onActionSheetOpenChange,
}: BookmarkLibraryProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('bookmark_view_mode');
    return (saved === 'list' || saved === 'folders') ? saved : 'list';
  });
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const saved = localStorage.getItem('bookmark_sort_mode');
    return (saved === 'manual' || saved === 'newest' || saved === 'alphabetical' || saved === 'folder') ? saved : 'manual';
  });
  const [sortReversed, setSortReversed] = useState(() => {
    return localStorage.getItem('bookmark_sort_reversed') === 'true';
  });
  
  // Persist preferences to localStorage
  useEffect(() => {
    localStorage.setItem('bookmark_view_mode', viewMode);
  }, [viewMode]);
  
  useEffect(() => {
    localStorage.setItem('bookmark_sort_mode', sortMode);
  }, [sortMode]);
  
  useEffect(() => {
    localStorage.setItem('bookmark_sort_reversed', String(sortReversed));
  }, [sortReversed]);
  
  // Auto-switch to folder view when sort by folder is selected
  useEffect(() => {
    if (sortMode === 'folder') {
      setViewMode('folders');
    }
  }, [sortMode]);
  
  
  // Helper to toggle sort mode
  const handleSortToggle = (mode: SortMode) => {
    setSortMode(sortMode === mode ? 'manual' : mode);
  };
  
  // Action sheet state
  const [selectedLink, setSelectedLink] = useState<SavedLink | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [startInEditMode, setStartInEditMode] = useState(false);
  
  
  // Drag state for overlay
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overFolderId, setOverFolderId] = useState<string | null>(null);
  const [folderRefreshKey, setFolderRefreshKey] = useState(0);
  
  
  
  // Bulk move dialog
  const [showBulkMoveDialog, setShowBulkMoveDialog] = useState(false);
  
  // Scroll-aware bottom button
  const [isBottomButtonVisible, setIsBottomButtonVisible] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  
  const { toast } = useToast();
  const tutorial = useTutorial('library');

  // Register sheets with back button handler
  const handleCloseActionSheet = useCallback(() => setShowActionSheet(false), []);
  const handleCloseBulkMoveDialog = useCallback(() => setShowBulkMoveDialog(false), []);
  
  const handleCloseTrash = useCallback(() => setIsTrashOpen(false), []);
  const handleCloseSettings = useCallback(() => setShowSettings(false), []);
  
  useSheetBackHandler('bookmark-action-sheet', showActionSheet, handleCloseActionSheet);
  useSheetBackHandler('bookmark-bulk-move-dialog', showBulkMoveDialog, handleCloseBulkMoveDialog, 10);
  
  useSheetBackHandler('bookmark-trash-sheet', isTrashOpen, handleCloseTrash);
  useSheetBackHandler('bookmark-settings-page', showSettings, handleCloseSettings);

  // Load links
  const refreshLinks = useCallback(() => {
    setLinks(getSavedLinks());
  }, []);
  

  useEffect(() => {
    refreshLinks();
  }, [refreshLinks]);

  // Allow parent to request clearing selection (e.g. Android back button handler in Index)
  const [lastClearSignal, setLastClearSignal] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (clearSelectionSignal == null) return;
    // Skip the initial render (we only want to react to subsequent increments)
    if (lastClearSignal === undefined) {
      setLastClearSignal(clearSelectionSignal);
      return;
    }
    if (clearSelectionSignal === lastClearSignal) return;

    // Clear without toast/haptic; this is a "system" action.
    clearAllShortlist();
    refreshLinks();
    setLastClearSignal(clearSelectionSignal);
  }, [clearSelectionSignal, lastClearSignal, refreshLinks]);

  // Derived data
  const allUsedTags = useMemo(() => getAllTags(), [links, folderRefreshKey]);
  const allFolders = useMemo(() => getAllFolders(), [links, folderRefreshKey]);
  const availableTags = useMemo(() => {
    const combined = new Set([...PRESET_TAGS, ...allUsedTags]);
    return Array.from(combined);
  }, [allUsedTags]);
  
  const shortlistedLinks = useMemo(() => getShortlistedLinks(), [links]);
  const hasShortlist = shortlistedLinks.length > 0;

  // Calculate bookmark counts per tag
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let uncategorizedCount = 0;
    
    links.forEach(link => {
      if (link.tag) {
        counts[link.tag] = (counts[link.tag] || 0) + 1;
      } else {
        uncategorizedCount++;
      }
    });
    
    return { counts, uncategorizedCount, total: links.length };
  }, [links]);

  // Notify parent of selection mode changes
  useEffect(() => {
    onSelectionModeChange?.(hasShortlist);
  }, [hasShortlist, onSelectionModeChange]);

  // Notify parent when action sheet is opened/closed
  useEffect(() => {
    onActionSheetOpenChange?.(showActionSheet);
  }, [showActionSheet, onActionSheetOpenChange]);

  // Filtered and sorted links
  const filteredLinks = useMemo(() => {
    let result = [...links];
    
    if (activeTagFilter) {
      if (activeTagFilter === '__uncategorized__') {
        result = result.filter(link => !link.tag);
      } else {
        result = result.filter(link => link.tag === activeTagFilter);
      }
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(link =>
        link.title.toLowerCase().includes(query) ||
        link.url.toLowerCase().includes(query) ||
        link.description?.toLowerCase().includes(query) ||
        (link.tag && link.tag.toLowerCase().includes(query))
      );
    }
    
    // Apply sorting (manual mode preserves user's drag-drop order)
    switch (sortMode) {
      case 'manual':
        // Keep original order from localStorage
        break;
      case 'newest':
        result.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'alphabetical':
        result.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
        break;
      case 'folder':
        result.sort((a, b) => {
          const tagA = a.tag || 'zzz'; // Uncategorized at end
          const tagB = b.tag || 'zzz';
          const tagCompare = tagA.localeCompare(tagB);
          if (tagCompare !== 0) return tagCompare;
          return b.createdAt - a.createdAt; // Within same folder, newest first
        });
        break;
    }
    
    // Apply reverse if toggled
    if (sortReversed) {
      result.reverse();
    }
    
    return result;
  }, [links, searchQuery, activeTagFilter, sortMode, sortReversed]);

  // Group links by tag for folder view
  const groupedLinks = useMemo(() => {
    const groups: Record<string, SavedLink[]> = {};
    const uncategorized: SavedLink[] = [];
    
    // Initialize all folders (even empty ones)
    allFolders.forEach(folder => {
      groups[folder] = [];
    });
    
    filteredLinks.forEach(link => {
      if (link.tag && groups[link.tag] !== undefined) {
        groups[link.tag].push(link);
      } else if (link.tag) {
        groups[link.tag] = [link];
      } else {
        uncategorized.push(link);
      }
    });
    
    // Sort tags alphabetically
    const sortedTags = Object.keys(groups).sort();
    
    return { groups, sortedTags, uncategorized };
  }, [filteredLinks, allFolders]);

  // Check if filtering/searching is active or sorting is applied (disable drag in these cases)
  const isDragDisabled = Boolean(searchQuery.trim() || activeTagFilter || sortMode !== 'manual');

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    triggerHaptic('light');
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (over && String(over.id).startsWith('folder-')) {
      setOverFolderId(String(over.id));
    } else {
      setOverFolderId(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverFolderId(null);
    
    if (!over) return;
    
    // Check if dropping on a folder
    if (String(over.id).startsWith('folder-')) {
      const folderData = over.data.current;
      if (folderData?.type === 'folder') {
        const targetFolder = folderData.folderName;
        const linkId = active.id as string;
        const link = links.find(l => l.id === linkId);
        
        if (link && link.tag !== targetFolder) {
          moveToFolder(linkId, targetFolder);
          refreshLinks();
          toast({
            title: `Moved to ${targetFolder || 'Uncategorized'}`,
          });
          triggerHaptic('success');
        }
        return;
      }
    }
    
    // Normal reordering
    if (active.id !== over.id) {
      const oldIndex = links.findIndex(link => link.id === active.id);
      const newIndex = links.findIndex(link => link.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(links, oldIndex, newIndex);
        setLinks(newOrder);
        reorderLinks(newOrder.map(l => l.id));
        triggerHaptic('success');
      }
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOverFolderId(null);
  };

  const activeLink = activeId ? links.find(l => l.id === activeId) : null;

  // Custom collision detection for folder drops
  const collisionDetection = (args: any) => {
    // First check for folder intersections
    const pointerCollisions = pointerWithin(args);
    const folderCollision = pointerCollisions.find(c => String(c.id).startsWith('folder-'));
    if (folderCollision) {
      return [folderCollision];
    }
    
    // Fall back to closest center for item reordering
    return closestCenter(args);
  };
  
  const handleDeleteFolder = (folderName: string) => {
    removeCustomFolder(folderName);
    refreshLinks();
    setFolderRefreshKey(k => k + 1);
    toast({
      title: 'Folder deleted',
      description: 'Bookmarks moved to Uncategorized',
    });
    triggerHaptic('warning');
  };

  // Handlers
  const handleBookmarkTap = (link: SavedLink) => {
    triggerHaptic('light');
    setSelectedLink(link);
    setShowActionSheet(true);
  };

  const handleOpenExternal = async (url: string) => {
    await openInAppBrowser(url);
  };

  const handleToggleShortlist = (id: string) => {
    toggleShortlist(id);
    refreshLinks();
    triggerHaptic('success');
  };

  // Check if all filtered links are shortlisted
  const allFilteredShortlisted = useMemo(() => {
    return filteredLinks.length > 0 && filteredLinks.every(link => link.isShortlisted);
  }, [filteredLinks]);

  const someFilteredShortlisted = useMemo(() => {
    return filteredLinks.some(link => link.isShortlisted) && !allFilteredShortlisted;
  }, [filteredLinks, allFilteredShortlisted]);

  const handleToggleAllShortlist = () => {
    if (allFilteredShortlisted) {
      // Uncheck all filtered
      filteredLinks.forEach(link => {
        if (link.isShortlisted) {
          toggleShortlist(link.id);
        }
      });
    } else {
      // Check all filtered
      filteredLinks.forEach(link => {
        if (!link.isShortlisted) {
          toggleShortlist(link.id);
        }
      });
    }
    refreshLinks();
    triggerHaptic('success');
  };

  const handleEdit = (id: string, updates: { title?: string; description?: string; tag?: string | null }) => {
    updateSavedLink(id, updates);
    refreshLinks();
    toast({
      title: 'Bookmark updated',
    });
  };

  const handleDelete = (id: string) => {
    const deletedLink = removeSavedLink(id);
    refreshLinks();
    
    if (deletedLink) {
      toast({
        title: 'Moved to trash',
        description: deletedLink.title,
        duration: 5000,
        action: (
          <ToastAction 
            altText="Undo delete"
            onClick={() => {
              restoreSavedLink(deletedLink);
              refreshLinks();
              triggerHaptic('success');
            }}
          >
            Undo
          </ToastAction>
        ),
      });
    } else {
      toast({
        title: 'Moved to trash',
      });
    }
  };

  const handlePermanentDelete = (id: string) => {
    // First remove from main storage (this moves to trash)
    removeSavedLink(id);
    // Then permanently delete from trash
    permanentlyDelete(id);
    refreshLinks();
    toast({
      title: 'Bookmark permanently deleted',
    });
    triggerHaptic('warning');
  };

  const handleAddBookmark = (url: string, title?: string, description?: string, tag?: string | null) => {
    const result = addSavedLink(url, title, description, tag);
    if (result.status === 'added') {
      refreshLinks();
      setShowAddForm(false);
      toast({
        title: 'Bookmark saved',
      });
      triggerHaptic('success');
    } else if (result.status === 'duplicate') {
      toast({
        title: 'Already saved',
        description: 'This link is already in your bookmarks',
      });
    }
  };

  const handleClearShortlist = () => {
    clearAllShortlist();
    refreshLinks();
    toast({
      title: 'Selection cleared',
    });
    triggerHaptic('warning');
  };

  // Bulk actions for selected items
  const handleBulkDelete = (permanent: boolean = false) => {
    const selectedCount = shortlistedLinks.length;
    shortlistedLinks.forEach(link => {
      if (permanent) {
        // First remove from main storage (this moves to trash)
        removeSavedLink(link.id);
        // Then permanently delete from trash
        permanentlyDelete(link.id);
      } else {
        removeSavedLink(link.id);
      }
    });
    refreshLinks();
    toast({
      title: permanent 
        ? t('library.bulkDeletedPermanent', { count: selectedCount })
        : t('library.bulkDeleted', { count: selectedCount }),
    });
    triggerHaptic('warning');
  };

  const handleBulkCreateShortcuts = () => {
    shortlistedLinks.forEach(link => {
      onCreateShortcut(link.url);
    });
    toast({
      title: `Creating ${shortlistedLinks.length} shortcut${shortlistedLinks.length > 1 ? 's' : ''}...`,
    });
    triggerHaptic('success');
  };

  const handleBulkMove = (folderName: string | null) => {
    const count = shortlistedLinks.length;
    shortlistedLinks.forEach(link => {
      moveToFolder(link.id, folderName);
    });
    refreshLinks();
    clearAllShortlist();
    toast({
      title: `${count} bookmark${count > 1 ? 's' : ''} moved`,
      description: `Moved to ${folderName || 'Uncategorized'}`,
    });
    triggerHaptic('success');
  };
  // Show settings page
  if (showSettings) {
    return <SettingsPage onBack={() => setShowSettings(false)} />;
  }

  return (
    <div className="flex flex-col h-full pb-20">
      {/* Header */}
      <header className="ps-5 pe-5 pt-header-safe pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Bookmark className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">{t('library.title')}</h1>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    id="tutorial-add-bookmark"
                    onClick={() => {
                      setShowAddForm(true);
                      triggerHaptic('light');
                    }}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('library.add')}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[200px] text-center">
                  <p>{t('library.addTooltip')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <AppMenu onOpenTrash={() => setIsTrashOpen(true)} onOpenSettings={() => setShowSettings(true)} />
          </div>
        </div>
        
        {/* View Mode Toggle */}
        {links.length > 0 && (
          <div id="tutorial-view-toggle" className="flex items-center gap-2 mt-3">
          <TooltipProvider delayDuration={500}>
              <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setViewMode('list')}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                        viewMode === 'list'
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <List className="h-3.5 w-3.5" />
                      {t('library.list')}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t('library.listTooltip')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setViewMode('folders')}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                        viewMode === 'folders'
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      {t('library.folders')}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t('library.foldersTooltip')}</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
        )}
      </header>

      {/* Search - hidden in empty state */}
      {links.length > 0 && (
        <div className="ps-5 pe-5 mb-3">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('library.search')}
              className="ps-10 pe-10"
            />
            {searchQuery && (
              <TooltipProvider delayDuration={500}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50 transition-colors"
                      >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t('library.clearSearch')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      )}

      {/* Tag Filter Bar - hidden in empty state */}
      {links.length > 0 && availableTags.length > 0 && (
        <div 
          className="flex gap-2 overflow-x-auto pb-3 ps-5 pe-5 scrollbar-hide"
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setActiveTagFilter(null)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5",
              activeTagFilter === null
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
            >
              {t('library.all')}
            <span className={cn(
              "px-1.5 py-0.5 rounded-full text-[10px] font-semibold min-w-[20px] text-center",
              activeTagFilter === null
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-foreground/10 text-muted-foreground"
            )}>
              {tagCounts.total}
            </span>
          </button>
          {availableTags
            .filter(tag => (tagCounts.counts[tag] || 0) > 0)
            .map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5",
                  activeTagFilter === tag
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {tag}
                <span className={cn(
                  "px-1.5 py-0.5 rounded-full text-[10px] font-semibold min-w-[20px] text-center",
                  activeTagFilter === tag
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-foreground/10 text-muted-foreground"
                )}>
                  {tagCounts.counts[tag]}
                </span>
              </button>
            ))}
          {tagCounts.uncategorizedCount > 0 && (
            <button
              onClick={() => setActiveTagFilter(activeTagFilter === '__uncategorized__' ? null : '__uncategorized__')}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5",
                activeTagFilter === '__uncategorized__'
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {t('library.uncategorized')}
              <span className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px] font-semibold min-w-[20px] text-center",
                activeTagFilter === '__uncategorized__'
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-foreground/10 text-muted-foreground"
              )}>
                {tagCounts.uncategorizedCount}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Add Bookmark Form */}
      {showAddForm && (
        <div className="ps-5 pe-5 mb-4">
          <AddBookmarkForm
            onSave={handleAddBookmark}
            onCancel={() => setShowAddForm(false)}
            onEditExisting={(link) => {
              setShowAddForm(false);
              setSelectedLink(link);
              setShowActionSheet(true);
            }}
          />
        </div>
      )}
      
      {/* Empty state with animated illustration */}
      {links.length === 0 && !showAddForm && (
        <EmptyStateWithValueProp
          variant="library"
          icon={<Bookmark className="h-8 w-8 text-primary" strokeWidth={1.5} />}
          title={t('library.empty')}
          description={t('library.emptyDescription')}
          ctaLabel={t('library.addFirst')}
          onCtaClick={() => {
            setShowAddForm(true);
            triggerHaptic('light');
          }}
        />
      )}

      {/* Sort Controls - below Add Bookmark */}
      {links.length > 0 && (
        <div className="ps-5 pe-5 mb-4">
          <TooltipProvider delayDuration={500}>
            <div className="flex items-center gap-1.5 select-none">
              <span className="text-xs text-muted-foreground shrink-0">
                {sortMode === 'manual' ? t('library.sortManual') : t('library.sort')}
              </span>
              
              {/* Newest First */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleSortToggle('newest')}
                    onContextMenu={(e) => e.preventDefault()}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors select-none touch-manipulation",
                      sortMode === 'newest'
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <SortDesc className="h-3.5 w-3.5 pointer-events-none" />
                    <span className="hidden xs:inline">{t('library.sortNewest')}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{sortMode === 'newest' ? t('library.clickForManual') : t('library.sortNewestTooltip')}</p>
                </TooltipContent>
              </Tooltip>
              
              {/* Alphabetical A-Z */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleSortToggle('alphabetical')}
                    onContextMenu={(e) => e.preventDefault()}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors select-none touch-manipulation",
                      sortMode === 'alphabetical'
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <ArrowDownAZ className="h-3.5 w-3.5 pointer-events-none" />
                    {t('library.sortAZ')}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{sortMode === 'alphabetical' ? t('library.clickForManual') : t('library.sortAZTooltip')}</p>
                </TooltipContent>
              </Tooltip>
              
              {/* By Folder */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleSortToggle('folder')}
                    onContextMenu={(e) => e.preventDefault()}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors select-none touch-manipulation",
                      sortMode === 'folder'
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Folder className="h-3.5 w-3.5 pointer-events-none" />
                    <span className="hidden xs:inline">{t('library.sortFolder')}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{sortMode === 'folder' ? t('library.clickForManual') : t('library.sortFolderTooltip')}</p>
                </TooltipContent>
              </Tooltip>
              
              {/* Spacer */}
              <div className="flex-1" />
              
              {/* Reverse Toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setSortReversed(!sortReversed)}
                    onContextMenu={(e) => e.preventDefault()}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all select-none touch-manipulation",
                      sortReversed
                        ? "bg-primary/15 text-primary border border-primary/30"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <ArrowDownUp className={cn(
                      "h-3.5 w-3.5 transition-transform pointer-events-none",
                      sortReversed && "rotate-180"
                    )} />
                    <span className="hidden xs:inline">{sortReversed ? t('library.reversed') : t('library.reverse')}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{sortReversed ? t('library.clickToRestore') : t('library.clickToReverse')}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      )}

      {/* Manual Ordering Mode Banner */}
      {sortMode === 'manual' && links.length > 1 && !searchQuery.trim() && !activeTagFilter && (
        <div className="px-5 mb-3 animate-fade-in">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
            <GripVertical className="h-4 w-4 text-primary/70" />
            <span className="text-xs text-primary font-medium">
              {t('library.manualOrderHint')}
            </span>
          </div>
        </div>
      )}

      {/* Bookmarks List */}
      <ScrollArea 
        className="flex-1"
        onScrollCapture={(e) => {
          const target = e.target as HTMLElement;
          if (!target.classList.contains('scroll-area-viewport')) return;
          const scrollTop = target.scrollTop;
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
        }}
        viewportClassName="scroll-area-viewport"
      >
        <div ref={scrollContainerRef} className="ps-5 pe-5 pb-16">
        {filteredLinks.length === 0 && (searchQuery || activeTagFilter) ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>{t('library.noMatch')}</p>
          </div>
        ) : filteredLinks.length > 0 ? (
          <>
            {/* Select All Row - only visible when in selection mode */}
            {hasShortlist && (
              <div className="flex items-center justify-between py-2 mb-2 border-b border-border/50">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={allFilteredShortlisted}
                    className="h-5 w-5"
                    onClick={handleToggleAllShortlist}
                    data-state={someFilteredShortlisted ? "indeterminate" : allFilteredShortlisted ? "checked" : "unchecked"}
                  />
                  <span className="text-sm text-muted-foreground">
                    {allFilteredShortlisted 
                      ? `${t('library.deselectAll')} (${filteredLinks.length})` 
                      : `${t('library.selectAll')} (${filteredLinks.length})`}
                  </span>
                </div>
                <TooltipProvider delayDuration={500}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          handleClearShortlist();
                          triggerHaptic('light');
                        }}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-muted transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                        {t('library.clear')}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t('library.clearTooltip')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            {viewMode === 'list' ? (
              /* List View */
              <SortableContext
                items={filteredLinks.map(l => l.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="grid grid-cols-1 landscape:grid-cols-2 gap-2 pb-6">
                  {filteredLinks.map((link) => (
                    <BookmarkItem
                      key={link.id}
                      link={link}
                      onTap={() => handleBookmarkTap(link)}
                      onToggleShortlist={handleToggleShortlist}
                      onCreateShortcut={onCreateShortcut}
                      onDelete={handleDelete}
                      onPermanentDelete={handlePermanentDelete}
                      isDragDisabled={isDragDisabled}
                      isSelectionMode={hasShortlist}
                    />
                  ))}
                </div>
              </SortableContext>
            ) : (
              /* Folder View */
              <div className="pb-6">
                {/* Create Folder Button - hide when filtering by tag */}
                {!activeTagFilter && (
                  <div className="mb-4">
                    <CreateFolderDialog 
                      onFolderCreated={() => {
                        setFolderRefreshKey(k => k + 1);
                      }} 
                    />
                  </div>
                )}
                
                {/* When a tag filter is active, only show that specific folder */}
                {activeTagFilter === '__uncategorized__' ? (
                  <BookmarkFolderSection
                    key="uncategorized"
                    title={t('library.uncategorized')}
                    folderId="uncategorized"
                    links={groupedLinks.uncategorized}
                    onBookmarkTap={handleBookmarkTap}
                    onToggleShortlist={handleToggleShortlist}
                    onCreateShortcut={onCreateShortcut}
                    onDeleteBookmark={handleDelete}
                    onPermanentDeleteBookmark={handlePermanentDelete}
                    isDragDisabled={isDragDisabled}
                    isSelectionMode={hasShortlist}
                    defaultOpen
                  />
                ) : activeTagFilter ? (
                  <BookmarkFolderSection
                    key={activeTagFilter}
                    title={activeTagFilter}
                    folderId={activeTagFilter}
                    links={groupedLinks.groups[activeTagFilter] || []}
                    onBookmarkTap={handleBookmarkTap}
                    onToggleShortlist={handleToggleShortlist}
                    onCreateShortcut={onCreateShortcut}
                    onDeleteBookmark={handleDelete}
                    onPermanentDeleteBookmark={handlePermanentDelete}
                    onDeleteFolder={handleDeleteFolder}
                    onFolderUpdated={() => {
                      refreshLinks();
                      setFolderRefreshKey(k => k + 1);
                    }}
                    isDragDisabled={isDragDisabled}
                    isSelectionMode={hasShortlist}
                    defaultOpen
                  />
                ) : (
                  <>
                    {groupedLinks.sortedTags
                      .filter(tag => groupedLinks.groups[tag].length > 0)
                      .map((tag) => (
                      <BookmarkFolderSection
                        key={tag}
                        title={tag}
                        folderId={tag}
                        links={groupedLinks.groups[tag]}
                        onBookmarkTap={handleBookmarkTap}
                        onToggleShortlist={handleToggleShortlist}
                        onCreateShortcut={onCreateShortcut}
                        onDeleteBookmark={handleDelete}
                        onPermanentDeleteBookmark={handlePermanentDelete}
                        onDeleteFolder={handleDeleteFolder}
                        onFolderUpdated={() => {
                          refreshLinks();
                          setFolderRefreshKey(k => k + 1);
                        }}
                        isDragDisabled={isDragDisabled}
                        isSelectionMode={hasShortlist}
                      />
                    ))}
                    
                    <BookmarkFolderSection
                      title={t('library.uncategorized')}
                      folderId="uncategorized"
                      links={groupedLinks.uncategorized}
                      onBookmarkTap={handleBookmarkTap}
                      onToggleShortlist={handleToggleShortlist}
                      onCreateShortcut={onCreateShortcut}
                      onDeleteBookmark={handleDelete}
                      onPermanentDeleteBookmark={handlePermanentDelete}
                      isDragDisabled={isDragDisabled}
                      defaultOpen={groupedLinks.sortedTags.length === 0}
                      isSelectionMode={hasShortlist}
                    />
                  </>
                )}
              </div>
            )}
            
            <DragOverlay dropAnimation={{
              duration: 200,
              easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
            }}>
              {activeLink ? (
                <BookmarkDragOverlay link={activeLink} />
              ) : null}
            </DragOverlay>
          </DndContext>
          </>
        ) : null}
        </div>
      </ScrollArea>

      {/* Action Sheet */}
      <BookmarkActionSheet
        link={selectedLink}
        open={showActionSheet}
        onOpenChange={(open) => {
          setShowActionSheet(open);
          if (!open) setStartInEditMode(false);
        }}
        onOpenExternal={handleOpenExternal}
        onCreateShortcut={onCreateShortcut}
        onCreateReminder={onCreateReminder}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onPermanentDelete={handlePermanentDelete}
        startInEditMode={startInEditMode}
      />

      {/* Floating Action Bar */}
      <div
        className={cn(
          "fixed bottom-20 start-1/2 -translate-x-1/2 z-50",
          "[html[dir=rtl]_&]:translate-x-1/2",
          "flex items-center gap-2 px-4 py-3 rounded-2xl",
          "bg-card border border-border shadow-lg",
          "transition-all duration-300 ease-out",
          hasShortlist
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <span className="text-sm font-medium text-foreground me-2">
          <span className="landscape:hidden">{shortlistedLinks.length}</span>
          <span className="hidden landscape:inline">{t('library.selected', { count: shortlistedLinks.length })}</span>
        </span>
        
        <div className="h-5 w-px bg-border" />
        
        <TooltipProvider delayDuration={500}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowBulkMoveDialog(true)}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                aria-label={t('library.moveToFolder')}
              >
                <FolderInput className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('library.moveToFolderTooltip')}</TooltipContent>
          </Tooltip>
          
          {shortlistedLinks.length === 1 && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onCreateReminder(shortlistedLinks[0].url)}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                    aria-label={t('bookmarkAction.remindLater')}
                  >
                    <Bell className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('bookmarkAction.remindLater')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      setSelectedLink(shortlistedLinks[0]);
                      setStartInEditMode(true);
                      setShowActionSheet(true);
                    }}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                    aria-label={t('common.edit')}
                  >
                    <Edit2 className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('library.editTooltip')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleBulkCreateShortcuts}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                    aria-label={t('library.shortcut')}
                  >
                    <Home className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('library.shortcutTooltip')}</TooltipContent>
              </Tooltip>
            </>
          )}
          
          {/* Move to Trash - immediate action */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleBulkDelete(false)}
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                aria-label={t('library.moveToTrash')}
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('library.moveToTrash')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <div className="h-5 w-px bg-border" />
        
        <button
          onClick={handleClearShortlist}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          aria-label={t('library.clearSelection')}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      
      {/* Bulk Move Dialog */}
      <BulkMoveDialog
        open={showBulkMoveDialog}
        onOpenChange={setShowBulkMoveDialog}
        selectedCount={shortlistedLinks.length}
        onMove={handleBulkMove}
      />

      {/* Trash Sheet (controlled from menu) */}
      <TrashSheet 
        open={isTrashOpen} 
        onOpenChange={setIsTrashOpen} 
        onRestored={refreshLinks}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Tutorial Coach Marks */}
      {tutorial.isActive && links.length > 0 && (
        <TutorialCoachMarks
          steps={tutorial.steps}
          currentStep={tutorial.currentStep}
          onNext={tutorial.next}
          onDismiss={tutorial.skip}
        />
      )}
      
      {/* Bottom Full-Width Add Button - positioned above nav bar with safe area */}
      <div 
        className={cn(
          "fixed inset-x-0 px-5 pb-3 transition-all duration-300 ease-out z-40",
          "bottom-[calc(3.5rem+env(safe-area-inset-bottom))]",
          isBottomButtonVisible && !hasShortlist && !showAddForm && links.length > 0
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0 pointer-events-none"
        )}
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  setShowAddForm(true);
                  triggerHaptic('light');
                }}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                  "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg"
                )}
              >
                <Plus className="h-5 w-5" />
                {t('library.addBookmark')}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px] text-center">
              <p>{t('library.addTooltip')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
    </div>
  );
}
