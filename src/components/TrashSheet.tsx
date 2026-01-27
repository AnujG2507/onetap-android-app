import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, AlertTriangle, ArrowLeftRight, X, RotateCcw, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { useToast } from '@/hooks/use-toast';
import { triggerHaptic } from '@/lib/haptics';
import {
  getTrashLinks,
  restoreFromTrash,
  restoreAllFromTrash,
  permanentlyDelete,
  emptyTrash,
  type TrashedLink,
} from '@/lib/savedLinksManager';
import { getSettings } from '@/lib/settingsManager';
import { TrashItem } from './TrashItem';

const HINT_DISMISSED_KEY = 'trash_hint_dismissed';

interface TrashSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onRestored?: () => void;
  onOpenSettings?: () => void;
}

export function TrashSheet({ open: controlledOpen, onOpenChange, onRestored, onOpenSettings }: TrashSheetProps) {
  const { t } = useTranslation();
  const [internalOpen, setInternalOpen] = useState(false);
  
  // Support both controlled and uncontrolled modes
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setInternalOpen;
  const [trashLinks, setTrashLinks] = useState<TrashedLink[]>([]);
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRestoreAllConfirm, setShowRestoreAllConfirm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const { toast } = useToast();
  
  const handleOpenSettings = () => {
    setOpen(false);
    // Small delay to allow sheet close animation to complete
    setTimeout(() => {
      onOpenSettings?.();
    }, 150);
  };

  // Swipe-to-close gesture tracking
  const touchStartY = useRef<number | null>(null);
  const touchCurrentY = useRef<number | null>(null);
  const isAtTop = useRef(true);
  const SWIPE_CLOSE_THRESHOLD = 80;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchCurrentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (touchStartY.current !== null && touchCurrentY.current !== null && isAtTop.current) {
      const deltaY = touchCurrentY.current - touchStartY.current;
      // Swipe down to close
      if (deltaY > SWIPE_CLOSE_THRESHOLD) {
        triggerHaptic('light');
        setOpen(false);
      }
    }
    touchStartY.current = null;
    touchCurrentY.current = null;
  }, [setOpen]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    isAtTop.current = e.currentTarget.scrollTop <= 0;
  }, []);

  const refreshTrash = () => {
    setTrashLinks(getTrashLinks());
  };

  useEffect(() => {
    if (open) {
      refreshTrash();
      // Check if hint should be shown
      const hintDismissed = localStorage.getItem(HINT_DISMISSED_KEY);
      setShowHint(!hintDismissed);
    }
  }, [open]);

  const handleDismissHint = () => {
    localStorage.setItem(HINT_DISMISSED_KEY, 'true');
    setShowHint(false);
  };

  const handleRestore = (id: string) => {
    const restored = restoreFromTrash(id);
    if (restored) {
      refreshTrash();
      onRestored?.();
      toast({
        title: t('trash.restored'),
        description: restored.title,
        duration: 2000,
      });
      triggerHaptic('success');
    }
  };

  const handlePermanentDelete = (id: string) => {
    permanentlyDelete(id);
    refreshTrash();
    setShowDeleteConfirm(false);
    setSelectedId(null);
    toast({
      title: t('trash.permanentlyDeleted'),
      duration: 2000,
    });
    triggerHaptic('warning');
  };

  const handleEmptyTrash = () => {
    emptyTrash();
    refreshTrash();
    setShowEmptyConfirm(false);
    toast({
      title: t('trash.trashEmptied'),
      description: t('trash.trashEmptiedDesc'),
      duration: 2000,
    });
    triggerHaptic('warning');
  };

  const handleRestoreAll = () => {
    const restored = restoreAllFromTrash();
    refreshTrash();
    setShowRestoreAllConfirm(false);
    onRestored?.();
    toast({
      title: t('trash.allRestored'),
      description: t('trash.allRestoredDesc', { count: restored.length }),
      duration: 2000,
    });
    triggerHaptic('success');
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent 
          side="bottom" 
          className="h-[85vh] rounded-t-2xl"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Swipe indicator */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
          <SheetHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <SheetTitle className="text-start">{t('trash.title')}</SheetTitle>
                  <p className="text-xs text-muted-foreground">
                    {trashLinks.length === 0 
                      ? t('trash.noItems')
                      : t('trash.itemCount', { count: trashLinks.length })
                    }
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs text-muted-foreground"
                onClick={handleOpenSettings}
              >
                <Settings className="h-3.5 w-3.5" />
                {t('settingsPage.trashRetention')}
              </Button>
            </div>
            {trashLinks.length > 0 && (
              <div className="flex items-center gap-2 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRestoreAllConfirm(true)}
                  className="h-8 flex-1"
                >
                  <RotateCcw className="h-3.5 w-3.5 me-1.5" />
                  {t('trash.restoreAll')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowEmptyConfirm(true)}
                  className="h-8 flex-1"
                >
                  {t('trash.emptyTrash')}
                </Button>
              </div>
            )}
          </SheetHeader>

          {trashLinks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center px-8">
              <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Trash2 className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">{t('trash.empty')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('trash.emptyDesc', { days: getSettings().trashRetentionDays })}
              </p>
            </div>
          ) : (
            <>
              {showHint && (
                <div className="flex items-center justify-between gap-2 p-3 mb-3 bg-muted/50 rounded-lg border border-border/50">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ArrowLeftRight className="h-4 w-4 shrink-0" />
                    <span>{t('trash.swipeHint')}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={handleDismissHint}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
              <ScrollArea className="h-[calc(85vh-180px)] -mx-6 px-6" onScrollCapture={handleScroll}>
                <div className="space-y-2 pb-6">
                  {trashLinks.map((link) => (
                    <TrashItem
                      key={link.id}
                      link={link}
                      onRestore={handleRestore}
                      onDelete={(id) => {
                        setSelectedId(id);
                        setShowDeleteConfirm(true);
                      }}
                    />
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Empty Trash Confirmation */}
      <AlertDialog open={showEmptyConfirm} onOpenChange={setShowEmptyConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t('trash.emptyTrashConfirm')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('trash.emptyTrashDesc', { count: trashLinks.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEmptyTrash}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('trash.emptyTrash')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('trash.deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('trash.deleteConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedId(null)}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedId && handlePermanentDelete(selectedId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore All Confirmation */}
      <AlertDialog open={showRestoreAllConfirm} onOpenChange={setShowRestoreAllConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-primary" />
              {t('trash.restoreAllConfirm')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('trash.restoreAllDesc', { count: trashLinks.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestoreAll}>
              {t('trash.restoreAll')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
