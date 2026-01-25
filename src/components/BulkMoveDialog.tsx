import { useState, useMemo } from 'react';
import { FolderInput, Folder, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAllFolders, PRESET_TAGS, getFolderIcon } from '@/lib/savedLinksManager';
import { getIconByName } from './FolderIconPicker';
import { cn } from '@/lib/utils';

interface BulkMoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onMove: (folderName: string | null) => void;
}

export function BulkMoveDialog({ 
  open, 
  onOpenChange, 
  selectedCount,
  onMove 
}: BulkMoveDialogProps) {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  
  const folders = useMemo(() => {
    const allFolders = getAllFolders();
    return allFolders;
  }, [open]);

  const handleMove = () => {
    onMove(selectedFolder);
    onOpenChange(false);
    setSelectedFolder(null);
  };

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setSelectedFolder(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="h-5 w-5" />
            Move {selectedCount} bookmark{selectedCount > 1 ? 's' : ''}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            Select a folder to move the selected bookmarks to:
          </p>
          
          <ScrollArea className="h-[280px] pr-4">
            <div className="space-y-1">
              {/* Uncategorized option */}
              <button
                onClick={() => setSelectedFolder(null)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-start transition-colors",
                  selectedFolder === null
                    ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                    : "hover:bg-muted"
                )}
              >
                <Folder className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-sm font-medium">Uncategorized</span>
                {selectedFolder === null && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </button>
              
              {/* Folder list */}
              {folders.map((folder) => {
                const customIconName = getFolderIcon(folder);
                const CustomIcon = customIconName ? getIconByName(customIconName) : Folder;
                const isSelected = selectedFolder === folder;
                
                return (
                  <button
                    key={folder}
                    onClick={() => setSelectedFolder(folder)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-start transition-colors",
                      isSelected
                        ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                        : "hover:bg-muted"
                    )}
                  >
                    <CustomIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 text-sm font-medium">{folder}</span>
                    {isSelected && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
          
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleMove}>
              Move to {selectedFolder || 'Uncategorized'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
