import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Zap, ChevronRight, RefreshCw, Search, X, Link2, FileIcon, MessageCircle, Phone, BarChart3, Clock, ArrowDownAZ } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
import { ShortcutActionSheet } from '@/components/ShortcutActionSheet';
import { ShortcutEditSheet } from '@/components/ShortcutEditSheet';
import type { ShortcutData } from '@/types/shortcut';
import type { ScheduledActionDestination } from '@/types/scheduledAction';

interface ShortcutsListProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateReminder: (destination: ScheduledActionDestination) => void;
}

type TypeFilter = 'all' | 'link' | 'file' | 'whatsapp' | 'contact';
type SortMode = 'usage' | 'newest' | 'alphabetical';

const SORT_MODE_KEY = 'shortcuts_sort_mode';

// Helper to get shortcut type label
function getShortcutTypeLabel(shortcut: ShortcutData, t: (key: string) => string): string {
  if (shortcut.type === 'contact') {
    return t('contact.call');
  }
  if (shortcut.type === 'message') {
    return shortcut.messageApp === 'whatsapp' ? 'WhatsApp' : t('contact.call');
  }
  if (shortcut.type === 'link') {
    return t('access.link');
  }
  if (shortcut.fileType === 'image') {
    return t('access.photo');
  }
  if (shortcut.fileType === 'video') {
    return t('access.video');
  }
  if (shortcut.fileType === 'pdf') {
    return 'PDF';
  }
  return t('access.document');
}

// Helper to get shortcut target (contact name, domain, etc.)
function getShortcutTarget(shortcut: ShortcutData): string | null {
  if (shortcut.type === 'contact' || shortcut.type === 'message') {
    return shortcut.phoneNumber || null;
  }
  if (shortcut.type === 'link' && shortcut.contentUri) {
    try {
      const url = new URL(shortcut.contentUri.startsWith('http') ? shortcut.contentUri : `https://${shortcut.contentUri}`);
      return url.hostname.replace('www.', '');
    } catch {
      return null;
    }
  }
  return null;
}

