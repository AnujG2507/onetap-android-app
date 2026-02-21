import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ReviewPromptBannerProps {
  visible: boolean;
  onDismiss: () => void;
  onRate: () => void;
}

export function ReviewPromptBanner({ visible, onDismiss, onRate }: ReviewPromptBannerProps) {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-[calc(3.5rem+var(--android-safe-bottom,0px)+0.5rem)] inset-x-0 mx-3 rounded-xl border bg-card text-card-foreground shadow-lg p-3 z-30"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{t('reviewPrompt.title')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('reviewPrompt.message')}
              </p>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 mt-1.5 text-xs font-medium gap-1"
                onClick={onRate}
              >
                <Star className="h-3 w-3" />
                {t('reviewPrompt.action')}
              </Button>
            </div>
            <button
              onClick={onDismiss}
              className="shrink-0 p-1.5 -m-1 rounded-full hover:bg-muted transition-colors"
              aria-label={t('common.close', 'Close')}
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
