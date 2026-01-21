import { useState } from 'react';
import { Menu, Trash2, Settings, User, Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { getTrashCount } from '@/lib/savedLinksManager';

interface AppMenuProps {
  onOpenTrash: () => void;
  onOpenSettings: () => void;
}

export function AppMenu({ onOpenTrash, onOpenSettings }: AppMenuProps) {
  const [open, setOpen] = useState(false);
  const trashCount = getTrashCount();

  const handleMenuItem = (action: () => void) => {
    setOpen(false);
    // Small delay to allow sheet close animation
    setTimeout(action, 150);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-left">Menu</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-1">
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

          {/* Settings */}
          <Button
            variant="ghost"
            className="w-full justify-start h-12 px-3"
            onClick={() => handleMenuItem(onOpenSettings)}
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                <Settings className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="font-medium">Settings</span>
            </div>
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
      </SheetContent>
    </Sheet>
  );
}
