import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useSettings } from '@/hooks/useSettings';

export function SettingsSheet() {
  const { settings, updateSettings } = useSettings();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Settings className="h-5 w-5" />
          <span className="sr-only">Settings</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Configure app preferences
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="clipboard-detection" className="text-base">
                Clipboard URL detection
              </Label>
              <p className="text-sm text-muted-foreground">
                Show suggestions when a URL is copied
              </p>
            </div>
            <Switch
              id="clipboard-detection"
              checked={settings.clipboardDetectionEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ clipboardDetectionEnabled: checked })
              }
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
