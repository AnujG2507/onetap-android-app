import { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, ArrowLeftRight, X, RotateCcw } from 'lucide-react';
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
  getTrashCount,
  type TrashedLink,
} from '@/lib/savedLinksManager';
import { getSettings } from '@/lib/settingsManager';
import { TrashItem } from './TrashItem';

const HINT_DISMISSED_KEY = 'trash_hint_dismissed';

interface TrashSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onRestored?: () => void;
}

export function TrashSheet({ open: controlledOpen, onOpenChange, onRestored }: TrashSheetProps) {
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
        title: 'Bookmark restored',
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
      title: 'Permanently deleted',
      duration: 2000,
    });
    triggerHaptic('warning');
  };

  const handleEmptyTrash = () => {
    emptyTrash();
    refreshTrash();
    setShowEmptyConfirm(false);
    toast({
      title: 'Trash emptied',
      description: 'All items have been permanently deleted',
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
      title: 'All items restored',
      description: `${restored.length} bookmark${restored.length !== 1 ? 's' : ''} restored`,
      duration: 2000,
    });
    triggerHaptic('success');
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
          <SheetHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <SheetTitle className="text-left">Trash</SheetTitle>
                  <p className="text-xs text-muted-foreground">
                    {trashLinks.length === 0 
                      ? 'No items in trash' 
                      : `${trashLinks.length} item${trashLinks.length !== 1 ? 's' : ''}`
                    }
                  </p>
                </div>
              </div>
              {trashLinks.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRestoreAllConfirm(true)}
                    className="h-8"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Restore All
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowEmptyConfirm(true)}
                    className="h-8"
                  >
                    Empty Trash
                  </Button>
                </div>
              )}
            </div>
          </SheetHeader>

          {trashLinks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center px-8">
              <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Trash2 className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Trash is empty</h3>
              <p className="text-sm text-muted-foreground">
                Deleted bookmarks will appear here for {getSettings().trashRetentionDays} days before being permanently removed.
              </p>
            </div>
          ) : (
            <>
              {showHint && (
                <div className="flex items-center justify-between gap-2 p-3 mb-3 bg-muted/50 rounded-lg border border-border/50">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ArrowLeftRight className="h-4 w-4 shrink-0" />
                    <span>Swipe right to restore, left to delete</span>
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
              <ScrollArea className="h-[calc(85vh-140px)] -mx-6 px-6">
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
              Empty Trash?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {trashLinks.length} item{trashLinks.length !== 1 ? 's' : ''} in trash. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEmptyTrash}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Empty Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This bookmark will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedId && handlePermanentDelete(selectedId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
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
              Restore All Items?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will restore all {trashLinks.length} item{trashLinks.length !== 1 ? 's' : ''} from trash back to your bookmarks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestoreAll}>
              Restore All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
