import { useEffect, useCallback, useState } from 'react';
import { CoachMark } from './CoachMark';
import type { TutorialStep } from '@/hooks/useTutorial';

interface TutorialCoachMarksProps {
  steps: TutorialStep[];
  currentStep: number;
  onNext: () => void;
  onDismiss: () => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Non-modal coach marks that float above the UI with a subtle spotlight
 * on the target element. Tapping the backdrop dismisses the tutorial.
 */
export function TutorialCoachMarks({
  steps,
  currentStep,
  onNext,
  onDismiss,
}: TutorialCoachMarksProps) {
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);

  const step = steps[currentStep];

  // Measure target element for spotlight
  const updateSpotlight = useCallback(() => {
    if (!step?.targetId) {
      setSpotlight(null);
      return;
    }
    const el = document.getElementById(step.targetId);
    if (!el) {
      setSpotlight(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const pad = 6;
    setSpotlight({
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    });
  }, [step]);

  useEffect(() => {
    const timer = setTimeout(updateSpotlight, 60);
    window.addEventListener('resize', updateSpotlight);
    window.addEventListener('scroll', updateSpotlight, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateSpotlight);
      window.removeEventListener('scroll', updateSpotlight, true);
    };
  }, [updateSpotlight]);

  // Dismiss on tap outside the coach mark
  const handleGlobalTap = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-coach-mark]')) {
      onDismiss();
    }
  }, [onDismiss]);

  useEffect(() => {
    const timer = setTimeout(() => {
      document.addEventListener('click', handleGlobalTap);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleGlobalTap);
    };
  }, [handleGlobalTap]);

  return (
    <>
      {/* Spotlight overlay: dark backdrop with a transparent cutout */}
      {spotlight && (
        <div
          className="fixed inset-0 z-40 pointer-events-none transition-all duration-300"
          style={{
            background: 'transparent',
            boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.35)`,
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            borderRadius: 12,
            position: 'fixed',
            right: 'auto',
            bottom: 'auto',
          }}
        />
      )}

      {/* Tap-to-dismiss backdrop (below coach mark, above content) */}
      <div className="fixed inset-0 z-40" onClick={onDismiss} />

      <div data-coach-mark className="relative z-50">
        <CoachMark
          steps={steps}
          currentStep={currentStep}
          totalSteps={steps.length}
          onNext={onNext}
          onDismiss={onDismiss}
        />
      </div>
    </>
  );
}
