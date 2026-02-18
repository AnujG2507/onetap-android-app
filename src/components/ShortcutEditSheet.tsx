import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Home, Save, Play, Pause, FolderOpen } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { IconPicker } from '@/components/IconPicker';
import { QuickMessagesEditor } from '@/components/QuickMessagesEditor';
import { SlideshowPhotosEditor } from '@/components/SlideshowPhotosEditor';
import { useSheetRegistry } from '@/contexts/SheetRegistryContext';
import { useToast } from '@/hooks/use-toast';
import { Capacitor } from '@capacitor/core';
import { generateGridIcon } from '@/lib/slideshowIconGenerator';
import type { ShortcutData, ShortcutIcon } from '@/types/shortcut';
import { isDormant } from '@/types/shortcut';
import { pickFile, pickMultipleImages, type FileTypeFilter } from '@/lib/contentResolver';

interface SlideshowImage {
  id: string;
  uri: string;
  thumbnail?: string;
}

interface ShortcutEditSheetProps {
  shortcut: ShortcutData | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Pick<ShortcutData, 'name' | 'icon' | 'quickMessages' | 'resumeEnabled' | 'imageUris' | 'imageThumbnails' | 'autoAdvanceInterval' | 'contentUri' | 'syncState' | 'mimeType' | 'fileSize' | 'thumbnailData'>>) => Promise<{ success: boolean; nativeUpdateFailed?: boolean }>;
  onReAddToHomeScreen?: (shortcut: ShortcutData) => void;
}

const AUTO_ADVANCE_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 3, label: '3s' },
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
];

