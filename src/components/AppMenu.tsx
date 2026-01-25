import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Menu, 
  Trash2, 
  Sun, 
  Moon, 
  Monitor, 
  Clipboard, 
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { LanguagePicker } from './LanguagePicker';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { getTrashCount, getTrashLinks, getDaysRemaining } from '@/lib/savedLinksManager';
import { useTheme } from 'next-themes';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
import { CloudBackupSection } from './CloudBackupSection';
import { useSettings } from '@/hooks/useSettings';
import { useOnboarding } from '@/hooks/useOnboarding';

type ThemeOption = 'light' | 'dark' | 'system';

const SWIPE_THRESHOLD = 50;

interface AppMenuProps {
  onOpenTrash: () => void;
}

export function AppMenu({ onOpenTrash }: AppMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [trashCount, setTrashCount] = useState(getTrashCount());
  const [expiringCount, setExpiringCount] = useState(0);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const { settings, updateSettings } = useSettings();
  const { resetOnboarding } = useOnboarding();
  
  // Swipe gesture tracking
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);

  // Theme options with translated labels
  const themeOptions: { value: ThemeOption; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: t('settings.light'), icon: <Sun className="h-4 w-4" /> },
    { value: 'dark', label: t('settings.dark'), icon: <Moon className="h-4 w-4" /> },
    { value: 'system', label: t('settings.system'), icon: <Monitor className="h-4 w-4" /> },
  ];

  // Register menu sheet with back button handler
  const handleCloseMenu = useCallback(() => setOpen(false), []);
  useSheetBackHandler('app-menu-sheet', open, handleCloseMenu);

  // Check for expiring items on mount and when menu opens
  const checkExpiringItems = () => {
    const trashLinks = getTrashLinks();
    const expiringSoon = trashLinks.filter(link => getDaysRemaining(link.deletedAt, link.retentionDays) <= 3);
    setExpiringCount(expiringSoon.length);
    setTrashCount(trashLinks.length);
  };

  useEffect(() => {
    checkExpiringItems();
  }, []);

  useEffect(() => {
    if (open) {
      checkExpiringItems();
    }
  }, [open]);

  const handleMenuItem = (action: () => void) => {
    setOpen(false);
    // Small delay to allow sheet close animation
    setTimeout(action, 150);
  };

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchCurrentX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current !== null && touchCurrentX.current !== null) {
      const deltaX = touchCurrentX.current - touchStartX.current;
      // Swipe right to close (since menu is on the right side)
      if (deltaX > SWIPE_THRESHOLD) {
        setOpen(false);
      }
    }
    touchStartX.current = null;
    touchCurrentX.current = null;
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 relative">
          <Menu className="h-5 w-5" />
          {expiringCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-amber-500 flex items-center justify-center">
              <AlertTriangle className="h-2.5 w-2.5 text-white" />
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent 
        side="right" 
        className="w-72 flex flex-col"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <SheetHeader className="pb-4">
          <SheetTitle className="text-left">{t('menu.title', 'Menu')}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-1 flex-1">
          {/* Trash */}
          <Button
            variant="ghost"
            className="w-full justify-start h-12 px-3"
            onClick={() => handleMenuItem(onOpenTrash)}
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                <Trash2 className="h-4 w-4 text-destructive" />
              </div>
              <span className="font-medium">{t('menu.trash', 'Trash')}</span>
            </div>
            {trashCount > 0 && (
              <div className="flex items-center gap-1.5">
                {expiringCount > 0 && (
                  <span className="h-5 min-w-5 px-1.5 rounded-full bg-amber-500 text-[11px] font-semibold text-white flex items-center justify-center gap-0.5">
                    <AlertTriangle className="h-3 w-3" />
                    {expiringCount}
                  </span>
                )}
                <span className="h-5 min-w-5 px-1.5 rounded-full bg-destructive text-[11px] font-semibold text-destructive-foreground flex items-center justify-center">
                  {trashCount > 99 ? '99+' : trashCount}
                </span>
              </div>
            )}
          </Button>

          {/* Cloud Backup Section */}
          <CloudBackupSection />
        </div>

        {/* Settings Section - at bottom */}
        <div className="mt-auto pt-4">
          <Separator className="mb-4" />
          <p className="text-xs text-muted-foreground px-3 mb-3">{t('settings.title')}</p>
          
          {/* Theme Selection */}
          <div className="px-3 mb-4">
            <p className="text-sm font-medium mb-2">{t('settings.appearance')}</p>
            <div className="flex gap-1">
              {themeOptions.map((option) => (
                <Button
                  key={option.value}
                  variant="outline"
                  size="sm"
                  className={cn(
                    "flex-1 gap-1.5",
                    theme === option.value && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                  )}
                  onClick={() => setTheme(option.value)}
                >
                  {option.icon}
                  <span className="text-xs">{option.label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Language Selection */}
          <div className="px-3 mb-2">
            <LanguagePicker 
              open={languagePickerOpen} 
              onOpenChange={setLanguagePickerOpen} 
            />
          </div>
          
          {/* Clipboard Detection Toggle */}
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Clipboard className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm">{t('settings.clipboardDetection')}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 pl-6">
                {t('settings.clipboardDescription')}
              </p>
            </div>
            <Switch
              checked={settings.clipboardDetectionEnabled}
              onCheckedChange={(checked) => updateSettings({ clipboardDetectionEnabled: checked })}
            />
          </div>

          {/* Reset Onboarding */}
          <Button
            variant="ghost"
            className="w-full justify-start h-auto px-3 py-2 whitespace-normal"
            onClick={() => handleMenuItem(resetOnboarding)}
          >
            <div className="flex-1 min-w-0 text-left overflow-hidden">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">{t('settings.resetOnboarding')}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 pl-6 break-words">
                {t('settings.resetOnboardingDescription')}
              </p>
            </div>
          </Button>
          
        </div>
      </SheetContent>
    </Sheet>
  );
}
