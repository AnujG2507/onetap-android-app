import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { User, Session } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { 
  getOAuthRedirectUrl, 
  markOAuthStarted,
  clearPendingOAuth,
} from '@/lib/oauthCompletion';
import { clearSyncStatus } from '@/lib/syncStatusManager';
import { clearPendingDeletions } from '@/lib/deletionTracker';

const AUTH_STORAGE_KEY = 'sb-xfnugumyjhnctmqgiyqm-auth-token';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] State change:', event);
        
        if (event === 'TOKEN_REFRESHED' && !session) {
          // Token refresh failed, clear and re-authenticate
          console.warn('[Auth] Token refresh failed, clearing session');
          await supabase.auth.signOut();
        }
        
        // Clear pending OAuth on successful sign in
        if (event === 'SIGNED_IN' && session) {
          clearPendingOAuth();
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Then get initial session with error handling
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          // If token is invalid (ES256 or other signing errors), clear it
          console.warn('[Auth] Invalid session, clearing...', error.message);
          await supabase.auth.signOut();
          localStorage.removeItem(AUTH_STORAGE_KEY);
          setSession(null);
          setUser(null);
        } else {
          setSession(session);
          setUser(session?.user ?? null);
        }
      } catch (err: any) {
        console.error('[Auth] Session initialization failed:', err);
        // Clear potentially corrupted auth state
        localStorage.removeItem(AUTH_STORAGE_KEY);
        setSession(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      // Clear any stale auth state before attempting sign-in
      localStorage.removeItem(AUTH_STORAGE_KEY);
      clearPendingOAuth();
      
      const { data: existingSession } = await supabase.auth.getSession();
      if (existingSession?.session) {
        await supabase.auth.signOut();
      }

      const isNative = Capacitor.isNativePlatform();
      const redirectUrl = getOAuthRedirectUrl();
      
      // Mark OAuth as started for cold-start recovery
      markOAuthStarted();

      if (isNative) {
        // Native flow: use skipBrowserRedirect and open browser manually
        console.log('[Auth] Starting native OAuth flow with redirect:', redirectUrl);
        
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true,
          },
        });
        
        if (error) throw error;
        
        if (data.url) {
          console.log('[Auth] Opening OAuth URL in browser');
          await Browser.open({ url: data.url });
        }
      } else {
        // Web flow: standard redirect
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
          },
        });
        
        if (error) throw error;
      }
    } catch (error) {
      console.error('[Auth] Google sign-in error:', error);
      clearPendingOAuth();
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      localStorage.removeItem(AUTH_STORAGE_KEY);
      clearPendingOAuth();
      // Clear sync-related state to prevent cross-user contamination
      clearSyncStatus();
      clearPendingDeletions();
      localStorage.removeItem('processed_oauth_urls');
      if (error) {
        console.error('[Auth] Sign-out error:', error);
        throw error;
      }
    } catch (error) {
      // Even if signOut fails, clear local state
      localStorage.removeItem(AUTH_STORAGE_KEY);
      clearPendingOAuth();
      clearSyncStatus();
      clearPendingDeletions();
      localStorage.removeItem('processed_oauth_urls');
      throw error;
    }
  }, []);

  const clearAuthState = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    clearPendingOAuth();
    setSession(null);
    setUser(null);
  }, []);

  return {
    user,
    session,
    loading,
    isAuthenticated: !!user,
    signInWithGoogle,
    signOut,
    clearAuthState,
  };
}
