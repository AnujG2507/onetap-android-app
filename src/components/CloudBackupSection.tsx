import { useState } from 'react';
import { Cloud, CloudOff, RefreshCw, Upload, Download, LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { syncBookmarks, uploadBookmarksToCloud, downloadBookmarksFromCloud } from '@/lib/cloudSync';
import { toast } from '@/hooks/use-toast';

export function CloudBackupSection() {
  const { user, loading: authLoading, isAuthenticated, signInWithGoogle, signOut } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

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
    try {
      await signOut();
      toast({
        title: 'Signed out',
        description: 'You have been signed out successfully.',
      });
    } catch (error) {
      toast({
        title: 'Sign out failed',
        description: 'Could not sign out. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncBookmarks();
      if (result.success) {
        toast({
          title: 'Sync complete',
          description: `Uploaded ${result.uploaded} and downloaded ${result.downloaded} bookmarks.`,
        });
        if (result.downloaded > 0) {
          // Reload to show new bookmarks
          window.location.reload();
        }
      } else {
        toast({
          title: 'Sync failed',
          description: result.error || 'Could not sync bookmarks.',
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
        toast({
          title: 'Upload complete',
          description: `Uploaded ${result.uploaded} bookmarks to cloud.`,
        });
      } else {
        toast({
          title: 'Upload failed',
          description: result.error || 'Could not upload bookmarks.',
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
        toast({
          title: 'Download complete',
          description: result.downloaded > 0 
            ? `Downloaded ${result.downloaded} new bookmarks.`
            : 'No new bookmarks to download.',
        });
        if (result.downloaded > 0) {
          window.location.reload();
        }
      } else {
        toast({
          title: 'Download failed',
          description: result.error || 'Could not download bookmarks.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsDownloading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="px-3 py-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <Separator className="my-3" />
        <p className="text-xs text-muted-foreground px-3 mb-2">Cloud Backup</p>
        <Button
          variant="ghost"
          className="w-full justify-start h-12 px-3"
          onClick={handleSignIn}
        >
          <div className="flex items-center gap-3 flex-1">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Cloud className="h-4 w-4 text-primary" />
            </div>
            <div className="text-left">
              <span className="font-medium block">Sign in with Google</span>
              <span className="text-xs text-muted-foreground">Sync bookmarks across devices</span>
            </div>
          </div>
        </Button>
      </>
    );
  }

  return (
    <>
      <Separator className="my-3" />
      <p className="text-xs text-muted-foreground px-3 mb-2">Cloud Backup</p>
      
      {/* User info */}
      <div className="px-3 py-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
            {user?.user_metadata?.avatar_url ? (
              <img 
                src={user.user_metadata.avatar_url} 
                alt="Profile" 
                className="h-full w-full object-cover"
              />
            ) : (
              <Cloud className="h-4 w-4 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {user?.user_metadata?.full_name || user?.email}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Sync button */}
      <Button
        variant="ghost"
        className="w-full justify-start h-12 px-3"
        onClick={handleSync}
        disabled={isSyncing || isUploading || isDownloading}
      >
        <div className="flex items-center gap-3 flex-1">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            {isSyncing ? (
              <Loader2 className="h-4 w-4 text-primary animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 text-primary" />
            )}
          </div>
          <div className="text-left">
            <span className="font-medium block">Sync Now</span>
            <span className="text-xs text-muted-foreground">Upload & download bookmarks</span>
          </div>
        </div>
      </Button>

      {/* Upload only */}
      <Button
        variant="ghost"
        className="w-full justify-start h-12 px-3"
        onClick={handleUpload}
        disabled={isSyncing || isUploading || isDownloading}
      >
        <div className="flex items-center gap-3 flex-1">
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
            {isUploading ? (
              <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
            ) : (
              <Upload className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <span className="font-medium">Upload to Cloud</span>
        </div>
      </Button>

      {/* Download only */}
      <Button
        variant="ghost"
        className="w-full justify-start h-12 px-3"
        onClick={handleDownload}
        disabled={isSyncing || isUploading || isDownloading}
      >
        <div className="flex items-center gap-3 flex-1">
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
            {isDownloading ? (
              <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
            ) : (
              <Download className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <span className="font-medium">Download from Cloud</span>
        </div>
      </Button>

      {/* Sign out */}
      <Button
        variant="ghost"
        className="w-full justify-start h-12 px-3 text-destructive hover:text-destructive"
        onClick={handleSignOut}
      >
        <div className="flex items-center gap-3 flex-1">
          <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
            <LogOut className="h-4 w-4 text-destructive" />
          </div>
          <span className="font-medium">Sign Out</span>
        </div>
      </Button>
    </>
  );
}
