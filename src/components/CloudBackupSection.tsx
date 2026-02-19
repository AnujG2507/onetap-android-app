import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, RefreshCw, LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { guardedSync } from '@/lib/cloudSync';
import { toast } from '@/hooks/use-toast';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { isValidImageSource } from '@/lib/imageUtils';

export function CloudBackupSection() {
  const { t } = useTranslation();
  const { user, loading: authLoading, isAuthenticated, signInWithGoogle, signOut } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Validate avatar URL before attempting to load
  const validAvatarUrl = useMemo(() => {
    const url = user?.user_metadata?.avatar_url;
    return url && isValidImageSource(url) ? url : null;
  }, [user?.user_metadata?.avatar_url]);

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error: any) {
      const isTokenError = error?.message?.includes('ES256') || 
                           error?.message?.includes('invalid') ||
                           error?.message?.includes('signing method');
      toast({
        title: t('cloudBackup.signInFailed'),
        description: isTokenError 
          ? t('cloudBackup.sessionExpired')
          : t('cloudBackup.couldNotSignIn'),
        variant: 'destructive',
      });
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: t('cloudBackup.signedOut'),
        description: t('cloudBackup.signedOutDesc'),
      });
    } catch (error) {
      toast({
        title: t('cloudBackup.signOutFailed'),
        description: t('cloudBackup.couldNotSignOut'),
        variant: 'destructive',
      });
    }
  };

  /**
   * Safe bidirectional sync via guarded entry point:
   * 1. Validates sync is allowed (guards check timing, concurrency, etc.)
   * 2. Upload local → cloud (upsert by entity_id, never overwrites)
   * 3. Download cloud → local (only adds missing entity_ids)
   * Result: Union of both datasets, safe to run repeatedly
   * 
   * Manual sync always uses 'manual' trigger which bypasses timing guards
   * but still enforces concurrency guards.
   */
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await guardedSync('manual');
      
      if (result.blocked) {
        toast({
          title: t('cloudBackup.syncBlocked'),
          description: result.blockReason || t('profile.tryAgainLater'),
          variant: 'destructive',
        });
        return;
      }
      
      if (result.success) {
        const hasChanges = result.uploaded > 0 || result.downloaded > 0;
        toast({
          title: t('cloudBackup.syncComplete'),
          description: hasChanges 
            ? t('cloudBackup.everythingSynced')
            : t('cloudBackup.alreadyInSync'),
        });
        if (result.downloaded > 0) {
          window.location.reload();
        }
      } else {
        toast({
          title: t('cloudBackup.syncFailed'),
          description: result.error || t('cloudBackup.couldNotSync'),
          variant: 'destructive',
        });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  if (authLoading) {
    return (
      <div className="px-3 py-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">{t('cloudBackup.loading')}</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <Separator className="my-3" />
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
              <span className="font-medium block">{t('cloudBackup.signInWithGoogle')}</span>
              <span className="text-xs text-muted-foreground">{t('cloudBackup.syncDescription')}</span>
            </div>
          </div>
        </Button>
      </>
    );
  }

  return (
    <>
      <Separator className="my-3" />
      
      {/* Compact user row with sync action */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
            {validAvatarUrl ? (
              <ImageWithFallback
                sources={[validAvatarUrl]}
                fallback={<Cloud className="h-3.5 w-3.5 text-primary" />}
                alt="Profile"
                className="h-full w-full object-cover"
                containerClassName="h-full w-full flex items-center justify-center"
                showSkeleton={false}
              />
            ) : (
              <Cloud className="h-3.5 w-3.5 text-primary" />
            )}
          </div>
          <p className="text-sm font-medium truncate flex-1 min-w-0">
            {user?.user_metadata?.full_name || user?.email}
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={handleSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <RefreshCw className="h-4 w-4 text-primary" />
            )}
          </Button>
        </div>
      </div>

      {/* Sign out */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start h-9 px-3 text-muted-foreground hover:text-destructive"
        onClick={handleSignOut}
      >
        <LogOut className="h-3.5 w-3.5 me-2" />
        <span className="text-xs">{t('cloudBackup.signOut')}</span>
      </Button>
    </>
  );
}
