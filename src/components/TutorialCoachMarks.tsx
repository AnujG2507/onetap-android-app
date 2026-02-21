import { useEffect, useCallback } from 'react';
import { CoachMark } from './CoachMark';
import type { TutorialStep } from '@/hooks/useTutorial';

interface TutorialCoachMarksProps {
  steps: TutorialStep[];
  currentStep: number;
  onNext: () => void;
  onDismiss: () => void;
}

/**
 * Non-modal coach marks that float above the UI.
 * Tapping anywhere outside the coach mark dismisses the tutorial.
 * The coach marks don't block interaction with the underlying UI.
 */
export function TutorialCoachMarks({
  steps,
  currentStep,
  onNext,
  onDismiss,
}: TutorialCoachMarksProps) {
  // Global tap handler to dismiss on tap outside
  const handleGlobalTap = useCallback((e: MouseEvent | TouchEvent) => {
    const target = e.target as HTMLElement;
    // If tap is outside the coach mark, dismiss
    if (!target.closest('[data-coach-mark]')) {
      onDismiss();
    }
  }, [onDismiss]);

  useEffect(() => {
    // Add listener with a small delay to prevent immediate dismissal
    const timer = setTimeout(() => {
      document.addEventListener('click', handleGlobalTap);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleGlobalTap);
    };
  }, [handleGlobalTap]);

  return (
    <div data-coach-mark>
      <CoachMark
        steps={steps}
        currentStep={currentStep}
        totalSteps={steps.length}
        onNext={onNext}
        onDismiss={onDismiss}
      />
    </div>
  );
}
