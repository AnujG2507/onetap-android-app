import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderPlus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { addCustomFolder, PRESET_TAGS, getCustomFolders } from '@/lib/savedLinksManager';
import { useToast } from '@/hooks/use-toast';
import { triggerHaptic } from '@/lib/haptics';
import { FolderIconPicker } from './FolderIconPicker';

interface CreateFolderDialogProps {
  onFolderCreated: () => void;
}

export function CreateFolderDialog({ onFolderCreated }: CreateFolderDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Folder');
  const { toast } = useToast();

  const handleCreate = () => {
    const trimmed = folderName.trim();
    
    if (!trimmed) {
      toast({
        title: t('folders.enterName'),
      });
      return;
    }
    
    if (PRESET_TAGS.includes(trimmed) || getCustomFolders().includes(trimmed)) {
      toast({
        title: t('folders.folderExists'),
        description: t('folders.folderExistsDesc'),
      });
      return;
    }
    
    const success = addCustomFolder(trimmed, selectedIcon);
    
    if (success) {
      toast({
        title: t('folders.folderCreated'),
      });
      triggerHaptic('success');
      setFolderName('');
      setSelectedIcon('Folder');
      setOpen(false);
      onFolderCreated();
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setFolderName('');
      setSelectedIcon('Folder');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <FolderPlus className="h-4 w-4" />
          {t('folders.newFolder')}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md landscape:max-h-[90vh] landscape:overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('folders.createTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 landscape:space-y-3 pt-4 landscape:pt-2">
          {/* Portrait: stacked, Landscape: 2-column */}
          <div className="landscape:grid landscape:grid-cols-2 landscape:gap-4 landscape:items-start">
            <div className="relative mb-4 landscape:mb-0">
              <Input
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder={t('folders.namePlaceholder')}
                autoFocus
                className="landscape:h-9"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreate();
                  }
                }}
              />
              {folderName && (
                <button
                  type="button"
                  onClick={() => setFolderName('')}
                  className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
            
            {/* Icon Picker */}
            <div>
              <p className="text-sm landscape:text-xs font-medium text-muted-foreground mb-3 landscape:mb-2">{t('folders.chooseIcon')}</p>
              <FolderIconPicker 
                selectedIcon={selectedIcon} 
                onSelectIcon={setSelectedIcon} 
              />
            </div>
          </div>
          
          <div className="flex gap-2 justify-end pt-2 landscape:pt-1">
            <Button variant="outline" onClick={() => setOpen(false)} className="landscape:h-9">
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreate} className="landscape:h-9">
              {t('folders.createFolder')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
