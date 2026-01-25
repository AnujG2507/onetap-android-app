import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        title: t('folders.enterName'),
        duration: 2000,
      });
      return;
    }
    
    // Check for duplicates (excluding current name)
    if (trimmed !== folderName) {
      if (PRESET_TAGS.includes(trimmed) || getCustomFolders().includes(trimmed)) {
        toast({
          title: t('folders.folderExists'),
          description: t('folders.folderExistsDesc'),
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
      title: t('folders.folderUpdated'),
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
          <DialogTitle>{t('folders.editTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="relative">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('folders.namePlaceholder')}
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
                className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          
          {/* Icon Picker */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3">{t('folders.chooseIcon')}</p>
            <FolderIconPicker 
              selectedIcon={selectedIcon} 
              onSelectIcon={setSelectedIcon} 
            />
          </div>
          
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave}>
              {t('folders.saveChanges')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
