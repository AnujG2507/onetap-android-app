import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Zap, ChevronRight, ChevronDown, RefreshCw, Search, X, Link2, FileIcon, MessageCircle, Phone, BarChart3, Clock, ArrowDownAZ, CloudOff, Home, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { generateGridIcon } from '@/lib/slideshowIconGenerator';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { buildImageSources } from '@/lib/imageUtils';
import { useShortcuts } from '@/hooks/useShortcuts';
import { detectPlatform } from '@/lib/platformIcons';
import { pickFile, pickMultipleImages, type FileTypeFilter } from '@/lib/contentResolver';
import { createHomeScreenShortcut } from '@/lib/shortcutManager';
import { Capacitor } from '@capacitor/core';
import { PlatformIcon } from '@/components/PlatformIcon';
import { ShortcutActionSheet } from '@/components/ShortcutActionSheet';
import { ShortcutEditSheet } from '@/components/ShortcutEditSheet';
import type { ShortcutData } from '@/types/shortcut';
import { isDormant } from '@/types/shortcut';
import type { ScheduledActionDestination } from '@/types/scheduledAction';

export interface MyShortcutsContentProps {
  onCreateReminder: (destination: ScheduledActionDestination) => void;
  onRefresh?: () => void;
  isSyncing?: boolean;
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

// Render shortcut icon with bulletproof image loading
function ShortcutIcon({ shortcut }: { shortcut: ShortcutData }) {
  const { icon } = shortcut;
  const dormant = isDormant(shortcut);
  
  // Build priority-ordered list of image sources for thumbnail icons
  const imageSources = useMemo(() => {
    if (icon.type !== 'thumbnail') return [];
    return buildImageSources(icon.value, shortcut.thumbnailData);
  }, [icon.type, icon.value, shortcut.thumbnailData]);
  
  // Default fallback component
  const fallbackIcon = (
    <div className={cn("h-12 w-12 rounded-xl bg-muted flex items-center justify-center", dormant && "opacity-40 grayscale")}>
      <Zap className="h-5 w-5 text-muted-foreground" />
    </div>
  );
  
  if (icon.type === 'emoji') {
    return (
      <div className="relative">
        <div className={cn("h-12 w-12 rounded-xl bg-muted flex items-center justify-center text-2xl", dormant && "opacity-40 grayscale")}>
          {icon.value}
        </div>
        {dormant && <DormantBadge />}
      </div>
    );
  }
  
  if (icon.type === 'platform') {
    const platform = detectPlatform(`https://${icon.value}.com`);
    if (platform) {
      return (
        <div className="relative">
          <div className={cn(dormant && "opacity-40 grayscale")}>
            <PlatformIcon platform={platform} size="lg" className="rounded-xl" />
          </div>
          {dormant && <DormantBadge />}
        </div>
      );
    }
    return fallbackIcon;
  }
  
  if (icon.type === 'favicon') {
    return (
      <div className="relative">
        <div className={cn("h-12 w-12 rounded-xl bg-white dark:bg-gray-100 flex items-center justify-center overflow-hidden shadow-sm", dormant && "opacity-40 grayscale")}>
          <ImageWithFallback
            sources={[icon.value]}
            fallback={<Globe className="h-6 w-6 text-muted-foreground" />}
            alt=""
            className="h-[70%] w-[70%] object-contain"
            containerClassName="flex items-center justify-center"
            showSkeleton={false}
          />
        </div>
        {dormant && <DormantBadge />}
      </div>
    );
  }
  
  if (icon.type === 'thumbnail' && imageSources.length > 0) {
    return (
      <div className="relative">
        <div className={cn("h-12 w-12 rounded-xl overflow-hidden bg-muted", dormant && "opacity-40 grayscale")}>
          <ImageWithFallback
            sources={imageSources}
            fallback={<Zap className="h-5 w-5 text-muted-foreground" />}
            alt={shortcut.name}
            className="h-full w-full object-cover"
            containerClassName="h-full w-full flex items-center justify-center"
          />
        </div>
        {dormant && <DormantBadge />}
      </div>
    );
  }
  
  if (icon.type === 'text') {
    return (
      <div className="relative">
        <div className={cn("h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center", dormant && "opacity-40 grayscale")}>
          <span className="text-sm font-semibold text-primary truncate px-1">
            {icon.value.slice(0, 2).toUpperCase()}
          </span>
        </div>
        {dormant && <DormantBadge />}
      </div>
    );
  }
  
  // Default fallback
  return fallbackIcon;
}

// Small badge overlay for dormant shortcuts
function DormantBadge() {
  return (
    <div className="absolute -bottom-1 -end-1 h-5 w-5 rounded-full bg-muted-foreground/80 flex items-center justify-center">
      <CloudOff className="h-3 w-3 text-background" />
    </div>
  );
}

// Check if target is "long" (more than ~20 chars)
const TARGET_EXPAND_THRESHOLD = 20;

// Individual shortcut list item - grid-based, hard overflow guarantees
function ShortcutListItem({
  shortcut,
  onTap,
  t,
}: {
  shortcut: ShortcutData;
  onTap: (shortcut: ShortcutData) => void;
  t: (key: string) => string;
}) {
  const [isTargetExpanded, setIsTargetExpanded] = useState(false);
  const typeLabel = getShortcutTypeLabel(shortcut, t);
  const target = getShortcutTarget(shortcut);
  const usageCount = shortcut.usageCount || 0;
  const isTargetLong = target && target.length > TARGET_EXPAND_THRESHOLD;
  const dormant = isDormant(shortcut);

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTargetExpanded((prev) => !prev);
  };

