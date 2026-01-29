import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Zap, ChevronRight, RefreshCw } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
    // For thumbnail type, the value contains the base64 data
    // Also check shortcut.thumbnailData as fallback
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

export function ShortcutsList({ isOpen, onClose, onCreateReminder }: ShortcutsListProps) {
  const { t } = useTranslation();
  const { shortcuts, deleteShortcut, updateShortcut, incrementUsage, syncWithHomeScreen } = useShortcuts();
  const [selectedShortcut, setSelectedShortcut] = useState<ShortcutData | null>(null);
  const [editingShortcut, setEditingShortcut] = useState<ShortcutData | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Register with back handler
  useSheetBackHandler('shortcuts-list-sheet', isOpen, onClose);
  
  // Sync with home screen when sheet opens
  useEffect(() => {
    if (isOpen) {
      syncWithHomeScreen();
    }
  }, [isOpen, syncWithHomeScreen]);
  
  // Manual refresh handler
  const handleManualRefresh = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncWithHomeScreen();
    } finally {
      // Brief delay to show animation
      setTimeout(() => setIsSyncing(false), 500);
    }
  }, [syncWithHomeScreen]);
  
  // Sort shortcuts by usage count (descending)
  const sortedShortcuts = useMemo(() => {
    return [...shortcuts].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
  }, [shortcuts]);
  
  const handleShortcutTap = useCallback((shortcut: ShortcutData) => {
    setSelectedShortcut(shortcut);
  }, []);
  
  const handleCloseActionSheet = useCallback(() => {
    setSelectedShortcut(null);
  }, []);
  
  const handleEdit = useCallback((shortcut: ShortcutData) => {
    setSelectedShortcut(null);
    // Small delay to allow action sheet to close
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
    
    // Build destination from shortcut
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
    
    // Open the content based on type
    if (shortcut.type === 'link') {
      window.open(shortcut.contentUri, '_blank');
    } else if (shortcut.type === 'contact' && shortcut.phoneNumber) {
      window.open(`tel:${shortcut.phoneNumber}`, '_self');
    } else if (shortcut.type === 'message' && shortcut.phoneNumber) {
      const phone = shortcut.phoneNumber.replace(/\D/g, '');
      window.open(`https://wa.me/${phone}`, '_blank');
    }
    // File types would need native handling
  }, [incrementUsage]);
  
  const handleSaveEdit = useCallback((id: string, updates: Parameters<typeof updateShortcut>[1]) => {
    updateShortcut(id, updates);
  }, [updateShortcut]);
  
  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col">
          <SheetHeader className="p-4 pb-2 border-b flex flex-row items-center justify-between">
            <SheetTitle className="text-start">{t('shortcuts.title')}</SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleManualRefresh}
              disabled={isSyncing}
              className="h-8 w-8"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            </Button>
          </SheetHeader>
          
          {sortedShortcuts.length === 0 ? (
            // Empty state
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Zap className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-1">{t('shortcuts.empty')}</h3>
              <p className="text-sm text-muted-foreground">{t('shortcuts.emptyDesc')}</p>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="p-2">
                {sortedShortcuts.map((shortcut) => {
                  const typeLabel = getShortcutTypeLabel(shortcut, t);
                  const target = getShortcutTarget(shortcut);
                  const usageCount = shortcut.usageCount || 0;
                  
                  return (
                    <button
                      key={shortcut.id}
                      onClick={() => handleShortcutTap(shortcut)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 active:bg-muted transition-colors text-start"
                    >
                      <ShortcutIcon shortcut={shortcut} />
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{shortcut.name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {typeLabel}
                          {target && ` · ${target}`}
                        </p>
                      </div>
                      
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {usageCount} {usageCount === 1 ? t('shortcuts.tap') : t('shortcuts.taps')}
                      </Badge>
                      
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 rtl:rotate-180" />
                    </button>
                  );
                })}
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
