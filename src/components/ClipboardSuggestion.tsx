import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Clipboard, X, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerSelectionFeedback } from '@/lib/haptics';

interface ClipboardSuggestionProps {
  url: string;
  onUse: (url: string) => void;
  onDismiss: () => void;
}

const SWIPE_THRESHOLD = 80;

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return url.slice(0, 30);
  }
}

export function ClipboardSuggestion({ url, onUse, onDismiss }: ClipboardSuggestionProps) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const domain = extractDomain(url);

  // Animate in on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      handleDismiss();
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss();
    }, 200);
  };

  const handleUse = () => {
    setIsExiting(true);
    setTimeout(() => {
      onUse(url);
    }, 150);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    setIsSwiping(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const deltaX = e.touches[0].clientX - touchStartRef.current.x;
    const deltaY = e.touches[0].clientY - touchStartRef.current.y;

    // Only start swiping if horizontal movement is dominant
    if (!isSwiping && Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
      setIsSwiping(true);
    }

    if (isSwiping) {
      setSwipeX(deltaX);
    }
  };

  const handleTouchEnd = () => {
    if (Math.abs(swipeX) > SWIPE_THRESHOLD) {
      triggerSelectionFeedback();
      handleDismiss();
    } else {
      setSwipeX(0);
    }
    touchStartRef.current = null;
    setIsSwiping(false);
  };

  return (
    <div
      className={cn(
        "fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] inset-x-4 z-50",
        "transition-all duration-300 ease-out",
        isVisible && !isExiting 
          ? "translate-y-0 opacity-100" 
          : "translate-y-4 opacity-0"
      )}
    >
      <div 
        className={cn(
          "bg-card border border-border rounded-2xl shadow-lg overflow-hidden",
          !isSwiping && "transition-transform duration-200"
        )}
        style={{ 
          transform: `translateX(${swipeX}px)`,
          opacity: Math.max(0.3, 1 - Math.abs(swipeX) / 150)
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Progress bar for auto-dismiss */}
        <div className="h-1 bg-muted overflow-hidden">
          <div 
            className="h-full bg-primary/50 animate-shrink-width"
            style={{ animationDuration: '8s' }}
          />
        </div>
        
        <div className="p-4">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clipboard className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">{t('clipboard.detected')}</span>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 -m-1 rounded-full hover:bg-muted/50 transition-colors"
              aria-label={t('clipboard.dismiss')}
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* URL display */}
          <p className="text-foreground font-medium truncate mb-4">
            {domain}
          </p>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleDismiss}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-xl",
                "bg-muted/50 text-muted-foreground font-medium",
                "active:scale-[0.98] transition-all"
              )}
            >
              {t('clipboard.dismiss')}
            </button>
            <button
              onClick={handleUse}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-xl",
                "bg-primary text-primary-foreground font-medium",
                "flex items-center justify-center gap-2",
                "active:scale-[0.98] transition-all"
              )}
            >
              {t('clipboard.useLink')}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