export function ShortcutEditSheet({ 
  shortcut, 
  isOpen, 
  onClose, 
  onSave,
  onReAddToHomeScreen 
}: ShortcutEditSheetProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { registerSheet, unregisterSheet } = useSheetRegistry();
  
  // Local state for editing
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<ShortcutIcon>({ type: 'emoji', value: '📱' });
  const [quickMessages, setQuickMessages] = useState<string[]>([]);
  const [resumeEnabled, setResumeEnabled] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [hasIconOrNameChanged, setHasIconOrNameChanged] = useState(false);
  const [reconnectedFile, setReconnectedFile] = useState<{
    contentUri: string;
    mimeType?: string;
    fileSize?: number;
    thumbnailData?: string;
  } | null>(null);
  
  // Slideshow-specific state
  const [slideshowImages, setSlideshowImages] = useState<SlideshowImage[]>([]);
  const [autoAdvance, setAutoAdvance] = useState(0);

  // Initialize form when shortcut changes
  useEffect(() => {
    if (shortcut) {
      setName(shortcut.name);
      setIcon(shortcut.icon);
      setQuickMessages(shortcut.quickMessages || []);
      setResumeEnabled(shortcut.resumeEnabled || false);
      setHasChanges(false);
      setHasIconOrNameChanged(false);
      setReconnectedFile(null);
      
      // Initialize slideshow state
      if (shortcut.type === 'slideshow' && shortcut.imageUris) {
        const images: SlideshowImage[] = shortcut.imageUris.map((uri, i) => ({
          id: `img-${i}`,
          uri,
          thumbnail: shortcut.imageThumbnails?.[i],
        }));
        setSlideshowImages(images);
        setAutoAdvance(shortcut.autoAdvanceInterval || 0);
      } else {
        setSlideshowImages([]);
        setAutoAdvance(0);
      }
    }
  }, [shortcut]);

  // Track changes
  useEffect(() => {
    if (!shortcut) return;
    
    const nameChanged = name !== shortcut.name;
    const iconChanged = JSON.stringify(icon) !== JSON.stringify(shortcut.icon);
    const messagesChanged = JSON.stringify(quickMessages) !== JSON.stringify(shortcut.quickMessages || []);
    const resumeChanged = resumeEnabled !== (shortcut.resumeEnabled || false);
    
    // Slideshow-specific changes
    const imagesChanged = shortcut.type === 'slideshow' && (
      JSON.stringify(slideshowImages.map(i => i.uri)) !== JSON.stringify(shortcut.imageUris || [])
    );
    const autoAdvanceChanged = shortcut.type === 'slideshow' && autoAdvance !== (shortcut.autoAdvanceInterval || 0);
    const fileReconnected = reconnectedFile !== null;
    
    setHasChanges(nameChanged || iconChanged || messagesChanged || resumeChanged || imagesChanged || autoAdvanceChanged || fileReconnected);
    setHasIconOrNameChanged(nameChanged || iconChanged || imagesChanged);
  }, [name, icon, quickMessages, resumeEnabled, slideshowImages, autoAdvance, shortcut, reconnectedFile]);

  // Register with sheet registry for back button handling
  useEffect(() => {
    if (isOpen) {
      registerSheet('shortcut-edit-sheet', onClose);
      return () => unregisterSheet('shortcut-edit-sheet');
    }
  }, [isOpen, registerSheet, unregisterSheet, onClose]);

  const handleSave = useCallback(async () => {
    if (!shortcut) return;
    
    // Build updates object
    const updates: Partial<Pick<ShortcutData, 'name' | 'icon' | 'quickMessages' | 'resumeEnabled' | 'imageUris' | 'imageThumbnails' | 'autoAdvanceInterval' | 'contentUri' | 'syncState' | 'mimeType' | 'fileSize' | 'thumbnailData'>> = {
      name,
      icon,
      quickMessages: quickMessages.length > 0 ? quickMessages : undefined,
      resumeEnabled: shortcut.fileType === 'pdf' ? resumeEnabled : undefined,
    };
    
    // If a file was reconnected, include those fields and clear dormant state
    if (reconnectedFile) {
      updates.contentUri = reconnectedFile.contentUri;
      updates.mimeType = reconnectedFile.mimeType;
      updates.fileSize = reconnectedFile.fileSize;
      updates.thumbnailData = reconnectedFile.thumbnailData;
      updates.syncState = undefined;
    }
    
    // Add slideshow-specific updates
    if (shortcut.type === 'slideshow') {
      updates.imageUris = slideshowImages.map(i => i.uri);
      updates.imageThumbnails = slideshowImages.map(i => i.thumbnail).filter(Boolean) as string[];
      updates.autoAdvanceInterval = autoAdvance;
      
      // Clear dormant state if images were reconnected
      if (reconnectedFile) {
        updates.syncState = undefined;
      }
      
      // If images changed, regenerate grid icon (always for reconnects, or when icon is thumbnail type)
      const imagesChanged = JSON.stringify(slideshowImages.map(i => i.uri)) !== JSON.stringify(shortcut.imageUris || []);
      if (imagesChanged) {
        const thumbnails = slideshowImages.slice(0, 4).map(i => i.thumbnail).filter(Boolean) as string[];
        if (thumbnails.length > 0) {
          const newGridIcon = await generateGridIcon(thumbnails);
          updates.icon = { type: 'thumbnail', value: newGridIcon };
        }
      }
    }
    
    const result = await onSave(shortcut.id, updates);

    // Smart feedback based on native update result
    if (Capacitor.isNativePlatform() && result?.nativeUpdateFailed && onReAddToHomeScreen) {
      // Native update failed - prompt user to re-add
      const updatedShortcut: ShortcutData = {
        ...shortcut,
        ...updates,
      };
      
      toast({
        title: t('shortcutEdit.saved'),
        description: t('shortcutEdit.homeScreenUpdateFailed'),
        action: (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => onReAddToHomeScreen(updatedShortcut)}
            className="shrink-0"
          >
            {t('shortcutEdit.reAdd')}
          </Button>
        ),
        duration: 8000, // Longer duration to give user time to act
      });
    } else {
      // Success or not on native - simple toast
      toast({
        title: t('shortcutEdit.saved'),
      });
    }

    onClose();
  }, [shortcut, name, icon, quickMessages, resumeEnabled, slideshowImages, autoAdvance, onSave, onReAddToHomeScreen, onClose, toast, t, reconnectedFile]);

  const handleReAdd = useCallback(async () => {
    if (!shortcut || !onReAddToHomeScreen) return;
    
    // Build updates including reconnection fields
    const updates: Partial<Pick<ShortcutData, 'name' | 'icon' | 'quickMessages' | 'resumeEnabled' | 'imageUris' | 'imageThumbnails' | 'autoAdvanceInterval' | 'contentUri' | 'syncState' | 'mimeType' | 'fileSize' | 'thumbnailData'>> = {
      name,
      icon,
      quickMessages: quickMessages.length > 0 ? quickMessages : undefined,
      resumeEnabled: shortcut.fileType === 'pdf' ? resumeEnabled : undefined,
    };
    
    // Include reconnection fields if file was reconnected
    if (reconnectedFile) {
      updates.contentUri = reconnectedFile.contentUri;
      updates.mimeType = reconnectedFile.mimeType;
      updates.fileSize = reconnectedFile.fileSize;
      updates.thumbnailData = reconnectedFile.thumbnailData;
      updates.syncState = undefined; // Clear dormant state - JSON.stringify strips undefined
    }
    
    if (shortcut.type === 'slideshow') {
      updates.imageUris = slideshowImages.map(i => i.uri);
      updates.imageThumbnails = slideshowImages.map(i => i.thumbnail).filter(Boolean) as string[];
      updates.autoAdvanceInterval = autoAdvance;
      
      if (reconnectedFile) {
        updates.syncState = undefined;
      }
    }
    
    const updatedShortcut: ShortcutData = {
      ...shortcut,
      ...updates,
    };
    
    // Await save before re-adding to ensure native state is updated
    await onSave(shortcut.id, updates);
    
    // Then trigger re-add to home screen with fresh data
    onReAddToHomeScreen(updatedShortcut);
    onClose();
  }, [shortcut, name, icon, quickMessages, resumeEnabled, slideshowImages, autoAdvance, onSave, onReAddToHomeScreen, onClose, reconnectedFile]);

  const isWhatsAppShortcut = shortcut?.type === 'message' && shortcut?.messageApp === 'whatsapp';
  const isPdfShortcut = shortcut?.fileType === 'pdf';
  const isSlideshowShortcut = shortcut?.type === 'slideshow';
  const hasSufficientPhotos = !isSlideshowShortcut || slideshowImages.length >= 2;
  const shortcutIsDormant = shortcut ? isDormant(shortcut) : false;

  // Map fileType to picker filter
  const getFileFilter = useCallback((): FileTypeFilter => {
    if (!shortcut?.fileType) return 'all';
    switch (shortcut.fileType) {
      case 'image': return 'image';
      case 'video': return 'video';
      case 'pdf': return 'document';
      case 'audio': return 'audio';
      default: return 'all';
    }
  }, [shortcut?.fileType]);

  const handleReconnectFile = useCallback(async () => {
    if (isSlideshowShortcut) {
      // Slideshow: pick multiple images
      const result = await pickMultipleImages();
      if (!result || result.files.length < 2) return;
      const newImages: SlideshowImage[] = result.files.map((f, i) => ({
        id: `reconnect-${i}`,
        uri: f.uri,
        thumbnail: f.thumbnail,
      }));
      setSlideshowImages(newImages);
      // Mark reconnect so save clears dormant state
      setReconnectedFile({ contentUri: '', mimeType: undefined, fileSize: undefined, thumbnailData: undefined });
    } else {
      const result = await pickFile(getFileFilter());
      if (!result) return;
      setReconnectedFile({
        contentUri: result.uri,
        mimeType: result.mimeType,
        fileSize: result.fileSize,
        thumbnailData: result.thumbnailData,
      });
    }
  }, [getFileFilter, isSlideshowShortcut]);

  if (!shortcut) return null;

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="flex flex-row items-center justify-between pb-2">
          <DrawerTitle className="text-lg">{t('shortcutEdit.title')}</DrawerTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </DrawerHeader>

        <div className="px-4 pb-4 space-y-6 overflow-y-auto">
          {/* Dormant Reconnect Banner */}
          {shortcutIsDormant && !reconnectedFile && (
            <div className="flex flex-col gap-2 p-3 rounded-xl border border-primary/30 bg-primary/5">
              <div className="flex items-center gap-3">
                <FolderOpen className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    {t('shortcuts.reconnectBanner', { fileType: isSlideshowShortcut ? 'slideshow' : (shortcut.fileType || t('shortcutAction.typeFile')) })}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={handleReconnectFile} className="shrink-0">
                  {t('shortcuts.reconnectChoose')}
                </Button>
              </div>
              {Capacitor.isNativePlatform() && onReAddToHomeScreen && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onReAddToHomeScreen(shortcut)}
                  className="w-full justify-center gap-2 text-muted-foreground"
                >
                  <Home className="h-4 w-4" />
                  {t('shortcutAction.addToHomeScreen')}
                </Button>
              )}
            </div>
          )}
          
          {/* Reconnected confirmation */}
          {reconnectedFile && (
            <div className="flex items-center gap-2 p-3 rounded-xl border border-primary/30 bg-primary/5">
              <span className="text-primary text-sm font-medium">✓ {t('shortcutAction.reconnected')}</span>
            </div>
          )}

          {/* Name Field */}
          <div className="space-y-2">
            <Label htmlFor="shortcut-name">{t('shortcutEdit.name')}</Label>
            <div className="relative">
              <Input
                id="shortcut-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('shortcutEdit.namePlaceholder')}
                className="pr-10"
              />
              {name && (
                <button
                  type="button"
                  onClick={() => setName('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Slideshow Photos Editor */}
          {isSlideshowShortcut && (
            <SlideshowPhotosEditor
              images={slideshowImages}
              onChange={setSlideshowImages}
            />
          )}

          {/* Icon Picker - hide for slideshows (icon auto-generated from photos) */}
          {!isSlideshowShortcut && (
            <div className="space-y-2">
              <Label>{t('shortcutEdit.icon')}</Label>
              <IconPicker
                selectedIcon={icon}
                onSelect={setIcon}
                thumbnail={shortcut.thumbnailData}
              />
            </div>
          )}

          {/* WhatsApp Quick Messages */}
          {isWhatsAppShortcut && (
            <div className="space-y-2">
              <QuickMessagesEditor
                messages={quickMessages}
                onChange={setQuickMessages}
              />
            </div>
          )}

          {/* PDF Resume Toggle */}
          {isPdfShortcut && (
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label htmlFor="resume-toggle">{t('shortcutEdit.resumeReading')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('shortcutEdit.resumeReadingDesc')}
                </p>
              </div>
              <Switch
                id="resume-toggle"
                checked={resumeEnabled}
                onCheckedChange={setResumeEnabled}
              />
            </div>
          )}

          {/* Slideshow Auto-advance */}
          {isSlideshowShortcut && (
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">
                {t('slideshow.autoAdvance', 'Auto-advance')}
              </label>
              <div className="flex gap-2">
                {AUTO_ADVANCE_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    onClick={() => setAutoAdvance(option.value)}
                    className={`flex-1 py-2 px-3 rounded-lg border-2 transition-colors ${
                      autoAdvance === option.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {option.value === 0 ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      <span className="text-sm font-medium">{option.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DrawerFooter className="pt-2 border-t">
          <div className="flex flex-col gap-2">
            <Button 
              onClick={handleSave} 
              disabled={!hasChanges || !name.trim() || !hasSufficientPhotos}
              className="w-full"
            >
              <Save className="h-4 w-4 mr-2" />
              {t('common.save')}
            </Button>
            
            {hasIconOrNameChanged && Capacitor.isNativePlatform() && onReAddToHomeScreen && (
              <Button 
                variant="outline" 
                onClick={handleReAdd}
                disabled={!name.trim() || !hasSufficientPhotos}
                className="w-full"
              >
                <Home className="h-4 w-4 mr-2" />
                {t('shortcutEdit.reAddToHomeScreen')}
              </Button>
            )}
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
