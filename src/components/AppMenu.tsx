import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Menu, 
  Trash2, 
  Sun, 
  Moon, 
  Monitor, 
  AlertTriangle,
  Settings,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useRTL } from '@/hooks/useRTL';

type ThemeOption = 'light' | 'dark' | 'system';

const SWIPE_THRESHOLD = 50;
const SHORTCUTS_STORAGE_KEY = 'quicklaunch_shortcuts';

interface AppMenuProps {
  onOpenTrash: () => void;
  onOpenSettings: () => void;
}

export function AppMenu({ onOpenTrash, onOpenSettings }: AppMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { menuSide, shouldCloseOnSwipe } = useRTL();
  const [open, setOpen] = useState(false);
  const [trashCount, setTrashCount] = useState(getTrashCount());
  const [expiringCount, setExpiringCount] = useState(0);
  const [shortcutsCount, setShortcutsCount] = useState(0);
  const { theme, setTheme } = useTheme();
  
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

  // Check for expiring items and shortcuts count on mount and when menu opens
  const checkCounts = () => {
    const trashLinks = getTrashLinks();
    const expiringSoon = trashLinks.filter(link => getDaysRemaining(link.deletedAt, link.retentionDays) <= 3);
    setExpiringCount(expiringSoon.length);
    setTrashCount(trashLinks.length);
    
    // Get shortcuts count from localStorage
    try {
      const stored = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
      const shortcuts = stored ? JSON.parse(stored) : [];
      setShortcutsCount(Array.isArray(shortcuts) ? shortcuts.length : 0);
    } catch {
      setShortcutsCount(0);
    }
  };

  useEffect(() => {
    checkCounts();
  }, []);

  useEffect(() => {
    if (open) {
      checkCounts();
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
      // RTL-aware swipe to close
      if (shouldCloseOnSwipe(deltaX)) {
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
            <span className="absolute -top-0.5 -end-0.5 h-4 w-4 rounded-full bg-amber-500 flex items-center justify-center">
              <AlertTriangle className="h-2.5 w-2.5 text-white" />
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent 
        side={menuSide as "left" | "right"}
        className="w-72 flex flex-col"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <SheetHeader className="pb-4">
          <SheetTitle className="text-start">{t('menu.title', 'Menu')}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-1 flex-1">
          {/* My Shortcuts */}
          <Button
            variant="ghost"
            className="w-full justify-start h-12 ps-3 pe-3"
            onClick={() => handleMenuItem(() => navigate('/my-shortcuts'))}
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <span className="font-medium">{t('menu.shortcuts')}</span>
            </div>
            {shortcutsCount > 0 && (
              <span className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-[11px] font-semibold text-primary-foreground flex items-center justify-center">
                {shortcutsCount > 99 ? '99+' : shortcutsCount}
              </span>
            )}
          </Button>

          {/* Trash */}
          <Button
            variant="ghost"
            className="w-full justify-start h-12 ps-3 pe-3"
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

          {/* Settings */}
          <Button
            variant="ghost"
            className="w-full justify-start h-12 ps-3 pe-3"
            onClick={() => handleMenuItem(onOpenSettings)}
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                <Settings className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="font-medium">{t('settings.title')}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
          </Button>

          {/* Cloud Backup Section */}
          <CloudBackupSection />
        </div>

        {/* Quick Settings - Theme only */}
        <div className="mt-auto pt-4">
          <Separator className="mb-4" />
          <p className="text-xs text-muted-foreground ps-3 mb-3">{t('settings.appearance')}</p>
          
          {/* Theme Selection */}
          <div className="ps-3 pe-3 mb-2">
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
