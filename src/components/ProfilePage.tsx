import { useState, useEffect, useCallback } from 'react';
import { User, Cloud, Upload, Download, RefreshCw, LogOut, HardDrive, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
import { getSavedLinks } from '@/lib/savedLinksManager';
import { syncBookmarks, uploadBookmarksToCloud, downloadBookmarksFromCloud, getCloudBookmarkCount } from '@/lib/cloudSync';
import { getSyncStatus, recordSync, formatRelativeTime, clearSyncStatus } from '@/lib/syncStatusManager';
import { getSettings, updateSettings } from '@/lib/settingsManager';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function ProfilePage() {
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [localCount, setLocalCount] = useState(0);
  const [cloudCount, setCloudCount] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(() => getSettings().autoSyncEnabled);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Register dialog with back button handler
  const handleCloseDeleteDialog = useCallback(() => setShowDeleteDialog(false), []);
  useSheetBackHandler('profile-delete-dialog', showDeleteDialog, handleCloseDeleteDialog, 10);

  const isOperating = isSyncing || isUploading || isDownloading || isDeleting;

  // Refresh counts
  const refreshCounts = async () => {
    setLocalCount(getSavedLinks().length);
    if (user) {
      const count = await getCloudBookmarkCount();
      setCloudCount(count);
    }
  };

  const handleAutoSyncToggle = (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    updateSettings({ autoSyncEnabled: enabled });
    window.dispatchEvent(new CustomEvent('settings-changed'));
    toast({
      title: enabled ? 'Auto-sync enabled' : 'Auto-sync disabled',
      description: enabled 
        ? 'Bookmarks will sync automatically when changes are made'
        : 'Use manual sync to backup your bookmarks',
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
        title: 'Account deleted',
        description: 'Your account and all cloud data have been permanently deleted.',
      });
    } catch (error) {
      console.error('[DeleteAccount] Error:', error);
      toast({
        title: 'Failed to delete account',
        description: error instanceof Error ? error.message : 'Please try again later',
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
        title: 'Sign in failed',
        description: isTokenError 
          ? 'Session expired. Please try signing in again.'
          : 'Could not sign in with Google. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setCloudCount(null);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncBookmarks();
      if (result.success) {
        recordSync(result.uploaded, result.downloaded);
        setSyncStatus(getSyncStatus());
        toast({
          title: 'Sync complete',
          description: `Uploaded ${result.uploaded}, downloaded ${result.downloaded} bookmarks`,
        });
        if (result.downloaded > 0) {
          window.location.reload();
        } else {
          await refreshCounts();
        }
      } else {
        toast({
          title: 'Sync failed',
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
          title: 'Upload complete',
          description: `Uploaded ${result.uploaded} bookmarks to cloud`,
        });
        await refreshCounts();
      } else {
        toast({
          title: 'Upload failed',
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
          title: 'Download complete',
          description: `Downloaded ${result.downloaded} new bookmarks`,
        });
        if (result.downloaded > 0) {
          window.location.reload();
        }
      } else {
        toast({
          title: 'Download failed',
          description: result.error,
          variant: 'destructive',
        });
      }
    } finally {
      setIsDownloading(false);
    }
  };

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
      <div className="flex-1 flex flex-col p-6 safe-top">
        <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-sm mx-auto text-center">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
            <User className="w-10 h-10 text-muted-foreground" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Sign in to sync</h1>
            <p className="text-muted-foreground">
              Sign in with your Google account to backup your bookmarks to the cloud and sync across devices.
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
              Sign in with Google
            </Button>
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            <p className="flex items-center gap-2 justify-center">
              <Cloud className="w-4 h-4" /> Secure cloud backup
            </p>
            <p className="flex items-center gap-2 justify-center">
              <RefreshCw className="w-4 h-4" /> Sync across devices
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Signed in state
  const userMeta = user.user_metadata;
  const avatarUrl = userMeta?.avatar_url || userMeta?.picture;
  const fullName = userMeta?.full_name || userMeta?.name || 'User';
  const email = user.email || '';

  return (
    <div className="flex-1 flex flex-col p-4 pb-20 safe-top overflow-y-auto">
      {/* User Info Card */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img 
                src={avatarUrl} 
                alt={fullName} 
                className="w-16 h-16 rounded-full"
                referrerPolicy="no-referrer"
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
              Sync Status
            </CardTitle>
            {autoSyncEnabled ? (
              <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Auto-sync on
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Auto-sync off</span>
            )}
          </div>
          <CardDescription>
            {formatRelativeTime(syncStatus.lastSyncAt)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <HardDrive className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{localCount}</p>
                <p className="text-xs text-muted-foreground">Local</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Cloud className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{cloudCount ?? '—'}</p>
                <p className="text-xs text-muted-foreground">Cloud</p>
              </div>
            </div>
          </div>

          {syncStatus.lastSyncAt && (
            <div className="mt-3 text-xs text-muted-foreground text-center">
              Last sync: ↑{syncStatus.lastUploadCount} uploaded, ↓{syncStatus.lastDownloadCount} downloaded
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions Card */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button 
            onClick={handleSync} 
            disabled={isOperating}
            className="w-full gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>
          
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              onClick={handleUpload}
              disabled={isOperating}
              className="gap-2"
            >
              <Upload className="w-4 h-4" />
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
            <Button 
              variant="outline" 
              onClick={handleDownload}
              disabled={isOperating}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              {isDownloading ? 'Downloading...' : 'Download'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Settings Card */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-sync" className="text-sm font-medium">
                Auto-sync
              </Label>
              <p className="text-xs text-muted-foreground">
                Automatically backup when bookmarks change
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
          Sign Out
        </Button>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogTrigger asChild>
            <Button 
              variant="ghost" 
              disabled={isOperating}
              className="w-full gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4" />
              Delete Account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-[320px] rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your account and all cloud bookmarks. 
                Local bookmarks on this device will not be affected. 
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-2">
              <AlertDialogCancel className="flex-1 m-0" disabled={isDeleting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction 
                className="flex-1 m-0 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