  return (
    <button
      onClick={() => onTap(shortcut)}
      className="w-full grid grid-cols-[48px_minmax(0,1fr)_16px] items-center gap-3 p-3 rounded-xl border border-border/60 bg-card mb-2 hover:bg-muted/50 active:bg-muted transition-colors text-start shadow-sm overflow-hidden"
    >
      {/* Icon - fixed 48px */}
      <div className="shrink-0">
        <ShortcutIcon shortcut={shortcut} />
      </div>

      {/* Text column - must be minmax(0,1fr) to enable truncation */}
      <div className="min-w-0 overflow-hidden flex flex-col">
        {/* Title */}
        <span className={cn("font-medium truncate", dormant && "text-muted-foreground")}>
          {shortcut.name}
        </span>
        {dormant && (
          <span className="text-xs text-muted-foreground/70 mt-0.5">
            {t('shortcuts.tapToReconnect')}
          </span>
        )}

        {/* Meta row: Type | Target (truncates unless expanded) | Expand button | Badge */}
        <div className="mt-0.5 min-w-0 overflow-hidden flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">
            {typeLabel}
          </span>

          {target && (
            <span 
              className={cn(
                "text-xs text-muted-foreground flex-1 min-w-0",
                !isTargetExpanded && "truncate"
              )}
              style={isTargetExpanded ? { wordBreak: 'break-all' } : undefined}
            >
              · {target}
            </span>
          )}

          {isTargetLong && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleExpandClick}
              onKeyDown={(e) => e.key === 'Enter' && handleExpandClick(e as unknown as React.MouseEvent)}
              className="shrink-0 p-0.5 rounded hover:bg-muted/80 transition-colors cursor-pointer"
              aria-label={isTargetExpanded ? t('common.collapse') : t('common.expand')}
            >
              <motion.span
                animate={{ rotate: isTargetExpanded ? 180 : 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                style={{ display: 'flex' }}
              >
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </motion.span>
            </span>
          )}

          <Badge
            variant="outline"
            className="shrink-0 text-[10px] px-1.5 py-0 h-5 font-semibold bg-primary/5 border-primary/20 text-primary whitespace-nowrap"
          >
            {usageCount} {usageCount === 1 ? t('shortcuts.tap') : t('shortcuts.taps')}
          </Badge>
        </div>
      </div>

      {/* Chevron - fixed */}
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 rtl:rotate-180" />
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

export function MyShortcutsContent({ onCreateReminder, onRefresh, isSyncing: externalSyncing }: MyShortcutsContentProps) {
  const { t } = useTranslation();
  const { shortcuts, deleteShortcut, updateShortcut, getShortcut, incrementUsage, syncWithHomeScreen, refreshFromStorage } = useShortcuts();
  const [selectedShortcut, setSelectedShortcut] = useState<ShortcutData | null>(null);
  const [editingShortcut, setEditingShortcut] = useState<ShortcutData | null>(null);
  const [internalSyncing, setInternalSyncing] = useState(false);
  
  // Use external syncing state if provided, otherwise use internal
  const isSyncing = externalSyncing !== undefined ? externalSyncing : internalSyncing;
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [showDormant, setShowDormant] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const saved = localStorage.getItem(SORT_MODE_KEY);
    return (saved as SortMode) || 'usage';
  });
  
