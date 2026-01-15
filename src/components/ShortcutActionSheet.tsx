import { useState } from 'react';
import { RefreshCw, Pencil, Trash2, Link2, FileText } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
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
import { createHomeScreenShortcut } from '@/lib/shortcutManager';
import type { ShortcutData } from '@/types/shortcut';

interface ShortcutActionSheetProps {
  shortcut: ShortcutData;
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFileMissing: () => void;
}

export function ShortcutActionSheet({
  shortcut,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onFileMissing,
}: ShortcutActionSheetProps) {
  const { toast } = useToast();
  const [isRecreating, setIsRecreating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleRecreate = async () => {
    setIsRecreating(true);
    try {
      // For URLs, we can recreate directly
      if (shortcut.type === 'link') {
        const success = await createHomeScreenShortcut(shortcut, {
          thumbnailData: shortcut.thumbnailData,
        });
        
        if (success) {
          toast({
            title: 'Shortcut recreated',
            description: 'The shortcut has been added to your home screen.',
          });
          onClose();
        } else {
          toast({
            title: 'Failed to recreate',
            description: 'Could not add the shortcut. Please try again.',
            variant: 'destructive',
          });
        }
        return;
      }

      // For files, check if accessible (only on native)
      if (Capacitor.isNativePlatform()) {
        try {
          // Attempt to recreate - if file is missing, native side will fail
          const success = await createHomeScreenShortcut(shortcut, {
            thumbnailData: shortcut.thumbnailData,
            mimeType: shortcut.mimeType,
          });
          
          if (success) {
            toast({
              title: 'Shortcut recreated',
              description: 'The shortcut has been added to your home screen.',
            });
            onClose();
          } else {
            // File might be missing
            onFileMissing();
          }
        } catch (error) {
          console.error('[ShortcutActionSheet] Recreate failed:', error);
          // File is likely missing
          onFileMissing();
        }
      } else {
        // Web: just recreate
        const success = await createHomeScreenShortcut(shortcut, {
          thumbnailData: shortcut.thumbnailData,
        });
        
        if (success) {
          toast({
            title: 'Shortcut recreated',
            description: 'The shortcut has been added to your home screen.',
          });
          onClose();
        }
      }
    } catch (error) {
      console.error('[ShortcutActionSheet] Recreate error:', error);
      toast({
        title: 'Error',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsRecreating(false);
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    setShowDeleteConfirm(false);
    onDelete();
    toast({
      title: 'Shortcut removed',
      description: 'The shortcut has been removed from your library.',
    });
  };

  const getSourceDisplay = () => {
    if (shortcut.type === 'link') {
      try {
        const url = new URL(shortcut.contentUri);
        return url.hostname;
      } catch {
        return shortcut.contentUri;
      }
    }
    return shortcut.originalPath || shortcut.contentUri.split('/').pop() || 'Local file';
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left pb-4">
            <div className="flex items-center gap-3">
              {shortcut.type === 'link' ? (
                <Link2 className="h-5 w-5 text-muted-foreground" />
              ) : (
                <FileText className="h-5 w-5 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <SheetTitle className="truncate">{shortcut.name}</SheetTitle>
                <p className="text-sm text-muted-foreground truncate mt-0.5">
                  {getSourceDisplay()}
                </p>
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-1">
            <button
              onClick={handleRecreate}
              disabled={isRecreating}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-5 w-5 text-muted-foreground ${isRecreating ? 'animate-spin' : ''}`} />
              <div className="text-left">
                <p className="font-medium text-foreground">Recreate Shortcut</p>
                <p className="text-sm text-muted-foreground">Re-add to home screen</p>
              </div>
            </button>

            <button
              onClick={onEdit}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
            >
              <Pencil className="h-5 w-5 text-muted-foreground" />
              <div className="text-left">
                <p className="font-medium text-foreground">Edit Shortcut</p>
                <p className="text-sm text-muted-foreground">Change name or icon</p>
              </div>
            </button>

            <button
              onClick={handleDeleteClick}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-5 w-5 text-destructive" />
              <div className="text-left">
                <p className="font-medium text-destructive">Delete from Library</p>
                <p className="text-sm text-muted-foreground">Remove metadata only</p>
              </div>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete shortcut?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{shortcut.name}" from your library. Any existing home screen shortcuts will remain until manually removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
