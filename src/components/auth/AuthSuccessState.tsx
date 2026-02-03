import { useTranslation } from 'react-i18next';

export function AuthSuccessState() {
  const { t } = useTranslation();
  
  return (
    <>
      <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
        <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-foreground">{t('auth.signedInSuccess')}</h1>
        <p className="text-muted-foreground text-sm">{t('auth.redirecting')}</p>
      </div>
    </>
  );
}
