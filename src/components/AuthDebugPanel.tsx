import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getLastDeepLink } from '@/hooks/useDeepLink';
import { Button } from '@/components/ui/button';
import { Bug, ChevronDown, ChevronUp, Trash2, RefreshCw, Copy, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Capacitor } from '@capacitor/core';

const AUTH_STORAGE_KEY = 'sb-qyokhlaexuywzuyasqxo-auth-token';

interface AuthEvent {
  timestamp: string;
  event: string;
  userId?: string;
}

export function AuthDebugPanel() {
  const { user, session, loading, isAuthenticated, clearAuthState } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [authEvents, setAuthEvents] = useState<AuthEvent[]>([]);
  const [copied, setCopied] = useState(false);

  // Show in development OR when running in Lovable preview (contains 'lovable.app')
  const isLovablePreview = typeof window !== 'undefined' && window.location.hostname.includes('lovable.app');
  if (import.meta.env.PROD && !isLovablePreview) {
    return null;
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthEvents(prev => [
        {
          timestamp: new Date().toISOString(),
          event,
          userId: session?.user?.id?.slice(0, 8),
        },
        ...prev.slice(0, 9), // Keep last 10 events
      ]);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleResetAuth = async () => {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      await supabase.auth.signOut();
      clearAuthState();
      setAuthEvents([]);
      toast({
        title: 'Auth reset',
        description: 'All auth storage cleared successfully.',
      });
    } catch (err) {
      console.error('[AuthDebug] Reset failed:', err);
      // Force clear even if signOut fails
      localStorage.removeItem(AUTH_STORAGE_KEY);
      clearAuthState();
    }
  };

  const handleRefreshSession = async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      toast({
        title: 'Session refreshed',
        description: data.session ? 'Token refreshed successfully.' : 'No active session.',
      });
    } catch (err: any) {
      toast({
        title: 'Refresh failed',
        description: err?.message || 'Could not refresh session.',
        variant: 'destructive',
      });
    }
  };

  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const lastDeepLink = getLastDeepLink();

  const copyDebugInfo = () => {
    const info = {
      platform,
      isNative,
      authenticated: isAuthenticated,
      loading,
      userId: user?.id,
      email: user?.email,
      sessionExpiry: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      provider: user?.app_metadata?.provider,
      lastDeepLink: lastDeepLink.url ? {
        url: lastDeepLink.url.slice(0, 50) + (lastDeepLink.url.length > 50 ? '...' : ''),
        time: lastDeepLink.time?.toISOString(),
      } : null,
      events: authEvents.slice(0, 5),
    };
    navigator.clipboard.writeText(JSON.stringify(info, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStorageInfo = () => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!stored) return { exists: false };
      const parsed = JSON.parse(stored);
      return {
        exists: true,
        expiresAt: parsed.expires_at ? new Date(parsed.expires_at * 1000).toLocaleString() : 'unknown',
      };
    } catch {
      return { exists: true, corrupted: true };
    }
  };

  const storageInfo = getStorageInfo();

  return (
    <div className="fixed bottom-20 right-4 z-50">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="bg-amber-500/10 border-amber-500/30 text-amber-600 hover:bg-amber-500/20 gap-1"
      >
        <Bug className="h-3 w-3" />
        Auth
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
      </Button>

      {isOpen && (
        <div className="absolute bottom-10 right-0 w-80 bg-popover border border-border rounded-lg shadow-lg p-3 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Auth Debug</h3>
            <Button variant="ghost" size="sm" onClick={copyDebugInfo} className="h-6 px-2 gap-1">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          {/* Platform Info */}
          <div className="bg-blue-500/10 rounded p-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Platform:</span>
              <span className="text-blue-500 font-medium">{platform} {isNative ? '(native)' : '(web)'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">OAuth redirect:</span>
              <span className="font-mono text-foreground text-[10px]">
                {isNative ? 'onetap://auth-callback' : 'web origin'}
              </span>
            </div>
            {lastDeepLink.url && (
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Last deep link:</span>
                <span className="font-mono text-green-500 text-[10px] break-all">
                  {lastDeepLink.url.slice(0, 40)}...
                </span>
                <span className="text-muted-foreground text-[10px]">
                  at {lastDeepLink.time?.toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>

          {/* State Overview */}
          <div className="bg-muted/50 rounded p-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              <span className={isAuthenticated ? 'text-green-500' : 'text-red-500'}>
                {loading ? 'Loading...' : isAuthenticated ? 'Authenticated' : 'Not authenticated'}
              </span>
            </div>
            {user && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">User ID:</span>
                  <span className="font-mono text-foreground">{user.id.slice(0, 12)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="text-foreground truncate max-w-[150px]">{user.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Provider:</span>
                  <span className="text-foreground">{user.app_metadata?.provider || 'unknown'}</span>
                </div>
              </>
            )}
            {session && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expires:</span>
                <span className="text-foreground">
                  {new Date(session.expires_at! * 1000).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>

          {/* Storage Info */}
          <div className="bg-muted/50 rounded p-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Storage:</span>
              <span className={storageInfo.exists ? (storageInfo.corrupted ? 'text-red-500' : 'text-green-500') : 'text-muted-foreground'}>
                {storageInfo.exists ? (storageInfo.corrupted ? 'Corrupted' : 'Present') : 'Empty'}
              </span>
            </div>
            {storageInfo.exists && !storageInfo.corrupted && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Token Expires:</span>
                <span className="text-foreground text-[10px]">{storageInfo.expiresAt}</span>
              </div>
            )}
          </div>

          {/* Auth Events */}
          {authEvents.length > 0 && (
            <div className="space-y-1">
              <span className="text-muted-foreground font-medium">Recent Events:</span>
              <div className="bg-muted/50 rounded p-2 max-h-24 overflow-y-auto space-y-1">
                {authEvents.map((event, i) => (
                  <div key={i} className="flex justify-between text-[10px]">
                    <span className="font-mono text-foreground">{event.event}</span>
                    <span className="text-muted-foreground">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshSession}
              className="flex-1 h-7 text-xs gap-1"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleResetAuth}
              className="flex-1 h-7 text-xs gap-1"
            >
              <Trash2 className="h-3 w-3" />
              Reset Auth
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
