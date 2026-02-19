import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  ChevronLeft,
  Sun, 
  Moon, 
  Monitor, 
  // LANGUAGE SUPPORT TEMPORARILY DISABLED
  // Globe icon import preserved for future re-enablement.
  // Do not delete. Will be re-enabled in a future update.
  // Globe,
  Clipboard,
  Bell,
  Trash2,
  RotateCcw,
  ChevronRight,
  Check,
  Loader2,
  BookOpen,
  Play,
  Bug,
  Copy,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
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
// LANGUAGE SUPPORT TEMPORARILY DISABLED
// These imports are preserved for future re-enablement.
// Do not delete. Will be re-enabled in a future update.
// import { supportedLanguages } from '@/i18n';
// import i18n from '@/i18n';
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
  
  // LANGUAGE SUPPORT TEMPORARILY DISABLED
  // Language picker state preserved for future re-enablement.
  // Do not delete. Will be re-enabled in a future update.
  // const [languageSheetOpen, setLanguageSheetOpen] = useState(false);
  // const [isChangingLanguage, setIsChangingLanguage] = useState(false);
  // const [changingTo, setChangingTo] = useState<string | null>(null);
  
  // Debug logs state
  const [crashLogs, setCrashLogs] = useState<{
    errorLog?: string;
    breadcrumbs?: string[];
    sessionId?: string;
    sessionDurationSeconds?: number;
  } | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(false);
  
  const isNative = Capacitor.isNativePlatform();
  
  // LANGUAGE SUPPORT TEMPORARILY DISABLED
  // Language detection preserved for future re-enablement.
  // Do not delete. Will be re-enabled in a future update.
  // const currentLanguage = i18n.language?.split('-')[0] || 'en';
  // const currentLanguageConfig = supportedLanguages.find(l => l.code === currentLanguage);

  // LANGUAGE SUPPORT TEMPORARILY DISABLED
  // Language sheet back handler preserved for future re-enablement.
  // Do not delete. Will be re-enabled in a future update.
  // const handleCloseLanguageSheet = useCallback(() => setLanguageSheetOpen(false), []);
  // useSheetBackHandler('settings-language-sheet', languageSheetOpen, handleCloseLanguageSheet);

  // LANGUAGE SUPPORT TEMPORARILY DISABLED - see above

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

  // LANGUAGE SUPPORT TEMPORARILY DISABLED
  // Language change handler preserved for future re-enablement.
  // Do not delete. Will be re-enabled in a future update.
  // const handleLanguageChange = async (code: string) => {
  //   if (code === currentLanguage || isChangingLanguage) return;
  //   
  //   setIsChangingLanguage(true);
  //   setChangingTo(code);
  //   
  //   try {
  //     await i18n.changeLanguage(code);
  //     
  //     // Update document direction for RTL languages
  //     const lang = supportedLanguages.find(l => l.code === code);
  //     document.documentElement.dir = lang?.rtl ? 'rtl' : 'ltr';
  //     
  //     await new Promise(resolve => setTimeout(resolve, 100));
  //     setLanguageSheetOpen(false);
  //   } catch (error) {
  //     console.error('Failed to change language:', error);
  //   } finally {
  //     setIsChangingLanguage(false);
  //     setChangingTo(null);
  //   }
  // };

  const handleResetOnboarding = () => {
    resetOnboarding();
    window.location.reload();
  };

  const handleResetTutorials = () => {
    resetAllTutorials();
    window.location.reload();
  };

  // Fetch crash logs
  const fetchCrashLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    try {
      const result = await ShortcutPlugin.getCrashLogs();
      if (result.success) {
        setCrashLogs({
          errorLog: result.errorLog,
          breadcrumbs: result.breadcrumbs,
          sessionId: result.sessionId,
          sessionDurationSeconds: result.sessionDurationSeconds,
        });
      }
    } catch (error) {
      console.error('Failed to fetch crash logs:', error);
    } finally {
      setIsLoadingLogs(false);
    }
  }, []);

  // Load logs when expanded
  useEffect(() => {
    if (logsExpanded && !crashLogs) {
      fetchCrashLogs();
    }
  }, [logsExpanded, crashLogs, fetchCrashLogs]);

  const handleCopyLogs = async () => {
    if (!crashLogs) return;
    
    const logText = [
      `=== OneTap Debug Logs ===`,
      `Session ID: ${crashLogs.sessionId || 'N/A'}`,
      `Session Duration: ${crashLogs.sessionDurationSeconds || 0}s`,
      ``,
      `=== Error Log ===`,
      crashLogs.errorLog || '(No errors recorded)',
      ``,
      `=== Recent Breadcrumbs ===`,
      ...(crashLogs.breadcrumbs?.filter(b => b) || ['(No breadcrumbs)']),
    ].join('\n');
    
    try {
      await navigator.clipboard.writeText(logText);
      toast.success(t('settingsPage.logsCopied'));
    } catch {
      toast.error('Failed to copy logs');
    }
  };

  const handleClearLogs = async () => {
    try {
      await ShortcutPlugin.clearCrashLogs();
      setCrashLogs(null);
      toast.success(t('settingsPage.logsCleared'));
    } catch (error) {
      console.error('Failed to clear logs:', error);
      toast.error('Failed to clear logs');
    }
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

          {/* LANGUAGE SUPPORT TEMPORARILY DISABLED
              Language Section preserved for future re-enablement.
              Do not delete. Will be re-enabled in a future update.
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
          */}

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

          {/* Debug Logs Section */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bug className="h-4 w-4 text-muted-foreground" />
                  {t('settingsPage.debugLogs')}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLogsExpanded(!logsExpanded)}
                  className="h-8 w-8 p-0"
                >
                  {logsExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <CardDescription>{t('settingsPage.debugLogsDesc')}</CardDescription>
            </CardHeader>
            
            {logsExpanded && (
              <CardContent className="space-y-4">
                {isLoadingLogs ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {/* Session info */}
                    {crashLogs && (
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>Session: {crashLogs.sessionId || 'N/A'}</p>
                        <p>Duration: {crashLogs.sessionDurationSeconds || 0}s</p>
                        {!isNative && (
                          <p className="text-warning">{t('settingsPage.debugLogsNativeOnly')}</p>
                        )}
                      </div>
                    )}
                    
                    {/* Error log */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium">{t('settingsPage.errorLog')}</p>
                      <div className="bg-muted/50 rounded-lg p-3 max-h-32 overflow-y-auto">
                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all font-mono">
                          {crashLogs?.errorLog || t('settingsPage.noErrors')}
                        </pre>
                      </div>
                    </div>
                    
                    {/* Recent breadcrumbs */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium">{t('settingsPage.breadcrumbs')}</p>
                      <div className="bg-muted/50 rounded-lg p-3 max-h-40 overflow-y-auto">
                        {crashLogs?.breadcrumbs?.filter(b => b).length ? (
                          <ul className="text-xs text-muted-foreground space-y-1 font-mono">
                            {crashLogs.breadcrumbs.filter(b => b).slice(0, 20).map((b, i) => (
                              <li key={i} className="break-all">{b}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-muted-foreground">{t('settingsPage.noBreadcrumbs')}</p>
                        )}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={handleCopyLogs}
                        disabled={!crashLogs}
                      >
                        <Copy className="h-4 w-4" />
                        {t('settingsPage.copyLogs')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={handleClearLogs}
                        disabled={!crashLogs}
                      >
                        <Trash2 className="h-4 w-4" />
                        {t('settingsPage.clearLogs')}
                      </Button>
                    </div>
                    
                    {/* Refresh button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full gap-2"
                      onClick={fetchCrashLogs}
                    >
                      <RotateCcw className="h-4 w-4" />
                      {t('settingsPage.refreshLogs')}
                    </Button>
                  </>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      </ScrollArea>

      {/* LANGUAGE SUPPORT TEMPORARILY DISABLED
          Language Picker Sheet preserved for future re-enablement.
          Do not delete. Will be re-enabled in a future update.
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
      */}
    </div>
  );
}
