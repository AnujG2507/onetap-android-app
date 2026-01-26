import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TutorialStep } from '@/hooks/useTutorial';

interface CoachMarkProps {
  steps: TutorialStep[];
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onDismiss: () => void;
}

interface Position {
  top: number;
  left: number;
  arrowPosition: 'top' | 'bottom' | 'left' | 'right';
}

export function CoachMark({
  steps,
  currentStep,
  totalSteps,
  onNext,
  onDismiss,
}: CoachMarkProps) {
  const { t } = useTranslation();
  const [position, setPosition] = useState<Position | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const coachMarkRef = useRef<HTMLDivElement>(null);

  const step = steps[currentStep];
  const isLastStep = currentStep === totalSteps - 1;

  // Calculate position based on target element
  const updatePosition = useCallback(() => {
    if (!step?.targetId || !coachMarkRef.current) return;

    const element = document.getElementById(step.targetId);
    if (!element) {
      // Element not found, skip to next or dismiss
      console.warn(`[CoachMark] Target not found: ${step.targetId}`);
      onNext();
      return;
    }

    const rect = element.getBoundingClientRect();
    const coachRect = coachMarkRef.current.getBoundingClientRect();
    const padding = 12;
    const arrowOffset = 8;

    let top = 0;
    let left = 0;
    let arrowPosition = step.position;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate position based on preferred direction
    switch (step.position) {
      case 'top':
        top = rect.top - coachRect.height - arrowOffset;
        left = rect.left + rect.width / 2 - coachRect.width / 2;
        break;
      case 'bottom':
        top = rect.bottom + arrowOffset;
        left = rect.left + rect.width / 2 - coachRect.width / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - coachRect.height / 2;
        left = rect.left - coachRect.width - arrowOffset;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - coachRect.height / 2;
        left = rect.right + arrowOffset;
        break;
    }

    // Keep within viewport
    if (left < padding) left = padding;
    if (left + coachRect.width > viewportWidth - padding) {
      left = viewportWidth - coachRect.width - padding;
    }
    if (top < padding) {
      top = rect.bottom + arrowOffset;
      arrowPosition = 'top';
    }
    if (top + coachRect.height > viewportHeight - padding) {
      top = rect.top - coachRect.height - arrowOffset;
      arrowPosition = 'bottom';
    }

    setPosition({ top, left, arrowPosition });
    setIsVisible(true);
  }, [step, onNext]);

  // Update position on mount and resize
  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(updatePosition, 50);
    
    window.addEventListener('resize', updatePosition);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updatePosition);
    };
  }, [updatePosition, currentStep]);

  // Reset visibility on step change
  useEffect(() => {
    setIsVisible(false);
  }, [currentStep]);

  if (!step || !position) {
    return (
      // Invisible placeholder for measurement
      <div
        ref={coachMarkRef}
        className="fixed opacity-0 pointer-events-none z-50 max-w-[260px]"
        style={{ top: -9999, left: -9999 }}
      >
        <div className="p-3">
          <p className="text-sm font-medium">{step ? t(step.titleKey) : ''}</p>
          <p className="text-xs">{step ? t(step.descriptionKey) : ''}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={coachMarkRef}
      className={cn(
        "fixed z-50 max-w-[260px] pointer-events-auto",
        "transition-all duration-200 ease-out",
        isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
      )}
      style={{
        top: position.top,
        left: position.left,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Arrow */}
      <div
        className={cn(
          "absolute w-3 h-3 bg-card border rotate-45",
          position.arrowPosition === 'top' && "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 border-t border-l",
          position.arrowPosition === 'bottom' && "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 border-b border-r",
          position.arrowPosition === 'left' && "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 border-l border-b",
          position.arrowPosition === 'right' && "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 border-r border-t"
        )}
      />

      {/* Content card */}
      <div className="relative bg-card border border-border rounded-xl shadow-lg overflow-hidden">
        <div className="p-3">
          <p className="text-sm font-medium text-foreground mb-0.5">
            {t(step.titleKey)}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t(step.descriptionKey)}
          </p>
        </div>

        {/* Footer with progress and action */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-t border-border">
          {/* Progress indicator */}
          <div className="flex items-center gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-colors",
                  i === currentStep
                    ? "bg-primary"
                    : i < currentStep
                    ? "bg-primary/50"
                    : "bg-muted-foreground/30"
                )}
              />
            ))}
          </div>

          {/* Action button */}
          <button
            onClick={onNext}
            className="flex items-center gap-0.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <span>{isLastStep ? t('tutorial.done') : t('tutorial.next')}</span>
            {!isLastStep && <ChevronRight className="h-3 w-3 rtl:rotate-180" />}
          </button>
        </div>
      </div>

      {/* Tap anywhere hint */}
      <p className="text-[10px] text-muted-foreground/60 text-center mt-1.5">
        {t('tutorial.tapToDismiss')}
      </p>
    </div>
  );
}
