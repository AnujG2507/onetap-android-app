import { useState } from 'react';
import { FileQuestion } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useShortcuts } from '@/hooks/useShortcuts';
import { pickFile, FileTypeFilter } from '@/lib/contentResolver';
import { createHomeScreenShortcut } from '@/lib/shortcutManager';
import type { ShortcutData } from '@/types/shortcut';

interface FileReplacementDialogProps {
  shortcut: ShortcutData;
  isOpen: boolean;
  onClose: () => void;
}

export function FileReplacementDialog({
  shortcut,
  isOpen,
  onClose,
}: FileReplacementDialogProps) {
  const { toast } = useToast();
  const { updateShortcut } = useShortcuts();
  const [isSelecting, setIsSelecting] = useState(false);

  const getFileFilter = (): FileTypeFilter => {
    switch (shortcut.fileType) {
      case 'image':
        return 'image';
      case 'video':
        return 'video';
      case 'audio':
        return 'audio';
      case 'pdf':
      case 'document':
        return 'document';
      default:
        return 'all';
    }
  };

  const handleSelectReplacement = async () => {
    setIsSelecting(true);
    try {
      const file = await pickFile(getFileFilter());
      
      if (!file) {
        setIsSelecting(false);
        return;
      }

      // Update the shortcut with new file data
      const updatedShortcut: ShortcutData = {
        ...shortcut,
        contentUri: file.uri,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        thumbnailData: file.thumbnailData,
        updatedAt: Date.now(),
      };

      // Update in storage
      updateShortcut(shortcut.id, {
        contentUri: file.uri,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        thumbnailData: file.thumbnailData,
      });

      // Recreate the shortcut
      const success = await createHomeScreenShortcut(updatedShortcut, {
        fileData: file.fileData,
        fileSize: file.fileSize,
        thumbnailData: file.thumbnailData,
        mimeType: file.mimeType,
      });

      if (success) {
        toast({
          title: 'Shortcut recreated',
          description: 'The shortcut has been added with the new file.',
        });
        onClose();
      } else {
        toast({
          title: 'Failed to recreate',
          description: 'Could not create the shortcut. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('[FileReplacementDialog] Error:', error);
      toast({
        title: 'Error',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSelecting(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <FileQuestion className="h-5 w-5 text-muted-foreground" />
            </div>
            <AlertDialogTitle>File Not Found</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            The original file could not be found. Select a replacement to recreate the shortcut with the same name and icon.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleSelectReplacement}
            disabled={isSelecting}
            className="w-full"
          >
            {isSelecting ? 'Selecting...' : 'Select Replacement File'}
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSelecting}
            className="w-full"
          >
            Cancel
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
