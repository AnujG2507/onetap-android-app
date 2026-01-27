import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  ChevronLeft,
  Sun, 
  Moon, 
  Monitor, 
  Globe, 
  Clipboard, 
  Bell,
  Trash2,
  RotateCcw,
  ChevronRight,
  Check,
  Loader2,
  BookOpen,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { useSettings } from '@/hooks/useSettings';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
import { resetAllTutorials } from '@/hooks/useTutorial';
import { supportedLanguages } from '@/i18n';
import i18n from '@/i18n';
import type { TrashRetentionDays } from '@/lib/settingsManager';

type ThemeOption = 'light' | 'dark' | 'system';

interface SettingsPageProps {
  onBack: () => void;
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { settings, updateSettings } = useSettings();
  const { resetOnboarding } = useOnboarding();
  
  // Language picker state
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);
  const [isChangingLanguage, setIsChangingLanguage] = useState(false);
  const [changingTo, setChangingTo] = useState<string | null>(null);
  
  const currentLanguage = i18n.language?.split('-')[0] || 'en';
  const currentLanguageConfig = supportedLanguages.find(l => l.code === currentLanguage);

  // Register language sheet with back handler
  const handleCloseLanguageSheet = useCallback(() => setLanguageSheetOpen(false), []);
  useSheetBackHandler('settings-language-sheet', languageSheetOpen, handleCloseLanguageSheet);

  // Theme options
  const themeOptions: { value: ThemeOption; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: t('settings.light'), icon: <Sun className="h-4 w-4" /> },
    { value: 'dark', label: t('settings.dark'), icon: <Moon className="h-4 w-4" /> },
    { value: 'system', label: t('settings.system'), icon: <Monitor className="h-4 w-4" /> },
  ];

  // Trash retention options
  const retentionOptions: { value: TrashRetentionDays; label: string }[] = [
    { value: 7, label: t('settingsPage.retention7') },
    { value: 14, label: t('settingsPage.retention14') },
    { value: 30, label: t('settingsPage.retention30') },
    { value: 60, label: t('settingsPage.retention60') },
  ];

  const handleLanguageChange = async (code: string) => {
    if (code === currentLanguage || isChangingLanguage) return;
    
    setIsChangingLanguage(true);
    setChangingTo(code);
    
    try {
      await i18n.changeLanguage(code);
      
      // Update document direction for RTL languages
      const lang = supportedLanguages.find(l => l.code === code);
      document.documentElement.dir = lang?.rtl ? 'rtl' : 'ltr';
      
      await new Promise(resolve => setTimeout(resolve, 100));
      setLanguageSheetOpen(false);
    } catch (error) {
      console.error('Failed to change language:', error);
    } finally {
      setIsChangingLanguage(false);
      setChangingTo(null);
    }
  };

  const handleResetOnboarding = () => {
    resetOnboarding();
    window.location.reload();
  };

  const handleResetTutorials = () => {
    resetAllTutorials();
    window.location.reload();
  };

  return (
    <div className="flex-1 flex flex-col pb-20">
      {/* Header */}
      <header className="px-4 pt-header-safe-compact pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rtl:rotate-180"
            onClick={onBack}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold text-foreground">{t('settings.title')}</h1>
        </div>
      </header>

      <ScrollArea className="flex-1 px-4">
        <div className="space-y-4 pb-8">
          {/* Appearance Section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sun className="h-4 w-4 text-muted-foreground" />
                {t('settings.appearance')}
              </CardTitle>
              <CardDescription>{t('settingsPage.appearanceDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
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
            </CardContent>
          </Card>

          {/* Language Section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                {t('settings.language')}
              </CardTitle>
              <CardDescription>{t('settingsPage.languageDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={() => setLanguageSheetOpen(true)}
              >
                <span>{currentLanguageConfig?.nativeName || 'English'}</span>
                <ChevronRight className="h-4 w-4 rtl:rotate-180" />
              </Button>
            </CardContent>
          </Card>

          {/* Notifications Section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                {t('settingsPage.notifications')}
              </CardTitle>
              <CardDescription>{t('settingsPage.notificationsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{t('settingsPage.scheduledReminders')}</p>
                  <p className="text-xs text-muted-foreground">{t('settingsPage.scheduledRemindersDesc')}</p>
                </div>
                <Switch
                  checked={settings.scheduledRemindersEnabled !== false}
                  onCheckedChange={(checked) => updateSettings({ scheduledRemindersEnabled: checked })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{t('settingsPage.reminderSound')}</p>
                  <p className="text-xs text-muted-foreground">{t('settingsPage.reminderSoundDesc')}</p>
                </div>
                <Switch
                  checked={settings.reminderSoundEnabled !== false}
                  onCheckedChange={(checked) => updateSettings({ reminderSoundEnabled: checked })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Clipboard Section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clipboard className="h-4 w-4 text-muted-foreground" />
                {t('settingsPage.clipboard')}
              </CardTitle>
              <CardDescription>{t('settingsPage.clipboardDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{t('settings.clipboardDetection')}</p>
                  <p className="text-xs text-muted-foreground">{t('settings.clipboardDescription')}</p>
                </div>
                <Switch
                  checked={settings.clipboardDetectionEnabled}
                  onCheckedChange={(checked) => updateSettings({ clipboardDetectionEnabled: checked })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Trash Section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                {t('settingsPage.trashSettings')}
              </CardTitle>
              <CardDescription>{t('settingsPage.trashSettingsDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{t('settingsPage.retentionPeriod')}</p>
                  <p className="text-xs text-muted-foreground">{t('settingsPage.retentionPeriodDesc')}</p>
                </div>
                <Select
                  value={String(settings.trashRetentionDays)}
                  onValueChange={(value) => updateSettings({ trashRetentionDays: Number(value) as TrashRetentionDays })}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {retentionOptions.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Video Player Section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Play className="h-4 w-4 text-muted-foreground" />
                {t('settingsPage.videoPlayer')}
              </CardTitle>
              <CardDescription>{t('settingsPage.videoPlayerDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{t('settingsPage.pipMode')}</p>
                  <p className="text-xs text-muted-foreground">{t('settingsPage.pipModeDesc')}</p>
                </div>
                <Switch
                  checked={settings.pipModeEnabled !== false}
                  onCheckedChange={(checked) => updateSettings({ pipModeEnabled: checked })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Advanced Section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
                {t('settingsPage.advanced')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={handleResetOnboarding}
                >
                  <RotateCcw className="h-4 w-4" />
                  {t('settings.resetOnboarding')}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  {t('settings.resetOnboardingDescription')}
                </p>
              </div>
              <Separator />
              <div>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={handleResetTutorials}
                >
                  <BookOpen className="h-4 w-4" />
                  {t('settings.resetTutorials')}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  {t('settings.resetTutorialsDescription')}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      {/* Language Picker Sheet */}
      <Sheet open={languageSheetOpen} onOpenChange={setLanguageSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] flex flex-col">
          <SheetHeader className="text-start shrink-0">
            <SheetTitle>{t('settings.language')}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 mt-4 -mx-6 px-6">
            <div className="space-y-1 pb-4">
              {supportedLanguages.map((lang) => {
                const isSelected = currentLanguage === lang.code;
                const isLoading = changingTo === lang.code;
                
                return (
                  <button
                    key={lang.code}
                    onClick={() => handleLanguageChange(lang.code)}
                    disabled={isChangingLanguage}
                    className={cn(
                      "flex items-center justify-between w-full py-3 px-4 rounded-xl",
                      "transition-colors",
                      isSelected
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted/50",
                      isChangingLanguage && !isLoading && "opacity-50"
                    )}
                    dir={lang.rtl ? 'rtl' : 'ltr'}
                    aria-label={lang.name}
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{lang.nativeName}</span>
                      <span className="text-sm text-muted-foreground">{lang.name}</span>
                    </div>
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 text-primary animate-spin" aria-hidden="true" />
                    ) : isSelected ? (
                      <Check className="h-5 w-5 text-primary" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
