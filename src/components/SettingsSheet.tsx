import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Sun, Moon, Monitor, ExternalLink } from 'lucide-react';
import { useTheme } from 'next-themes';
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
import { LanguagePicker } from '@/components/LanguagePicker';
import { useSettings } from '@/hooks/useSettings';
import { cn } from '@/lib/utils';

type ThemeOption = 'light' | 'dark' | 'system';

interface SettingsSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SettingsSheet({ open, onOpenChange }: SettingsSheetProps) {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const { theme, setTheme } = useTheme();
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);

  const themeOptions: { value: ThemeOption; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: t('settings.light'), icon: <Sun className="h-4 w-4" /> },
    { value: 'dark', label: t('settings.dark'), icon: <Moon className="h-4 w-4" /> },
    { value: 'system', label: t('settings.system'), icon: <Monitor className="h-4 w-4" /> },
  ];

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-9 w-9"
            aria-label={t('settings.title')}
          >
            <Settings className="h-5 w-5" />
            <span className="sr-only">{t('settings.title')}</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle>{t('settings.title')}</SheetTitle>
            <SheetDescription>
              {t('settings.description')}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            {/* Theme Selection */}
            <div className="space-y-3">
              <Label className="text-base">{t('settings.appearance')}</Label>
              <div className="flex gap-2" role="radiogroup" aria-label={t('settings.appearance')}>
                {themeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setTheme(option.value)}
                    role="radio"
                    aria-checked={theme === option.value}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 rounded-xl p-3 transition-all",
                      "border-2",
                      theme === option.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {option.icon}
                    <span className="text-sm font-medium">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Language Selection */}
            <div className="border-t border-border pt-4">
              <LanguagePicker 
                open={languagePickerOpen} 
                onOpenChange={setLanguagePickerOpen} 
              />
            </div>

            {/* Clipboard Detection Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="clipboard-detection" className="text-base">
                  {t('settings.clipboardDetection')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings.clipboardDescription')}
                </p>
              </div>
              <Switch
                id="clipboard-detection"
                checked={settings.clipboardDetectionEnabled}
                onCheckedChange={(checked) =>
                  updateSettings({ clipboardDetectionEnabled: checked })
                }
                aria-label={t('settings.clipboardDetection')}
              />
            </div>

            {/* Privacy Policy Link */}
            <div className="border-t border-border pt-4">
              <a
                href="/privacy-policy.html"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center justify-between w-full py-3 px-1",
                  "text-left hover:bg-muted/50 rounded-lg transition-colors"
                )}
                aria-label={t('settings.privacy')}
              >
                <span className="text-base">{t('settings.privacy')}</span>
                <ExternalLink className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </a>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