  // Sync with home screen on mount
  useEffect(() => {
    syncWithHomeScreen();
  }, [syncWithHomeScreen]);
  
  // Persist sort mode
  useEffect(() => {
    localStorage.setItem(SORT_MODE_KEY, sortMode);
  }, [sortMode]);
  
  // Separate active and dormant shortcuts
  const activeShortcuts = useMemo(() => shortcuts.filter(s => !isDormant(s)), [shortcuts]);
  const dormantCount = useMemo(() => shortcuts.filter(s => isDormant(s)).length, [shortcuts]);
  
  // Calculate counts for each filter type (active only)
  const typeCounts = useMemo(() => {
    return {
      all: activeShortcuts.length,
      link: activeShortcuts.filter(s => s.type === 'link').length,
      file: activeShortcuts.filter(s => s.type === 'file').length,
      whatsapp: activeShortcuts.filter(s => s.type === 'message' && s.messageApp === 'whatsapp').length,
      contact: activeShortcuts.filter(s => s.type === 'contact').length,
    };
  }, [activeShortcuts]);
  
  // Filter and sort shortcuts
  const filteredShortcuts = useMemo(() => {
    // Start with active shortcuts, or include dormant if toggled on
    let result = showDormant ? [...shortcuts] : [...activeShortcuts];
    
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
  }, [shortcuts, activeShortcuts, showDormant, typeFilter, searchQuery, sortMode]);
  
  // Check if filters are active
  const hasActiveFilters = searchQuery.trim() !== '' || typeFilter !== 'all';
  
  // Manual refresh handler - exposed for parent to call
  const handleManualRefresh = useCallback(async () => {
    if (onRefresh) {
      onRefresh();
      return;
    }
    setInternalSyncing(true);
    try {
      refreshFromStorage();
      await syncWithHomeScreen();
    } finally {
      setTimeout(() => setInternalSyncing(false), 500);
    }
  }, [onRefresh, refreshFromStorage, syncWithHomeScreen]);
  
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
  
  const handleCreateReminderFromShortcut = useCallback((shortcut: ShortcutData) => {
    setSelectedShortcut(null);
    
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
    
    onCreateReminder(destination);
  }, [onCreateReminder]);
  
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

  // Handler for re-adding shortcut to home screen
  const handleReAddToHomeScreen = useCallback(async (shortcut: ShortcutData) => {
    const success = await createHomeScreenShortcut(shortcut, {
      fileData: shortcut.thumbnailData,
      thumbnailData: shortcut.thumbnailData,
    });
    if (success) {
      toast.success(t('shortcutAction.addedToHomeScreen', 'Added to home screen'));
    }
  }, [t]);
  
