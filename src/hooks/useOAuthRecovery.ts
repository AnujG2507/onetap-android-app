import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabaseClient';
import { 
  hasInProgressOAuth, 
  attemptOAuthRecovery,
  clearPendingOAuth,
  getOAuthRedirectUrl,
} from '@/lib/oauthCompletion';

type RecoveryState = 'idle' | 'checking' | 'recovering' | 'failed' | 'success';

interface OAuthRecoveryResult {
  state: RecoveryState;
  retry: () => Promise<void>;
  dismiss: () => void;
}

/**
 * Hook for cold-start OAuth recovery with calm UI states
 * 
 * Call this in your app's root component to handle recovery
 * when the app was killed during OAuth flow.
 */
export function useOAuthRecovery(): OAuthRecoveryResult {
  const [state, setState] = useState<RecoveryState>('idle');

  useEffect(() => {
    // Only relevant for native platforms
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const checkAndRecover = async () => {
      // Check if there's a pending OAuth that might need recovery
      if (!hasInProgressOAuth()) {
        return;
      }

      setState('checking');

      // First, check if we already have a session
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Already logged in, no recovery needed
        clearPendingOAuth();
        setState('idle');
        return;
      }

      // Attempt recovery
      setState('recovering');
      const result = await attemptOAuthRecovery();

      if (!result) {
        // Nothing to recover
        setState('idle');
        return;
      }

      if (result.success) {
        setState('success');
        // Reset to idle after brief success indication
        setTimeout(() => setState('idle'), 1500);
      } else if (!result.alreadyProcessed) {
        // Recovery failed and wasn't just a duplicate
        setState('failed');
      } else {
        setState('idle');
      }
    };

    checkAndRecover();
  }, []);

  const retry = async () => {
    setState('recovering');
    
    try {
      // Clear old state and start fresh OAuth
      clearPendingOAuth();
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getOAuthRedirectUrl(),
          skipBrowserRedirect: true,
        },
      });
      
      if (error) throw error;
      
      if (data.url) {
        // Import Browser dynamically to avoid issues on web
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: data.url });
      }
      
      setState('idle');
    } catch (err) {
      console.error('[OAuthRecovery] Retry failed:', err);
      setState('failed');
    }
  };

  const dismiss = () => {
    clearPendingOAuth();
    setState('idle');
  };

  return { state, retry, dismiss };
}
