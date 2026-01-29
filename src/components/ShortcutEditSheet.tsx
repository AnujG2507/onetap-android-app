import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, RotateCcw, Home, Save } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { IconPicker } from '@/components/IconPicker';
import { QuickMessagesEditor } from '@/components/QuickMessagesEditor';
import { useSheetRegistry } from '@/contexts/SheetRegistryContext';
import { useToast } from '@/hooks/use-toast';
import { Capacitor } from '@capacitor/core';
import type { ShortcutData, ShortcutIcon } from '@/types/shortcut';

interface ShortcutEditSheetProps {
  shortcut: ShortcutData | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Pick<ShortcutData, 'name' | 'icon' | 'quickMessages' | 'resumeEnabled'>>) => void;
  onReAddToHomeScreen?: (shortcut: ShortcutData) => void;
}

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

  // Initialize form when shortcut changes
  useEffect(() => {
    if (shortcut) {
      setName(shortcut.name);
      setIcon(shortcut.icon);
      setQuickMessages(shortcut.quickMessages || []);
      setResumeEnabled(shortcut.resumeEnabled || false);
      setHasChanges(false);
      setHasIconOrNameChanged(false);
    }
  }, [shortcut]);

  // Track changes
  useEffect(() => {
    if (!shortcut) return;
    
    const nameChanged = name !== shortcut.name;
    const iconChanged = JSON.stringify(icon) !== JSON.stringify(shortcut.icon);
    const messagesChanged = JSON.stringify(quickMessages) !== JSON.stringify(shortcut.quickMessages || []);
    const resumeChanged = resumeEnabled !== (shortcut.resumeEnabled || false);
    
    setHasChanges(nameChanged || iconChanged || messagesChanged || resumeChanged);
    setHasIconOrNameChanged(nameChanged || iconChanged);
  }, [name, icon, quickMessages, resumeEnabled, shortcut]);

  // Register with sheet registry for back button handling
  useEffect(() => {
    if (isOpen) {
      registerSheet('shortcut-edit-sheet', onClose);
      return () => unregisterSheet('shortcut-edit-sheet');
    }
  }, [isOpen, registerSheet, unregisterSheet, onClose]);

  const handleSave = useCallback(() => {
    if (!shortcut) return;
    
    onSave(shortcut.id, {
      name,
      icon,
      quickMessages: quickMessages.length > 0 ? quickMessages : undefined,
      resumeEnabled: shortcut.fileType === 'pdf' ? resumeEnabled : undefined,
    });

    // Show toast - home screen updates automatically now
    toast({
      title: t('shortcutEdit.saved'),
    });

    onClose();
  }, [shortcut, name, icon, quickMessages, resumeEnabled, hasIconOrNameChanged, onSave, onClose, toast, t]);

  const handleReAdd = useCallback(() => {
    if (!shortcut || !onReAddToHomeScreen) return;
    
    // First save the changes
    const updatedShortcut: ShortcutData = {
      ...shortcut,
      name,
      icon,
      quickMessages: quickMessages.length > 0 ? quickMessages : undefined,
      resumeEnabled: shortcut.fileType === 'pdf' ? resumeEnabled : undefined,
    };
    
    onSave(shortcut.id, {
      name,
      icon,
      quickMessages: quickMessages.length > 0 ? quickMessages : undefined,
      resumeEnabled: shortcut.fileType === 'pdf' ? resumeEnabled : undefined,
    });
    
    // Then trigger re-add to home screen
    onReAddToHomeScreen(updatedShortcut);
    onClose();
  }, [shortcut, name, icon, quickMessages, resumeEnabled, onSave, onReAddToHomeScreen, onClose]);

  const isWhatsAppShortcut = shortcut?.type === 'message' && shortcut?.messageApp === 'whatsapp';
  const isPdfShortcut = shortcut?.fileType === 'pdf';

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

          {/* Icon Picker */}
          <div className="space-y-2">
            <Label>{t('shortcutEdit.icon')}</Label>
            <IconPicker
              selectedIcon={icon}
              onSelect={setIcon}
              thumbnail={shortcut.thumbnailData}
            />
          </div>

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
        </div>

        <DrawerFooter className="pt-2 border-t">
          <div className="flex flex-col gap-2">
            <Button 
              onClick={handleSave} 
              disabled={!hasChanges || !name.trim()}
              className="w-full"
            >
              <Save className="h-4 w-4 mr-2" />
              {t('common.save')}
            </Button>
            
            {hasIconOrNameChanged && Capacitor.isNativePlatform() && onReAddToHomeScreen && (
              <Button 
                variant="outline" 
                onClick={handleReAdd}
                disabled={!name.trim()}
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