// Render shortcut icon
function ShortcutIcon({ shortcut }: { shortcut: ShortcutData }) {
  const { icon } = shortcut;
  
  if (icon.type === 'emoji') {
    return (
      <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center text-2xl">
        {icon.value}
      </div>
    );
  }
  
  if (icon.type === 'thumbnail') {
    const thumbnailSrc = icon.value || shortcut.thumbnailData;
    if (thumbnailSrc) {
      return (
        <div className="h-12 w-12 rounded-xl overflow-hidden bg-muted">
          <img 
            src={thumbnailSrc} 
            alt={shortcut.name}
            className="h-full w-full object-cover"
          />
        </div>
      );
    }
  }
  
  if (icon.type === 'text') {
    return (
      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
        <span className="text-sm font-semibold text-primary truncate px-1">
          {icon.value.slice(0, 2).toUpperCase()}
        </span>
      </div>
    );
  }
  
  // Default fallback
  return (
    <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
      <Zap className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}

// Individual shortcut list item with expand-on-tap for title
function ShortcutListItem({ 
  shortcut, 
  onTap, 
  t 
}: { 
  shortcut: ShortcutData; 
  onTap: (shortcut: ShortcutData) => void;
  t: (key: string) => string;
}) {
  const [isTitleExpanded, setIsTitleExpanded] = useState(false);
  const typeLabel = getShortcutTypeLabel(shortcut, t);
  const target = getShortcutTarget(shortcut);
  const usageCount = shortcut.usageCount || 0;
  
  return (
    <button
      key={shortcut.id}
      onClick={() => onTap(shortcut)}
      className="w-full max-w-full overflow-hidden flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card mb-2 hover:bg-muted/50 active:bg-muted transition-colors text-start shadow-sm"
    >
      <div className="shrink-0">
        <ShortcutIcon shortcut={shortcut} />
      </div>
      
      {/* Text content - strictly constrained to prevent overflow */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-start gap-2 max-w-full min-w-0">
          <p 
            className={cn(
              "font-medium flex-1 min-w-0 cursor-pointer",
              isTitleExpanded ? "break-all" : "truncate"
            )}
            onClick={(e) => {
              e.stopPropagation();
              setIsTitleExpanded(!isTitleExpanded);
            }}
          >
            {shortcut.name}
          </p>
          {/* Tap count badge - inline with name for visibility */}
          <Badge 
            variant="outline" 
            className="shrink-0 flex-none text-[10px] px-1.5 py-0 h-5 font-semibold bg-primary/5 border-primary/20 text-primary whitespace-nowrap"
          >
            {usageCount} {usageCount === 1 ? t('shortcuts.tap') : t('shortcuts.taps')}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {typeLabel}
          {target && ` · ${target}`}
        </p>
      </div>
      
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 flex-none rtl:rotate-180" />
    </button>
  );
}

// Type filter chip component
function TypeFilterChip({ 
  value, 
  label, 
  icon, 
  isActive, 
  count,
  onClick 
}: { 
  value: TypeFilter; 
  label: string; 
  icon: React.ReactNode; 
  isActive: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors
        ${isActive 
          ? 'bg-primary text-primary-foreground' 
          : 'bg-muted/50 text-muted-foreground hover:bg-muted'
        }
      `}
    >
      {icon}
      <span>{label}</span>
      {count > 0 && (
        <span className={`text-xs ${isActive ? 'text-primary-foreground/70' : 'text-muted-foreground/70'}`}>
          ({count})
        </span>
      )}
    </button>
  );
}

// Sort button component
function SortButton({ 
  mode, 
  currentMode, 
  icon, 
  tooltip, 
  onClick 
}: { 
  mode: SortMode; 
  currentMode: SortMode; 
  icon: React.ReactNode; 
  tooltip: string;
  onClick: () => void;
}) {
  const isActive = mode === currentMode;
  
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={`
              p-2 rounded-lg transition-colors
              ${isActive 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }
            `}
          >
            {icon}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ShortcutsList({ isOpen, onClose, onCreateReminder }: ShortcutsListProps) {
  const { t } = useTranslation();
  const { shortcuts, deleteShortcut, updateShortcut, incrementUsage, syncWithHomeScreen } = useShortcuts();
  const [selectedShortcut, setSelectedShortcut] = useState<ShortcutData | null>(null);
  const [editingShortcut, setEditingShortcut] = useState<ShortcutData | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const saved = localStorage.getItem(SORT_MODE_KEY);
    return (saved as SortMode) || 'usage';
  });
  
  // Register with back handler
  useSheetBackHandler('shortcuts-list-sheet', isOpen, onClose);
  
  // Sync with home screen when sheet opens
  useEffect(() => {
    if (isOpen) {
      syncWithHomeScreen();
    }
  }, [isOpen, syncWithHomeScreen]);
  
  // Persist sort mode
  useEffect(() => {
    localStorage.setItem(SORT_MODE_KEY, sortMode);
  }, [sortMode]);
  
  // Reset filters when sheet closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setTypeFilter('all');
    }
  }, [isOpen]);
  
  // Calculate counts for each filter type
  const typeCounts = useMemo(() => {
    return {
      all: shortcuts.length,
      link: shortcuts.filter(s => s.type === 'link').length,
      file: shortcuts.filter(s => s.type === 'file').length,
      whatsapp: shortcuts.filter(s => s.type === 'message' && s.messageApp === 'whatsapp').length,
      contact: shortcuts.filter(s => s.type === 'contact').length,
    };
  }, [shortcuts]);
  
  // Filter and sort shortcuts
  const filteredShortcuts = useMemo(() => {
    let result = [...shortcuts];
    
    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter(s => {
        if (typeFilter === 'whatsapp') return s.type === 'message' && s.messageApp === 'whatsapp';
        if (typeFilter === 'contact') return s.type === 'contact';
        if (typeFilter === 'link') return s.type === 'link';
        if (typeFilter === 'file') return s.type === 'file';
        return true;
      });
    }
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(s => 
        s.name.toLowerCase().includes(query) ||
        s.contentUri?.toLowerCase().includes(query) ||
        s.phoneNumber?.includes(query)
      );
    }
    
    // Sort
    result.sort((a, b) => {
      switch (sortMode) {
        case 'usage': 
          return (b.usageCount || 0) - (a.usageCount || 0);
        case 'newest': 
          return b.createdAt - a.createdAt;
        case 'alphabetical': 
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
    
    return result;
  }, [shortcuts, typeFilter, searchQuery, sortMode]);
  
  // Check if filters are active
  const hasActiveFilters = searchQuery.trim() !== '' || typeFilter !== 'all';
  
  // Manual refresh handler
  const handleManualRefresh = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncWithHomeScreen();
    } finally {
      setTimeout(() => setIsSyncing(false), 500);
    }
  }, [syncWithHomeScreen]);
  
  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setTypeFilter('all');
  }, []);
  
  const handleShortcutTap = useCallback((shortcut: ShortcutData) => {
    setSelectedShortcut(shortcut);
  }, []);
  
  const handleCloseActionSheet = useCallback(() => {
    setSelectedShortcut(null);
  }, []);
  
  const handleEdit = useCallback((shortcut: ShortcutData) => {
    setSelectedShortcut(null);
    setTimeout(() => {
      setEditingShortcut(shortcut);
    }, 150);
  }, []);
  
  const handleDelete = useCallback((id: string) => {
    deleteShortcut(id);
    setSelectedShortcut(null);
  }, [deleteShortcut]);
  
  const handleCreateReminder = useCallback((shortcut: ShortcutData) => {
    setSelectedShortcut(null);
    onClose();
    
    let destination: ScheduledActionDestination;
    if (shortcut.type === 'contact' || shortcut.type === 'message') {
      destination = { 
        type: 'contact', 
        phoneNumber: shortcut.phoneNumber || '', 
        contactName: shortcut.name,
        isWhatsApp: shortcut.type === 'message' && shortcut.messageApp === 'whatsapp',
        quickMessage: shortcut.quickMessages?.[0],
      };
    } else {
      destination = { 
        type: 'url', 
        uri: shortcut.contentUri, 
        name: shortcut.name 
      };
    }
    
    setTimeout(() => {
      onCreateReminder(destination);
    }, 200);
  }, [onClose, onCreateReminder]);
  
  const handleOpen = useCallback((shortcut: ShortcutData) => {
    incrementUsage(shortcut.id);
    setSelectedShortcut(null);
    
    if (shortcut.type === 'link') {
      window.open(shortcut.contentUri, '_blank');
    } else if (shortcut.type === 'contact' && shortcut.phoneNumber) {
      window.open(`tel:${shortcut.phoneNumber}`, '_self');
    } else if (shortcut.type === 'message' && shortcut.phoneNumber) {
      const phone = shortcut.phoneNumber.replace(/\D/g, '');
      window.open(`https://wa.me/${phone}`, '_blank');
    }
  }, [incrementUsage]);
  
  const handleSaveEdit = useCallback(async (id: string, updates: Parameters<typeof updateShortcut>[1]) => {
    return await updateShortcut(id, updates);
  }, [updateShortcut]);
  
  const TYPE_FILTERS: Array<{ value: TypeFilter; labelKey: string; icon: React.ReactNode }> = [
    { value: 'all', labelKey: 'shortcuts.filterAll', icon: null },
    { value: 'link', labelKey: 'shortcuts.filterLinks', icon: <Link2 className="h-3.5 w-3.5" /> },
    { value: 'file', labelKey: 'shortcuts.filterFiles', icon: <FileIcon className="h-3.5 w-3.5" /> },
    { value: 'whatsapp', labelKey: 'shortcuts.filterWhatsApp', icon: <MessageCircle className="h-3.5 w-3.5" /> },
    { value: 'contact', labelKey: 'shortcuts.filterContacts', icon: <Phone className="h-3.5 w-3.5" /> },
  ];
  
  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col">
          <SheetHeader className="p-4 pb-2 border-b flex flex-row items-center justify-between">
            <SheetTitle className="text-start">{t('shortcuts.title')}</SheetTitle>
            <div className="flex items-center gap-2">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleManualRefresh}
                      disabled={isSyncing}
                      className="h-8 w-8"
                    >
                      <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{t('shortcuts.syncTooltip')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </SheetHeader>
          
          {/* Search and Filter Controls */}
          {shortcuts.length > 0 && (
            <div className="px-4 py-3 space-y-3 border-b">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder={t('shortcuts.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              
              {/* Type Filter Chips */}
              <ScrollArea className="w-full">
                <div className="flex gap-2 pb-1">
                  {TYPE_FILTERS.map(({ value, labelKey, icon }) => (
                    <TypeFilterChip
                      key={value}
                      value={value}
                      label={t(labelKey)}
                      icon={icon}
                      isActive={typeFilter === value}
                      count={typeCounts[value]}
                      onClick={() => setTypeFilter(value)}
                    />
                  ))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
              
              {/* Sort Controls and Result Count */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <SortButton
                    mode="usage"
                    currentMode={sortMode}
                    icon={<BarChart3 className="h-4 w-4" />}
                    tooltip={t('shortcuts.sortMostUsed')}
                    onClick={() => setSortMode('usage')}
                  />
                  <SortButton
                    mode="newest"
                    currentMode={sortMode}
                    icon={<Clock className="h-4 w-4" />}
                    tooltip={t('shortcuts.sortNewest')}
                    onClick={() => setSortMode('newest')}
                  />
                  <SortButton
                    mode="alphabetical"
                    currentMode={sortMode}
                    icon={<ArrowDownAZ className="h-4 w-4" />}
                    tooltip={t('shortcuts.sortAZ')}
                    onClick={() => setSortMode('alphabetical')}
                  />
                </div>
                
                {hasActiveFilters && (
                  <span className="text-sm text-muted-foreground">
                    {t('shortcuts.searchResults', { count: filteredShortcuts.length })}
                  </span>
                )}
              </div>
            </div>
          )}
          
          {shortcuts.length === 0 ? (
            // Global empty state - no shortcuts at all
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Zap className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-1">{t('shortcuts.empty')}</h3>
              <p className="text-sm text-muted-foreground">{t('shortcuts.emptyDesc')}</p>
            </div>
          ) : filteredShortcuts.length === 0 ? (
            // No results for filter/search
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-1">{t('shortcuts.noMatch')}</h3>
              <Button
                variant="link"
                onClick={handleClearFilters}
                className="text-primary"
              >
                {t('shortcuts.clearFilters')}
              </Button>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="p-2">
                {filteredShortcuts.map((shortcut) => (
                  <ShortcutListItem
                    key={shortcut.id}
                    shortcut={shortcut}
                    onTap={handleShortcutTap}
                    t={t}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
      
      {/* Action Sheet */}
      <ShortcutActionSheet
        shortcut={selectedShortcut}
        isOpen={!!selectedShortcut}
        onClose={handleCloseActionSheet}
        onOpen={handleOpen}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCreateReminder={handleCreateReminder}
      />
      
      {/* Edit Sheet */}
      <ShortcutEditSheet
        shortcut={editingShortcut}
        isOpen={!!editingShortcut}
        onClose={() => setEditingShortcut(null)}
        onSave={handleSaveEdit}
      />
    </>
  );
}
