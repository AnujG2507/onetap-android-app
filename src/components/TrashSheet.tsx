import { useState, useEffect } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
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
  permanentlyDelete,
  emptyTrash,
  getTrashCount,
  type TrashedLink,
} from '@/lib/savedLinksManager';
import { TrashItem } from './TrashItem';

interface TrashSheetProps {
  onRestored?: () => void;
}

export function TrashSheet({ onRestored }: TrashSheetProps) {
  const [open, setOpen] = useState(false);
  const [trashLinks, setTrashLinks] = useState<TrashedLink[]>([]);
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { toast } = useToast();

  const refreshTrash = () => {
    setTrashLinks(getTrashLinks());
  };

  useEffect(() => {
    if (open) {
      refreshTrash();
    }
  }, [open]);

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

  const trashCount = getTrashCount();

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9"
          >
            <Trash2 className="h-4 w-4" />
            {trashCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground flex items-center justify-center">
                {trashCount > 99 ? '99+' : trashCount}
              </span>
            )}
          </Button>
        </SheetTrigger>
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
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowEmptyConfirm(true)}
                  className="h-8"
                >
                  Empty Trash
                </Button>
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
                Deleted bookmarks will appear here for 30 days before being permanently removed.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(85vh-120px)] -mx-6 px-6">
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
    </>
  );
}
