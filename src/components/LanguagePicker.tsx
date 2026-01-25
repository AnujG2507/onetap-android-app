import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supportedLanguages } from '@/i18n';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface LanguagePickerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function LanguagePicker({ open, onOpenChange }: LanguagePickerProps) {
  const { i18n, t } = useTranslation();
  const currentLanguage = i18n.language?.split('-')[0] || 'en';

  const handleLanguageChange = (code: string) => {
    i18n.changeLanguage(code);
    // Update document direction for RTL languages
    const lang = supportedLanguages.find(l => l.code === code);
    document.documentElement.dir = lang?.rtl ? 'rtl' : 'ltr';
    onOpenChange?.(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <button
          className={cn(
            "flex items-center justify-between w-full py-3 px-1",
            "text-left hover:bg-muted/50 rounded-lg transition-colors"
          )}
          aria-label={t('settings.language')}
        >
          <div className="flex items-center gap-3">
            <Globe className="h-5 w-5 text-muted-foreground" />
            <span className="text-base">{t('settings.language')}</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {supportedLanguages.find(l => l.code === currentLanguage)?.nativeName || 'English'}
          </span>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>{t('settings.language')}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-1">
          {supportedLanguages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={cn(
                "flex items-center justify-between w-full py-3 px-4 rounded-xl",
                "transition-colors",
                currentLanguage === lang.code
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted/50"
              )}
              dir={lang.rtl ? 'rtl' : 'ltr'}
              aria-label={lang.name}
            >
              <div className="flex flex-col items-start">
                <span className="font-medium">{lang.nativeName}</span>
                <span className="text-sm text-muted-foreground">{lang.name}</span>
              </div>
              {currentLanguage === lang.code && (
                <Check className="h-5 w-5 text-primary" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
