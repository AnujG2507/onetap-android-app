import { useState, useEffect } from 'react';
import { Pencil, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { renameFolder, PRESET_TAGS, getCustomFolders, getFolderIcon, setFolderIcon } from '@/lib/savedLinksManager';
import { useToast } from '@/hooks/use-toast';
import { triggerHaptic } from '@/lib/haptics';
import { FolderIconPicker } from './FolderIconPicker';

interface EditFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderName: string;
  onFolderUpdated: () => void;
}

export function EditFolderDialog({ 
  open, 
  onOpenChange, 
  folderName, 
  onFolderUpdated 
}: EditFolderDialogProps) {
  const [newName, setNewName] = useState(folderName);
  const [selectedIcon, setSelectedIcon] = useState('Folder');
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setNewName(folderName);
      const currentIcon = getFolderIcon(folderName);
      setSelectedIcon(currentIcon || 'Folder');
    }
  }, [open, folderName]);

  const handleSave = () => {
    const trimmed = newName.trim();
    
    if (!trimmed) {
      toast({
        title: 'Please enter a folder name',
        duration: 2000,
      });
      return;
    }
    
    // Check for duplicates (excluding current name)
    if (trimmed !== folderName) {
      if (PRESET_TAGS.includes(trimmed) || getCustomFolders().includes(trimmed)) {
        toast({
          title: 'Folder already exists',
          description: 'Please choose a different name',
          duration: 2000,
        });
        return;
      }
    }
    
    // Rename folder if name changed
    if (trimmed !== folderName) {
      renameFolder(folderName, trimmed);
    }
    
    // Update icon
    setFolderIcon(trimmed, selectedIcon);
    
    toast({
      title: 'Folder updated',
      duration: 2000,
    });
    triggerHaptic('success');
    onOpenChange(false);
    onFolderUpdated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Folder</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="relative">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Folder name..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave();
                }
              }}
            />
            {newName && (
              <button
                type="button"
                onClick={() => setNewName('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          
          {/* Icon Picker */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3">Choose an icon</p>
            <FolderIconPicker 
              selectedIcon={selectedIcon} 
              onSelectIcon={setSelectedIcon} 
            />
          </div>
          
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
