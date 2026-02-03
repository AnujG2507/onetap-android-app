import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, X } from 'lucide-react';

interface OAuthRecoveryBannerProps {
  state: 'checking' | 'recovering' | 'failed';
  onRetry: () => void;
  onDismiss: () => void;
}

/**
 * Calm, non-intrusive banner for OAuth recovery states
 * Shows when the app was killed during OAuth and recovery is needed
 */
export function OAuthRecoveryBanner({ state, onRetry, onDismiss }: OAuthRecoveryBannerProps) {
  const { t } = useTranslation();

  if (state === 'checking' || state === 'recovering') {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-muted/95 backdrop-blur-sm border-b border-border p-3">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            {state === 'checking' ? t('auth.checkingStatus') : t('auth.completingSignIn')}
          </span>
        </div>
      </div>
    );
  }

  if (state === 'failed') {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-muted/95 backdrop-blur-sm border-b border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground flex-1">
            {t('auth.signInInterrupted')}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('common.retry')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDismiss}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
