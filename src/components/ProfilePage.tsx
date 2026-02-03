import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Cloud, Upload, Download, RefreshCw, LogOut, HardDrive, Clock, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { UsageInsights } from '@/components/UsageInsights';
import { TutorialCoachMarks } from '@/components/TutorialCoachMarks';
import { SyncStatusIndicator } from '@/components/SyncStatusIndicator';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { isValidImageSource } from '@/lib/imageUtils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
import { useTutorial } from '@/hooks/useTutorial';
import { getSavedLinks } from '@/lib/savedLinksManager';
import { getScheduledActions } from '@/lib/scheduledActionsManager';
import { syncBookmarks, uploadBookmarksToCloud, downloadBookmarksFromCloud, getCloudBookmarkCount, getCloudScheduledActionsCount } from '@/lib/cloudSync';
import { getSyncStatus, recordSync, formatRelativeTime, clearSyncStatus } from '@/lib/syncStatusManager';
import { getSettings, updateSettings } from '@/lib/settingsManager';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AppMenu } from './AppMenu';
import { TrashSheet } from './TrashSheet';
import { SettingsPage } from './SettingsPage';

interface ProfilePageProps {}

export function ProfilePage({}: ProfilePageProps = {}) {
  const { t } = useTranslation();
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [localCount, setLocalCount] = useState(0);
  const [localRemindersCount, setLocalRemindersCount] = useState(0);
  const [cloudCount, setCloudCount] = useState<number | null>(null);
  const [cloudRemindersCount, setCloudRemindersCount] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(() => getSettings().autoSyncEnabled);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const tutorial = useTutorial('profile');

  // Register dialog with back button handler
  const handleCloseDeleteDialog = useCallback(() => setShowDeleteDialog(false), []);
  const handleCloseTrash = useCallback(() => setIsTrashOpen(false), []);
  const handleCloseSettings = useCallback(() => setShowSettings(false), []);
  useSheetBackHandler('profile-delete-dialog', showDeleteDialog, handleCloseDeleteDialog, 10);
  useSheetBackHandler('profile-trash-sheet', isTrashOpen, handleCloseTrash);
  useSheetBackHandler('profile-settings-page', showSettings, handleCloseSettings);

  const isOperating = isSyncing || isUploading || isDownloading || isDeleting;

  // Refresh counts
  const refreshCounts = async () => {
    setLocalCount(getSavedLinks().length);
    setLocalRemindersCount(getScheduledActions().length);
    if (user) {
      const [bookmarkCount, actionsCount] = await Promise.all([
        getCloudBookmarkCount(),
        getCloudScheduledActionsCount()
      ]);
      setCloudCount(bookmarkCount);
      setCloudRemindersCount(actionsCount);
    }
  };

  const handleAutoSyncToggle = (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    updateSettings({ autoSyncEnabled: enabled });
    window.dispatchEvent(new CustomEvent('settings-changed'));
    toast({
      title: enabled ? t('profile.autoSyncEnabled') : t('profile.autoSyncDisabled'),
      description: enabled 
        ? t('profile.autoSyncEnabledDesc')
        : t('profile.autoSyncDisabledDesc'),
    });
  };

  useEffect(() => {
    refreshCounts();
    setSyncStatus(getSyncStatus());
  }, [user]);

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const response = await supabase.functions.invoke('delete-account', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to delete account');
      }

      // Clear local sync status
      clearSyncStatus();
      
      // Sign out locally
      await supabase.auth.signOut();

      toast({
        title: t('profile.accountDeleted'),
        description: t('profile.accountDeletedDesc'),
      });
    } catch (error) {
      console.error('[DeleteAccount] Error:', error);
      toast({
        title: t('profile.deleteAccountFailed'),
        description: error instanceof Error ? error.message : t('profile.tryAgainLater'),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error: any) {
      const isTokenError = error?.message?.includes('ES256') || 
                           error?.message?.includes('invalid') ||
                           error?.message?.includes('signing method');
      toast({
        title: t('profile.signInFailed'),
        description: isTokenError 
          ? t('profile.sessionExpired')
          : t('profile.couldNotSignIn'),
        variant: 'destructive',
      });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setCloudCount(null);
    setCloudRemindersCount(null);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncBookmarks();
      if (result.success) {
        recordSync(result.uploaded, result.downloaded);
        setSyncStatus(getSyncStatus());
        toast({
          title: t('profile.syncComplete'),
          description: t('profile.syncCompleteDesc', { uploaded: result.uploaded, downloaded: result.downloaded }),
        });
        if (result.downloaded > 0) {
          window.location.reload();
        } else {
          await refreshCounts();
        }
      } else {
        toast({
          title: t('profile.syncFailed'),
          description: result.error,
          variant: 'destructive',
        });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpload = async () => {
    setIsUploading(true);
    try {
      const result = await uploadBookmarksToCloud();
      if (result.success) {
        recordSync(result.uploaded, 0);
        setSyncStatus(getSyncStatus());
        toast({
          title: t('profile.uploadComplete'),
          description: t('profile.uploadCompleteDesc', { count: result.uploaded }),
        });
        await refreshCounts();
      } else {
        toast({
          title: t('profile.uploadFailed'),
          description: result.error,
          variant: 'destructive',
        });
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const result = await downloadBookmarksFromCloud();
      if (result.success) {
        recordSync(0, result.downloaded);
        setSyncStatus(getSyncStatus());
        toast({
          title: t('profile.downloadComplete'),
          description: t('profile.downloadCompleteDesc', { count: result.downloaded }),
        });
        if (result.downloaded > 0) {
          window.location.reload();
        }
      } else {
        toast({
          title: t('profile.downloadFailed'),
          description: result.error,
          variant: 'destructive',
        });
      }
    } finally {
      setIsDownloading(false);
    }
  };

  // Show settings page
  if (showSettings) {
    return <SettingsPage onBack={() => setShowSettings(false)} />;
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not signed in state
  if (!user) {
    return (
      <ScrollArea className="flex-1">
        <div className="flex flex-col pb-20">
        {/* Header with Menu */}
        <header className="ps-5 pe-5 pt-header-safe pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <User className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">{t('tabs.profile')}</h1>
          </div>
          <AppMenu onOpenTrash={() => setIsTrashOpen(true)} onOpenSettings={() => setShowSettings(true)} />
        </header>

        <div id="tutorial-user-card" className="flex flex-col items-center gap-6 max-w-sm mx-auto text-center px-5 py-8 mb-4">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
            <User className="w-10 h-10 text-muted-foreground" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">{t('profile.signInToSync')}</h1>
            <p className="text-muted-foreground">
              {t('profile.signInDescription')}
            </p>
          </div>

          <div className="w-full space-y-3">
            <Button onClick={handleSignIn} className="w-full gap-2" size="lg">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {t('profile.signInWithGoogle')}
            </Button>
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            <p className="flex items-center gap-2 justify-center">
              <Cloud className="w-4 h-4" /> {t('profile.secureBackup')}
            </p>
            <p className="flex items-center gap-2 justify-center">
              <RefreshCw className="w-4 h-4" /> {t('profile.syncAcrossDevices')}
            </p>
          </div>
        </div>

        {/* Usage Insights for signed-out users too */}
        <div className="px-5">
          <UsageInsights />
        </div>
        
        {/* Trash Sheet */}
        <TrashSheet 
          open={isTrashOpen} 
          onOpenChange={setIsTrashOpen}
          onOpenSettings={() => setShowSettings(true)}
        />

        {/* Tutorial Coach Marks */}
        {tutorial.isActive && (
          <TutorialCoachMarks
            steps={tutorial.steps}
            currentStep={tutorial.currentStep}
            onNext={tutorial.next}
            onDismiss={tutorial.skip}
          />
        )}
        </div>
      </ScrollArea>
    );
  }

  // Signed in state
  const userMeta = user.user_metadata;
  const rawAvatarUrl = userMeta?.avatar_url || userMeta?.picture;
  const fullName = userMeta?.full_name || userMeta?.name || 'User';
  const email = user.email || '';
  
  // Validate avatar URL before attempting to load
  const validAvatarUrl = useMemo(() => 
    rawAvatarUrl && isValidImageSource(rawAvatarUrl) ? rawAvatarUrl : null,
  [rawAvatarUrl]);

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col pb-20">
      {/* Header with Menu */}
      <header className="ps-5 pe-5 pt-header-safe pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <User className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">{t('tabs.profile')}</h1>
        </div>
        <AppMenu onOpenTrash={() => setIsTrashOpen(true)} onOpenSettings={() => setShowSettings(true)} />
      </header>

      {/* Content with horizontal padding */}
      <div className="px-5">
      {/* User Info Card */}
      <Card id="tutorial-user-card" className="mb-4">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            {validAvatarUrl ? (
              <ImageWithFallback
                sources={[validAvatarUrl]}
                fallback={
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-8 h-8 text-primary" />
                  </div>
                }
                alt={fullName}
                className="w-16 h-16 rounded-full object-cover"
                referrerPolicy="no-referrer"
                showSkeleton={false}
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-8 h-8 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold truncate">{fullName}</h2>
              <p className="text-sm text-muted-foreground truncate">{email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sync Status Card */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {t('profile.syncStatus')}
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* Subtle sync status indicator */}
              <SyncStatusIndicator />
              {autoSyncEnabled ? (
                <span className="text-xs text-green-600 dark:text-green-400">
                  {t('profile.autoSyncOn')}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">{t('profile.autoSyncOff')}</span>
              )}
            </div>
          </div>
          <CardDescription>
            {formatRelativeTime(syncStatus.lastSyncAt)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <HardDrive className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-lg font-bold leading-tight">
                  {localCount} <span className="text-sm font-normal text-muted-foreground">{t('profile.bookmarks')}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {localRemindersCount} <span className="text-xs">{t('profile.reminders')}</span>
                </p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">{t('profile.local')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Cloud className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-lg font-bold leading-tight">
                  {cloudCount ?? '—'} <span className="text-sm font-normal text-muted-foreground">{t('profile.bookmarks')}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {cloudRemindersCount ?? '—'} <span className="text-xs">{t('profile.reminders')}</span>
                </p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">{t('profile.cloud')}</p>
              </div>
            </div>
          </div>

          {syncStatus.lastSyncAt && (
            <div className="mt-3 text-xs text-muted-foreground text-center">
              {t('profile.lastSyncInfo', { uploaded: syncStatus.lastUploadCount, downloaded: syncStatus.lastDownloadCount })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Insights */}
      <div className="mb-4">
        <UsageInsights />
      </div>

      {/* Actions Card */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('profile.quickActions')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button 
            onClick={handleSync} 
            disabled={isOperating}
            className="w-full gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? t('profile.syncing') : t('profile.syncNow')}
          </Button>
          
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              onClick={handleUpload}
              disabled={isOperating}
              className="gap-2"
            >
              <Upload className="w-4 h-4" />
              {isUploading ? t('profile.uploading') : t('profile.upload')}
            </Button>
            <Button 
              variant="outline" 
              onClick={handleDownload}
              disabled={isOperating}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              {isDownloading ? t('profile.downloading') : t('profile.download')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Settings Card */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('settings.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-sync" className="text-sm font-medium">
                {t('profile.autoSync')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('profile.autoSyncDesc')}
              </p>
            </div>
            <Switch
              id="auto-sync"
              checked={autoSyncEnabled}
              onCheckedChange={handleAutoSyncToggle}
            />
          </div>
        </CardContent>
      </Card>

      {/* Account Actions */}
      <div className="space-y-2">
        <Button 
          variant="ghost" 
          onClick={handleSignOut}
          disabled={isOperating}
          className="w-full gap-2 text-muted-foreground"
        >
          <LogOut className="w-4 h-4" />
          {t('profile.signOut')}
        </Button>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogTrigger asChild>
            <Button 
              variant="ghost" 
              disabled={isOperating}
              className="w-full gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4" />
              {t('profile.deleteAccount')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-[320px] rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>{t('profile.deleteAccountTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('profile.deleteAccountDesc')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-2">
              <AlertDialogCancel className="flex-1 m-0" disabled={isDeleting}>
                {t('common.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction 
                className="flex-1 m-0 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
              >
                {isDeleting ? t('profile.deleting') : t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      </div>

      {/* Trash Sheet */}
      <TrashSheet 
        open={isTrashOpen} 
        onOpenChange={setIsTrashOpen}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Tutorial Coach Marks */}
      {tutorial.isActive && (
        <TutorialCoachMarks
          steps={tutorial.steps}
          currentStep={tutorial.currentStep}
          onNext={tutorial.next}
          onDismiss={tutorial.skip}
        />
      )}
      </div>
    </ScrollArea>
  );
}
