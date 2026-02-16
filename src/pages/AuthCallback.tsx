import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { 
  completeOAuth, 
  getOAuthRedirectUrl,
  clearPendingOAuth,
} from '@/lib/oauthCompletion';
import { AuthLoadingState } from '@/components/auth/AuthLoadingState';
import { AuthSuccessState } from '@/components/auth/AuthSuccessState';
import { AuthErrorState } from '@/components/auth/AuthErrorState';

const AUTH_STORAGE_KEY = 'sb-xfnugumyjhnctmqgiyqm-auth-token';

type AuthState = 'loading' | 'success' | 'error';

interface AuthError {
  message: string;
  isTokenError: boolean;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [error, setError] = useState<AuthError | null>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // First check if we already have a session (cold-start recovery might have worked)
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession) {
          console.log('[AuthCallback] Already have session, redirecting');
          setAuthState('success');
          setTimeout(() => navigate('/', { replace: true }), 500);
          return;
        }

        // Use the canonical OAuth completion with full URL
        const fullUrl = window.location.href;
        const result = await completeOAuth(fullUrl);

        if (result.alreadyProcessed) {
          // Already handled (likely by useDeepLink on native)
          // Check if we have a session now
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            setAuthState('success');
            setTimeout(() => navigate('/', { replace: true }), 500);
          } else {
            // No session and URL was already processed - show calm retry
            setError({
              message: 'Sign in was interrupted. Please try again.',
              isTokenError: false,
            });
            setAuthState('error');
          }
          return;
        }

        if (result.success && result.session) {
          setAuthState('success');
          setTimeout(() => navigate('/', { replace: true }), 500);
        } else {
          const isTokenError = result.error?.includes('ES256') || 
                               result.error?.includes('invalid') ||
                               result.error?.includes('signing');
          setError({
            message: result.error || 'Authentication failed. Please try again.',
            isTokenError: isTokenError || false,
          });
          setAuthState('error');
        }
      } catch (err: any) {
        console.error('[AuthCallback] Unexpected error:', err);
        setError({
          message: 'An unexpected error occurred. Please try again.',
          isTokenError: false,
        });
        setAuthState('error');
      }
    };

    handleAuthCallback();
  }, [navigate]);

  const handleRetry = useCallback(async () => {
    setAuthState('loading');
    setError(null);
    
    try {
      // Clear all auth state
      localStorage.removeItem(AUTH_STORAGE_KEY);
      clearPendingOAuth();
      await supabase.auth.signOut();
      
      // Retry sign in with proper redirect URL
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getOAuthRedirectUrl(),
        },
      });
      
      if (error) throw error;
    } catch (err: any) {
      setError({
        message: err?.message || 'Failed to retry sign in.',
        isTokenError: false,
      });
      setAuthState('error');
    }
  }, []);

  const handleGoHome = useCallback(() => {
    clearPendingOAuth();
    navigate('/', { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md text-center space-y-6">
        {authState === 'loading' && <AuthLoadingState />}
        {authState === 'success' && <AuthSuccessState />}
        {authState === 'error' && error && (
          <AuthErrorState
            error={error}
            onRetry={handleRetry}
            onGoHome={handleGoHome}
          />
        )}
      </div>
    </div>
  );
}
