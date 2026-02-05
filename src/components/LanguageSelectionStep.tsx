// LANGUAGE SUPPORT TEMPORARILY DISABLED
// This entire component is intentionally unused for the English-only launch.
// Do not delete. Will be re-enabled in a future update.
// The component is preserved in full below but is not rendered anywhere.

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supportedLanguages } from '@/i18n';

interface LanguageSelectionStepProps {
  onContinue: () => void;
}

export function LanguageSelectionStep({ onContinue }: LanguageSelectionStepProps) {
  const { t, i18n } = useTranslation();
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language?.split('-')[0] || 'en');
  const [isChanging, setIsChanging] = useState(false);

  const handleLanguageSelect = useCallback(async (langCode: string) => {
    if (langCode === selectedLanguage) return;
    
    setIsChanging(true);
    setSelectedLanguage(langCode);
    
    try {
      await i18n.changeLanguage(langCode);
      
      // Handle RTL
      const lang = supportedLanguages.find(l => l.code === langCode);
      if (lang?.rtl) {
        document.documentElement.setAttribute('dir', 'rtl');
      } else {
        document.documentElement.setAttribute('dir', 'ltr');
      }
    } catch (error) {
      console.error('Failed to change language:', error);
    } finally {
      setIsChanging(false);
    }
  }, [selectedLanguage, i18n]);

  const handleContinue = useCallback(() => {
    onContinue();
  }, [onContinue]);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header with icon */}
      <div className="flex flex-col items-center pt-header-safe pb-6 px-8">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5">
          <Globe className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground text-center">
          {t('onboarding.languageSelection.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-2 text-center">
          {t('onboarding.languageSelection.subtitle')}
        </p>
      </div>

      {/* Language grid */}
      <ScrollArea className="flex-1 px-4">
        <div className="grid grid-cols-2 gap-3 pb-4">
          {supportedLanguages.map((lang) => {
            const isSelected = selectedLanguage === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => handleLanguageSelect(lang.code)}
                disabled={isChanging}
                className={cn(
                  'relative flex flex-col items-start p-4 rounded-xl border-2 transition-all duration-200',
                  'hover:border-primary/50 hover:bg-muted/50',
                  'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  isSelected 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border bg-card'
                )}
                aria-label={`${lang.name} (${lang.nativeName})`}
                aria-pressed={isSelected}
              >
                {/* Check mark for selected */}
                {isSelected && (
                  <div className="absolute top-2 end-2">
                    <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  </div>
                )}
                
                {/* Native name (prominent) */}
                <span className={cn(
                  'text-base font-semibold',
                  isSelected ? 'text-primary' : 'text-foreground'
                )}>
                  {lang.nativeName}
                </span>
                
                {/* English name (secondary) */}
                <span className="text-xs text-muted-foreground mt-0.5">
                  {lang.name}
                </span>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Continue button */}
      <div className="p-8 pb-12">
        <Button
          onClick={handleContinue}
          size="lg"
          className="w-full h-14 text-base font-semibold rounded-2xl"
          disabled={isChanging}
          aria-label={t('onboarding.continue')}
        >
          {isChanging ? t('common.loading') : t('onboarding.continue')}
          <ChevronRight className="h-5 w-5 ms-1" />
        </Button>
      </div>
    </div>
  );
}
