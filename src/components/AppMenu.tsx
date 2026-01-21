import { useState, useEffect, useRef } from 'react';
import { Menu, Trash2, User, Cloud, Sun, Moon, Monitor, Clipboard } from 'lucide-react';
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
import { getTrashCount } from '@/lib/savedLinksManager';
import { useTheme } from 'next-themes';
import { useSettings } from '@/hooks/useSettings';

type ThemeOption = 'light' | 'dark' | 'system';

const themeOptions: { value: ThemeOption; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <Sun className="h-4 w-4" /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" /> },
  { value: 'system', label: 'Auto', icon: <Monitor className="h-4 w-4" /> },
];

const SWIPE_THRESHOLD = 50;

interface AppMenuProps {
  onOpenTrash: () => void;
}

export function AppMenu({ onOpenTrash }: AppMenuProps) {
  const [open, setOpen] = useState(false);
  const [trashCount, setTrashCount] = useState(getTrashCount());
  const { theme, setTheme } = useTheme();
  const { settings, updateSettings } = useSettings();
  
  // Swipe gesture tracking
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);

  // Refresh trash count when menu opens
  useEffect(() => {
    if (open) {
      setTrashCount(getTrashCount());
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
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Menu className="h-5 w-5" />
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
          <SheetTitle className="text-left">Menu</SheetTitle>
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
              <span className="font-medium">Trash</span>
            </div>
            {trashCount > 0 && (
              <span className="h-5 min-w-5 px-1.5 rounded-full bg-destructive text-[11px] font-semibold text-destructive-foreground flex items-center justify-center">
                {trashCount > 99 ? '99+' : trashCount}
              </span>
            )}
          </Button>

          <Separator className="my-3" />

          {/* Coming Soon Section */}
          <p className="text-xs text-muted-foreground px-3 mb-2">Coming Soon</p>

          {/* Account - Disabled */}
          <Button
            variant="ghost"
            className="w-full justify-start h-12 px-3 opacity-50 cursor-not-allowed"
            disabled
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="font-medium">Account</span>
            </div>
          </Button>

          {/* Backup - Disabled */}
          <Button
            variant="ghost"
            className="w-full justify-start h-12 px-3 opacity-50 cursor-not-allowed"
            disabled
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                <Cloud className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="font-medium">Backup & Sync</span>
            </div>
          </Button>
        </div>

        {/* Settings Section - at bottom */}
        <div className="mt-auto pt-4">
          <Separator className="mb-4" />
          <p className="text-xs text-muted-foreground px-3 mb-3">Settings</p>
          
          {/* Theme Selection */}
          <div className="px-3 mb-4">
            <p className="text-sm font-medium mb-2">Appearance</p>
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
          
          {/* Clipboard Detection Toggle */}
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Clipboard className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm">Clipboard detection</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 pl-6">
                Auto-detect URLs from clipboard
              </p>
            </div>
            <Switch
              checked={settings.clipboardDetectionEnabled}
              onCheckedChange={(checked) => updateSettings({ clipboardDetectionEnabled: checked })}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}