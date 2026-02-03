import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function AuthLoadingState() {
  const { t } = useTranslation();
  
  return (
    <>
      <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-foreground">{t('auth.signingIn')}</h1>
        <p className="text-muted-foreground text-sm">{t('auth.pleaseWait')}</p>
      </div>
    </>
  );
}