  const handleReconnect = useCallback(async (shortcut: ShortcutData) => {
    setSelectedShortcut(null);
    
    // Helper to offer re-adding to home screen after reconnection
    const offerHomeScreenAdd = (reconnectedShortcut: ShortcutData) => {
      if (!Capacitor.isNativePlatform()) {
        toast.success(t('shortcutAction.reconnected'));
        return;
      }
      
      toast.success(t('shortcutAction.reconnected'), {
        action: {
          label: t('shortcutAction.addToHomeScreen', 'Add to Home Screen'),
          onClick: async () => {
            const latest = getShortcut(reconnectedShortcut.id);
            if (latest) {
              const success = await createHomeScreenShortcut(latest, {
                fileData: latest.thumbnailData,
                thumbnailData: latest.thumbnailData,
              });
              if (success) {
                toast.success(t('shortcutAction.addedToHomeScreen', 'Added to home screen'));
              }
            }
          },
        },
        duration: 5000,
      });
    };
    
    // Slideshow: pick multiple images
    if (shortcut.type === 'slideshow') {
      const result = await pickMultipleImages();
      if (!result || result.files.length < 2) return;
      
      const thumbnails = result.files.map(f => f.thumbnail).filter(Boolean) as string[];
      
      // Regenerate grid icon from new photos
      let newIcon = shortcut.icon;
      if (thumbnails.length > 0) {
        const gridIconData = await generateGridIcon(thumbnails.slice(0, 4));
        newIcon = { type: 'thumbnail' as const, value: gridIconData };
      }
      
      await updateShortcut(shortcut.id, {
        imageUris: result.files.map(f => f.uri),
        imageThumbnails: thumbnails,
        icon: newIcon,
        syncState: undefined,
      });
      
      offerHomeScreenAdd({ ...shortcut, icon: newIcon, syncState: undefined });
      return;
    }
    
    // Single file: pick one file
    const filterMap: Record<string, FileTypeFilter> = {
      image: 'image',
      video: 'video',
      pdf: 'document',
      audio: 'audio',
      document: 'document',
    };
    const filter: FileTypeFilter = filterMap[shortcut.fileType || ''] || 'all';
    
    const result = await pickFile(filter);
    if (!result) return;
    
    await updateShortcut(shortcut.id, {
      contentUri: result.uri,
      mimeType: result.mimeType,
      fileSize: result.fileSize,
      thumbnailData: result.thumbnailData,
      syncState: undefined,
    });
    
    offerHomeScreenAdd({ ...shortcut, contentUri: result.uri, thumbnailData: result.thumbnailData, syncState: undefined });
  }, [updateShortcut, getShortcut, t]);
  
  const TYPE_FILTERS: Array<{ value: TypeFilter; labelKey: string; icon: React.ReactNode }> = [
    { value: 'all', labelKey: 'shortcuts.filterAll', icon: null },
    { value: 'link', labelKey: 'shortcuts.filterLinks', icon: <Link2 className="h-3.5 w-3.5" /> },
    { value: 'file', labelKey: 'shortcuts.filterFiles', icon: <FileIcon className="h-3.5 w-3.5" /> },
    { value: 'whatsapp', labelKey: 'shortcuts.filterWhatsApp', icon: <MessageCircle className="h-3.5 w-3.5" /> },
    { value: 'contact', labelKey: 'shortcuts.filterContacts', icon: <Phone className="h-3.5 w-3.5" /> },
  ];
  
  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
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
              <div className="flex gap-2 pb-1 w-max pe-4">
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
                {dormantCount > 0 && (
                  <button
                    onClick={() => setShowDormant(prev => !prev)}
                    className={`
                      flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors
                      ${showDormant 
                        ? 'bg-muted-foreground/80 text-background' 
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                      }
                    `}
                  >
                    <CloudOff className="h-3.5 w-3.5" />
                    <span>{t('shortcuts.filterDormant', 'Dormant')}</span>
                    <span className={`text-xs ${showDormant ? 'text-background/70' : 'text-muted-foreground/70'}`}>
                      ({dormantCount})
                    </span>
                  </button>
                )}
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
          <ScrollArea className="flex-1 w-full" viewportClassName="overflow-x-hidden">
            <div className="p-2 grid grid-cols-1 landscape:grid-cols-2 gap-x-3">
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
      </div>
      
      {/* Action Sheet */}
      <ShortcutActionSheet
        shortcut={selectedShortcut}
        isOpen={!!selectedShortcut}
        onClose={handleCloseActionSheet}
        onOpen={handleOpen}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCreateReminder={handleCreateReminderFromShortcut}
        onReconnect={handleReconnect}
      />
      
      {/* Edit Sheet */}
      <ShortcutEditSheet
        shortcut={editingShortcut}
        isOpen={!!editingShortcut}
        onClose={() => setEditingShortcut(null)}
        onSave={handleSaveEdit}
        onReAddToHomeScreen={handleReAddToHomeScreen}
      />
    </>
  );
}
