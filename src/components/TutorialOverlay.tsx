import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TutorialStep } from '@/hooks/useTutorial';

interface TutorialOverlayProps {
  steps: TutorialStep[];
  currentStep: number;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function TutorialOverlay({
  steps,
  currentStep,
  onNext,
  onPrevious,
  onSkip,
}: TutorialOverlayProps) {
  const { t } = useTranslation();
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  // Find and measure the target element
  const updateTargetRect = useCallback(() => {
    if (!step?.targetId) return;

    const element = document.getElementById(step.targetId);
    if (element) {
      const rect = element.getBoundingClientRect();
      const padding = 8; // Padding around the spotlight
      setTargetRect({
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      });
    } else {
      // Element not found, skip to next or complete
      console.warn(`[Tutorial] Target element not found: ${step.targetId}`);
      setTargetRect(null);
    }
  }, [step?.targetId]);

  // Update target rect on mount and when step changes
  useEffect(() => {
    updateTargetRect();
    
    // Also update on resize
    window.addEventListener('resize', updateTargetRect);
    return () => window.removeEventListener('resize', updateTargetRect);
  }, [updateTargetRect, currentStep]);

  // Calculate tooltip position based on target rect and preferred position
  useEffect(() => {
    if (!targetRect || !tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const tooltipRect = tooltip.getBoundingClientRect();
    const padding = 16;
    const arrowOffset = 12;

    let top = 0;
    let left = 0;

    const position = step?.position || 'bottom';

    switch (position) {
      case 'top':
        top = targetRect.top - tooltipRect.height - arrowOffset;
        left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        break;
      case 'bottom':
        top = targetRect.top + targetRect.height + arrowOffset;
        left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        break;
      case 'left':
        top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        left = targetRect.left - tooltipRect.width - arrowOffset;
        break;
      case 'right':
        top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        left = targetRect.left + targetRect.width + arrowOffset;
        break;
    }

    // Keep tooltip within viewport bounds
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (left < padding) left = padding;
    if (left + tooltipRect.width > viewportWidth - padding) {
      left = viewportWidth - tooltipRect.width - padding;
    }
    if (top < padding) top = padding;
    if (top + tooltipRect.height > viewportHeight - padding) {
      top = viewportHeight - tooltipRect.height - padding;
    }

    setTooltipPosition({ top, left });
  }, [targetRect, step?.position, currentStep]);

  // Skip if no target found
  if (!step) return null;

  return (
    <div 
      ref={overlayRef}
      className="fixed inset-0 z-[100]"
      aria-modal="true"
      role="dialog"
      aria-describedby="tutorial-description"
    >
      {/* Dark overlay with spotlight cutout */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
      >
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.75)"
          mask="url(#spotlight-mask)"
        />
      </svg>

      {/* Spotlight ring animation */}
      {targetRect && (
        <div
          className="absolute rounded-xl pointer-events-none animate-spotlight-pulse"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            boxShadow: '0 0 0 4px hsl(var(--primary) / 0.4)',
          }}
        />
      )}

      {/* Click handler - tap outside tooltip to dismiss, tap spotlight to advance */}
      <div 
        className="absolute inset-0"
        onClick={(e) => {
          // Allow clicks on the target element to advance
          if (targetRect) {
            const x = e.clientX;
            const y = e.clientY;
            if (
              x >= targetRect.left &&
              x <= targetRect.left + targetRect.width &&
              y >= targetRect.top &&
              y <= targetRect.top + targetRect.height
            ) {
              // Click is within spotlight, advance to next step
              onNext();
              return;
            }
          }
          // Tap anywhere else dismisses the tutorial
          onSkip();
        }}
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute z-10 w-[280px] max-w-[90vw] animate-tooltip-enter"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
        }}
      >
        <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
          <div className="p-4">
            <h3 className="text-base font-semibold text-foreground mb-1">
              {t(step.titleKey)}
            </h3>
            <p id="tutorial-description" className="text-sm text-muted-foreground">
              {t(step.descriptionKey)}
            </p>
          </div>

          {/* Progress and navigation */}
          <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-t border-border">
            {/* Progress dots */}
            <div className="flex items-center gap-1.5">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={cn(
                    "w-2 h-2 rounded-full transition-colors",
                    index === currentStep
                      ? "bg-primary"
                      : index < currentStep
                      ? "bg-primary/50"
                      : "bg-muted-foreground/30"
                  )}
                />
              ))}
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center gap-2">
              {!isFirstStep && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onPrevious}
                  className="h-8 px-2"
                >
                  <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                </Button>
              )}
              <Button
                size="sm"
                onClick={onNext}
                className="h-8 px-4 gap-1"
              >
                <span>{isLastStep ? t('tutorial.done') : t('tutorial.next')}</span>
                {!isLastStep && <ChevronRight className="h-4 w-4 rtl:rotate-180" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
