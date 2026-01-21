import { useState, useEffect, useRef } from 'react';
import { 
  Menu, 
  Trash2, 
  User, 
  Sun, 
  Moon, 
  Monitor, 
  Clipboard, 
  AlertTriangle,
  Download,
  Upload,
  Loader2,
} from 'lucide-react';
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
import { useSettings } from '@/hooks/useSettings';
import { 
  exportBookmarks, 
  parseBackupFile, 
  importBookmarks, 
  validateBackupData,
  BackupData,
  BackupStats,
} from '@/lib/backupManager';
import { ImportBackupDialog } from './ImportBackupDialog';
import { toast } from '@/hooks/use-toast';

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
  const [expiringCount, setExpiringCount] = useState(0);
  const { theme, setTheme } = useTheme();
  const { settings, updateSettings } = useSettings();
  
  // Export/Import state
  const [isExporting, setIsExporting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<BackupData | null>(null);
  const [pendingStats, setPendingStats] = useState<BackupStats | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Swipe gesture tracking
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);

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

  // Export handler
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportBookmarks();
      if (result.success) {
        toast({
          title: 'Backup exported',
          description: 'Your bookmarks have been saved.',
        });
      } else {
        toast({
          title: 'Export failed',
          description: result.error || 'Could not export bookmarks.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsExporting(false);
    }
  };

  // Import file selection handler
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const { data, error } = parseBackupFile(content);
      
      if (error || !data) {
        toast({
          title: 'Invalid backup file',
          description: error || 'Could not read backup file.',
          variant: 'destructive',
        });
        return;
      }

      const validation = validateBackupData(data);
      if (validation.valid && validation.stats) {
        setPendingBackup(data);
        setPendingStats(validation.stats);
        setImportDialogOpen(true);
      }
    };
    reader.readAsText(file);
    
    // Reset input so same file can be selected again
    event.target.value = '';
  };

  // Import execution handler
  const handleImport = (mode: 'merge' | 'replace') => {
    if (!pendingBackup) return;

    const result = importBookmarks(pendingBackup, mode);
    setImportDialogOpen(false);
    setPendingBackup(null);
    setPendingStats(null);

    if (result.success) {
      toast({
        title: 'Import successful',
        description: mode === 'merge'
          ? `Added ${result.imported} bookmarks${result.skipped > 0 ? `, skipped ${result.skipped} duplicates` : ''}.`
          : `Restored ${result.imported} bookmarks.`,
      });
      // Trigger page reload to reflect changes
      window.location.reload();
    } else {
      toast({
        title: 'Import failed',
        description: result.error || 'Could not import bookmarks.',
        variant: 'destructive',
      });
    }
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

          <Separator className="my-3" />

          {/* Data Management Section */}
          <p className="text-xs text-muted-foreground px-3 mb-2">Data Management</p>

          {/* Export Bookmarks */}
          <Button
            variant="ghost"
            className="w-full justify-start h-12 px-3"
            onClick={handleExport}
            disabled={isExporting}
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                {isExporting ? (
                  <Loader2 className="h-4 w-4 text-primary animate-spin" />
                ) : (
                  <Download className="h-4 w-4 text-primary" />
                )}
              </div>
              <div className="text-left">
                <span className="font-medium block">Export Bookmarks</span>
                <span className="text-xs text-muted-foreground">Save to file</span>
              </div>
            </div>
          </Button>

          {/* Import Bookmarks */}
          <Button
            variant="ghost"
            className="w-full justify-start h-12 px-3"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Upload className="h-4 w-4 text-primary" />
              </div>
              <div className="text-left">
                <span className="font-medium block">Import Bookmarks</span>
                <span className="text-xs text-muted-foreground">Restore from file</span>
              </div>
            </div>
          </Button>
          
          {/* Hidden file input for import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileSelect}
            className="hidden"
          />

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

      {/* Import Dialog */}
      <ImportBackupDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        backupData={pendingBackup}
        stats={pendingStats}
        onImport={handleImport}
      />
    </Sheet>
  );
}