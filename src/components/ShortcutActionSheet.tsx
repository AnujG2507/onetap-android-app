import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Edit, Trash2, Bell, ExternalLink, Phone, MessageCircle, FileText, Link, Image, Video } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
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
import { useState, useEffect } from 'react';
import { useSheetRegistry } from '@/contexts/SheetRegistryContext';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { buildImageSources } from '@/lib/imageUtils';
import type { ShortcutData } from '@/types/shortcut';

interface ShortcutActionSheetProps {
  shortcut: ShortcutData | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (shortcut: ShortcutData) => void;
  onDelete: (id: string) => void;
  onCreateReminder?: (shortcut: ShortcutData) => void;
  onOpen?: (shortcut: ShortcutData) => void;
}

export function ShortcutActionSheet({
  shortcut,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onCreateReminder,
  onOpen,
}: ShortcutActionSheetProps) {
  const { t } = useTranslation();
  const { registerSheet, unregisterSheet } = useSheetRegistry();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Build priority-ordered list of icon sources
  const iconSources = useMemo(() => {
    if (!shortcut || shortcut.icon.type !== 'thumbnail') return [];
    return buildImageSources(shortcut.thumbnailData, shortcut.icon.value);
  }, [shortcut?.id, shortcut?.thumbnailData, shortcut?.icon.type, shortcut?.icon.value]);

  // Register with sheet registry for back button handling
  useEffect(() => {
    if (isOpen) {
      registerSheet('shortcut-action-sheet', onClose);
      return () => unregisterSheet('shortcut-action-sheet');
    }
  }, [isOpen, registerSheet, unregisterSheet, onClose]);

  const handleEdit = useCallback(() => {
    if (!shortcut) return;
    onClose();
    // Small delay to allow drawer to close
    setTimeout(() => onEdit(shortcut), 150);
  }, [shortcut, onClose, onEdit]);

  const handleDelete = useCallback(() => {
    if (!shortcut) return;
    setShowDeleteConfirm(true);
  }, [shortcut]);

  const confirmDelete = useCallback(() => {
    if (!shortcut) return;
    onDelete(shortcut.id);
    setShowDeleteConfirm(false);
    onClose();
  }, [shortcut, onDelete, onClose]);

  const handleCreateReminder = useCallback(() => {
    if (!shortcut || !onCreateReminder) return;
    onClose();
    setTimeout(() => onCreateReminder(shortcut), 150);
  }, [shortcut, onClose, onCreateReminder]);

  const handleOpen = useCallback(() => {
    if (!shortcut || !onOpen) return;
    onClose();
    setTimeout(() => onOpen(shortcut), 150);
  }, [shortcut, onClose, onOpen]);

  const getShortcutIcon = () => {
    if (!shortcut) return <FileText className="h-5 w-5" />;
    
    if (shortcut.type === 'contact') return <Phone className="h-5 w-5" />;
    if (shortcut.type === 'message') return <MessageCircle className="h-5 w-5" />;
    if (shortcut.type === 'link') return <Link className="h-5 w-5" />;
    
    switch (shortcut.fileType) {
      case 'image': return <Image className="h-5 w-5" />;
      case 'video': return <Video className="h-5 w-5" />;
      case 'pdf': return <FileText className="h-5 w-5" />;
      default: return <FileText className="h-5 w-5" />;
    }
  };

  const getShortcutTypeLabel = () => {
    if (!shortcut) return '';
    
    if (shortcut.type === 'contact') return t('shortcutAction.typeContact');
    if (shortcut.type === 'message') return t('shortcutAction.typeWhatsApp');
    if (shortcut.type === 'link') return t('shortcutAction.typeLink');
    
    switch (shortcut.fileType) {
      case 'image': return t('shortcutAction.typeImage');
      case 'video': return t('shortcutAction.typeVideo');
      case 'pdf': return t('shortcutAction.typePDF');
      default: return t('shortcutAction.typeFile');
    }
  };

  if (!shortcut) return null;

  return (
    <>
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="max-h-[80vh] landscape:max-h-[95vh]">
          <DrawerHeader className="pb-2">
            <div className="flex items-center gap-3">
              {/* Shortcut Icon Preview */}
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl overflow-hidden">
                {shortcut.icon.type === 'emoji' ? (
                  shortcut.icon.value
                ) : shortcut.icon.type === 'text' ? (
                  <span className="text-sm font-bold">{shortcut.icon.value.slice(0, 2)}</span>
                ) : iconSources.length > 0 ? (
                  <ImageWithFallback
                    sources={iconSources}
                    fallback={getShortcutIcon()}
                    alt=""
                    className="w-full h-full object-cover"
                    containerClassName="w-full h-full flex items-center justify-center"
                    showSkeleton={false}
                  />
                ) : (
                  getShortcutIcon()
                )}
              </div>
              <div className="flex-1 text-left min-w-0">
                <DrawerTitle className="text-base break-words">{shortcut.name}</DrawerTitle>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  {getShortcutIcon()}
                  <span>{getShortcutTypeLabel()}</span>
                </p>
              </div>
            </div>
          </DrawerHeader>

          <div className="px-4 pb-4 space-y-1">
            <Separator className="my-2" />
            
            {/* Open Action */}
            {onOpen && (
              <Button
                variant="ghost"
                className="w-full justify-start h-12 text-base"
                onClick={handleOpen}
              >
                <ExternalLink className="h-5 w-5 mr-3" />
                {t('shortcutAction.open')}
              </Button>
            )}

            {/* Edit Action */}
            <Button
              variant="ghost"
              className="w-full justify-start h-12 text-base"
              onClick={handleEdit}
            >
              <Edit className="h-5 w-5 mr-3" />
              {t('shortcutAction.edit')}
            </Button>

            {/* Create Reminder Action */}
            {onCreateReminder && (
              <Button
                variant="ghost"
                className="w-full justify-start h-12 text-base"
                onClick={handleCreateReminder}
              >
                <Bell className="h-5 w-5 mr-3" />
                {t('shortcutAction.createReminder')}
              </Button>
            )}

            <Separator className="my-2" />

            {/* Delete Action */}
            <Button
              variant="ghost"
              className="w-full justify-start h-12 text-base text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
            >
              <Trash2 className="h-5 w-5 mr-3" />
              {t('shortcutAction.delete')}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="max-w-[280px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('shortcutAction.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('shortcutAction.deleteDesc', { name: shortcut.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel className="flex-1 m-0">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              className="flex-1 m-0 bg-destructive text-destructive-foreground hover:bg-destructive/90" 
              onClick={confirmDelete}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
