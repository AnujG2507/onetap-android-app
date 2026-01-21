import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, RefreshCw, Trash2, Mail } from 'lucide-react';

const AUTH_STORAGE_KEY = 'sb-qyokhlaexuywzuyasqxo-auth-token';

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
        // Check URL for error parameters first
        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        
        const errorParam = params.get('error') || hashParams.get('error');
        const errorDescription = params.get('error_description') || hashParams.get('error_description');
        
        if (errorParam) {
          const isTokenError = errorDescription?.includes('ES256') || 
                               errorDescription?.includes('invalid') ||
                               errorDescription?.includes('signing');
          setError({
            message: errorDescription || errorParam,
            isTokenError: isTokenError || false,
          });
          setAuthState('error');
          return;
        }

        // Attempt to get session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          const isTokenError = sessionError.message?.includes('ES256') || 
                               sessionError.message?.includes('invalid') ||
                               sessionError.message?.includes('signing');
          setError({
            message: sessionError.message,
            isTokenError,
          });
          setAuthState('error');
          return;
        }

        if (session) {
          setAuthState('success');
          // Redirect to home after brief success state
          setTimeout(() => navigate('/', { replace: true }), 500);
        } else {
          // No session and no error - might still be processing
          // Wait a bit and check again
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const { data: { session: retrySession }, error: retryError } = await supabase.auth.getSession();
          
          if (retryError || !retrySession) {
            setError({
              message: retryError?.message || 'Authentication failed. Please try again.',
              isTokenError: false,
            });
            setAuthState('error');
          } else {
            setAuthState('success');
            setTimeout(() => navigate('/', { replace: true }), 500);
          }
        }
      } catch (err: any) {
        console.error('[AuthCallback] Error:', err);
        const isTokenError = err?.message?.includes('ES256') || 
                             err?.message?.includes('invalid') ||
                             err?.message?.includes('signing');
        setError({
          message: err?.message || 'An unexpected error occurred.',
          isTokenError,
        });
        setAuthState('error');
      }
    };

    handleAuthCallback();
  }, [navigate]);

  const handleClearAndRetry = async () => {
    setAuthState('loading');
    setError(null);
    
    try {
      // Clear all auth state
      localStorage.removeItem(AUTH_STORAGE_KEY);
      await supabase.auth.signOut();
      
      // Retry sign in
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth-callback`,
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
  };

  const handleGoHome = () => {
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md text-center space-y-6">
        {authState === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <div className="space-y-2">
              <h1 className="text-xl font-semibold text-foreground">Signing you in...</h1>
              <p className="text-muted-foreground text-sm">Please wait while we complete authentication.</p>
            </div>
          </>
        )}

        {authState === 'success' && (
          <>
            <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
              <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-semibold text-foreground">Signed in successfully!</h1>
              <p className="text-muted-foreground text-sm">Redirecting you now...</p>
            </div>
          </>
        )}

        {authState === 'error' && error && (
          <>
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-xl font-semibold text-foreground">Sign in failed</h1>
              <p className="text-muted-foreground text-sm">
                {error.isTokenError 
                  ? 'Your session token is invalid or expired.'
                  : error.message}
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 text-left space-y-3">
              <h2 className="font-medium text-sm text-foreground">Try these steps:</h2>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground">1.</span>
                  Clear your session and try signing in again
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground">2.</span>
                  Try using a different browser or incognito mode
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground">3.</span>
                  Clear your browser cookies for this site
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <Button onClick={handleClearAndRetry} className="w-full gap-2">
                <Trash2 className="h-4 w-4" />
                Clear Session & Retry
              </Button>
              
              <Button variant="outline" onClick={handleGoHome} className="w-full gap-2">
                <RefreshCw className="h-4 w-4" />
                Go to Home
              </Button>
              
              <a 
                href="mailto:support@lovable.dev?subject=Auth%20Error&body=Error%20message:%20${encodeURIComponent(error.message)}"
                className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1"
              >
                <Mail className="h-3 w-3" />
                Contact Support
              </a>
            </div>

            {error.message && (
              <details className="text-left">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Technical details
                </summary>
                <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
                  {error.message}
                </pre>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}
