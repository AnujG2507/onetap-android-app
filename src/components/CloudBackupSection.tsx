import { useState } from 'react';
import { Cloud, RefreshCw, LogOut, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/hooks/useAuth';
import { syncBookmarks, uploadBookmarksToCloud, downloadBookmarksFromCloud, uploadTrashToCloud, downloadTrashFromCloud } from '@/lib/cloudSync';
import { recordSync } from '@/lib/syncStatusManager';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export function CloudBackupSection() {
  const { user, loading: authLoading, isAuthenticated, signInWithGoogle, signOut } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [isRecoveryAction, setIsRecoveryAction] = useState(false);

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

  /**
   * Safe bidirectional sync:
   * 1. Upload local → cloud (upsert by entity_id, never overwrites)
   * 2. Download cloud → local (only adds missing entity_ids)
   * Result: Union of both datasets, safe to run repeatedly
   * 
   * Manual sync always runs immediately and resets the daily sync timer.
   */
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncBookmarks();
      if (result.success) {
        // Record successful sync - resets the 24h daily sync timer
        recordSync(result.uploaded, result.downloaded);
        
        const hasChanges = result.uploaded > 0 || result.downloaded > 0;
        toast({
          title: 'Sync complete',
          description: hasChanges 
            ? `Added ${result.downloaded} from cloud, backed up ${result.uploaded} to cloud.`
            : 'Everything is already in sync.',
        });
        if (result.downloaded > 0) {
          window.location.reload();
        }
      } else {
        toast({
          title: 'Sync failed',
          description: result.error || 'Could not sync bookmarks. Try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Recovery tools - hidden by default, for edge cases only
  const handleForceUpload = async () => {
    setIsRecoveryAction(true);
    try {
      const [bookmarkResult] = await Promise.all([
        uploadBookmarksToCloud(),
        uploadTrashToCloud()
      ]);
      
      if (bookmarkResult.success) {
        // Record as sync (upload-only still resets daily timer)
        recordSync(bookmarkResult.uploaded, 0);
        toast({
          title: 'Upload complete',
          description: `Uploaded ${bookmarkResult.uploaded} bookmarks to cloud.`,
        });
      } else {
        toast({
          title: 'Upload failed',
          description: bookmarkResult.error || 'Could not upload bookmarks.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsRecoveryAction(false);
    }
  };

  const handleForceDownload = async () => {
    setIsRecoveryAction(true);
    try {
      const [bookmarkResult] = await Promise.all([
        downloadBookmarksFromCloud(),
        downloadTrashFromCloud()
      ]);
      
      if (bookmarkResult.success) {
        // Record as sync (download-only still resets daily timer)
        recordSync(0, bookmarkResult.downloaded);
        toast({
          title: 'Download complete',
          description: bookmarkResult.downloaded > 0 
            ? `Downloaded ${bookmarkResult.downloaded} new bookmarks.`
            : 'No new bookmarks to download.',
        });
        if (bookmarkResult.downloaded > 0) {
          window.location.reload();
        }
      } else {
        toast({
          title: 'Download failed',
          description: bookmarkResult.error || 'Could not download bookmarks.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsRecoveryAction(false);
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

  const isBusy = isSyncing || isRecoveryAction;

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

      {/* Primary action: Single Sync button */}
      <Button
        variant="ghost"
        className="w-full justify-start h-12 px-3"
        onClick={handleSync}
        disabled={isBusy}
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
            <span className="text-xs text-muted-foreground">
              Merge local & cloud data safely
            </span>
          </div>
        </div>
      </Button>

      {/* Recovery tools - hidden by default */}
      <Collapsible open={showRecovery} onOpenChange={setShowRecovery}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            <span>Recovery tools</span>
            <ChevronDown className={cn(
              "h-3 w-3 ms-1 transition-transform",
              showRecovery && "rotate-180"
            )} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1 pt-1">
          <p className="text-[10px] text-muted-foreground px-3 mb-1">
            Use only if sync behaves unexpectedly
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start h-9 px-3 text-xs"
            onClick={handleForceUpload}
            disabled={isBusy}
          >
            {isRecoveryAction ? (
              <Loader2 className="h-3 w-3 me-2 animate-spin" />
            ) : null}
            Force upload local → cloud
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start h-9 px-3 text-xs"
            onClick={handleForceDownload}
            disabled={isBusy}
          >
            {isRecoveryAction ? (
              <Loader2 className="h-3 w-3 me-2 animate-spin" />
            ) : null}
            Force download cloud → local
          </Button>
        </CollapsibleContent>
      </Collapsible>

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
