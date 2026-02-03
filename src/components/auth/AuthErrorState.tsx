import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, Trash2, Mail } from 'lucide-react';

interface AuthError {
  message: string;
  isTokenError: boolean;
}

interface AuthErrorStateProps {
  error: AuthError;
  onRetry: () => void;
  onGoHome: () => void;
}

export function AuthErrorState({ error, onRetry, onGoHome }: AuthErrorStateProps) {
  const { t } = useTranslation();
  
  return (
    <>
      <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-foreground">{t('auth.signInFailed')}</h1>
        <p className="text-muted-foreground text-sm">
          {error.isTokenError 
            ? t('auth.tokenExpired')
            : error.message}
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4 text-left space-y-3">
        <h2 className="font-medium text-sm text-foreground">{t('auth.tryTheseSteps')}</h2>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li className="flex items-start gap-2">
            <span className="font-medium text-foreground">1.</span>
            {t('auth.step1')}
          </li>
          <li className="flex items-start gap-2">
            <span className="font-medium text-foreground">2.</span>
            {t('auth.step2')}
          </li>
          <li className="flex items-start gap-2">
            <span className="font-medium text-foreground">3.</span>
            {t('auth.step3')}
          </li>
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <Button onClick={onRetry} className="w-full gap-2">
          <Trash2 className="h-4 w-4" />
          {t('auth.clearSessionRetry')}
        </Button>
        
        <Button variant="outline" onClick={onGoHome} className="w-full gap-2">
          <RefreshCw className="h-4 w-4" />
          {t('auth.goToHome')}
        </Button>
        
        <a 
          href={`mailto:support@lovable.dev?subject=Auth%20Error&body=Error%20message:%20${encodeURIComponent(error.message)}`}
          className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1"
        >
          <Mail className="h-3 w-3" />
          {t('auth.contactSupport')}
        </a>
      </div>

      {error.message && (
        <details className="text-left">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            {t('auth.technicalDetails')}
          </summary>
          <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
            {error.message}
          </pre>
        </details>
      )}
    </>
  );
}
