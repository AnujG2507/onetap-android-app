import { useTranslation } from 'react-i18next';
import { useEffect, useState, useCallback } from 'react';
import { Check, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

const AUTO_CLOSE_SECONDS = 10;

interface SuccessScreenProps {
  shortcutName: string;
  onDone: () => void;
}

export function SuccessScreen({ shortcutName, onDone }: SuccessScreenProps) {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState(AUTO_CLOSE_SECONDS);
  
  const handleDone = useCallback(() => {
    onDone();
  }, [onDone]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleDone();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [handleDone]);
  
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <Check className="h-10 w-10 text-primary" />
      </div>
      
      <h1 className="text-2xl font-semibold text-foreground mb-2">
        {t('success.title')}
      </h1>
      
      <p className="text-muted-foreground mb-8">
        {t('success.ready', { name: shortcutName })}
      </p>
      
      <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3 mb-8">
        <Home className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {t('success.hint')}
        </p>
      </div>
      
      <Button onClick={handleDone} variant="outline" className="w-full max-w-xs h-12">
        {t('success.addAnother')}
      </Button>
      
      <p className="text-xs text-muted-foreground mt-4">
        {t('success.autoClose', { seconds: countdown })}
      </p>
    </div>
  );
}
