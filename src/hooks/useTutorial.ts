import { useState, useCallback, useEffect } from 'react';

export type TutorialTab = 'access' | 'reminders' | 'library' | 'profile';

export interface TutorialStep {
  targetId: string;
  titleKey: string;
  descriptionKey: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const TUTORIAL_STORAGE_PREFIX = 'onetap_tutorial_completed_';

// Check if a tutorial has been completed
function hasCompletedTutorial(tab: TutorialTab): boolean {
  return localStorage.getItem(`${TUTORIAL_STORAGE_PREFIX}${tab}`) === 'true';
}

// Mark a tutorial as completed
function markTutorialCompleted(tab: TutorialTab): void {
  localStorage.setItem(`${TUTORIAL_STORAGE_PREFIX}${tab}`, 'true');
}

// Reset a specific tutorial
export function resetTutorial(tab: TutorialTab): void {
  localStorage.removeItem(`${TUTORIAL_STORAGE_PREFIX}${tab}`);
}

// Reset all tutorials
export function resetAllTutorials(): void {
  const tabs: TutorialTab[] = ['access', 'reminders', 'library', 'profile'];
  tabs.forEach(tab => {
    localStorage.removeItem(`${TUTORIAL_STORAGE_PREFIX}${tab}`);
  });
}

// Define tutorial steps for each tab
export const TUTORIAL_STEPS: Record<TutorialTab, TutorialStep[]> = {
  access: [
    {
      targetId: 'tutorial-content-grid',
      titleKey: 'tutorial.access.step1Title',
      descriptionKey: 'tutorial.access.step1Desc',
      position: 'bottom',
    },
    {
      targetId: 'tutorial-link-button',
      titleKey: 'tutorial.access.step2Title',
      descriptionKey: 'tutorial.access.step2Desc',
      position: 'bottom',
    },
    {
      targetId: 'tutorial-saved-bookmarks',
      titleKey: 'tutorial.access.step3Title',
      descriptionKey: 'tutorial.access.step3Desc',
      position: 'top',
    },
  ],
  reminders: [
    {
      targetId: 'tutorial-add-reminder',
      titleKey: 'tutorial.reminders.step1Title',
      descriptionKey: 'tutorial.reminders.step1Desc',
      position: 'top',
    },
    {
      targetId: 'tutorial-filter-chips',
      titleKey: 'tutorial.reminders.step2Title',
      descriptionKey: 'tutorial.reminders.step2Desc',
      position: 'bottom',
    },
  ],
  library: [
    {
      targetId: 'tutorial-add-bookmark',
      titleKey: 'tutorial.library.step1Title',
      descriptionKey: 'tutorial.library.step1Desc',
      position: 'top',
    },
    {
      targetId: 'tutorial-view-toggle',
      titleKey: 'tutorial.library.step2Title',
      descriptionKey: 'tutorial.library.step2Desc',
      position: 'bottom',
    },
  ],
  profile: [
    {
      targetId: 'tutorial-user-card',
      titleKey: 'tutorial.profile.step1Title',
      descriptionKey: 'tutorial.profile.step1Desc',
      position: 'bottom',
    },
    {
      targetId: 'tutorial-settings-button',
      titleKey: 'tutorial.profile.step2Title',
      descriptionKey: 'tutorial.profile.step2Desc',
      position: 'bottom',
    },
  ],
};

interface UseTutorialReturn {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  steps: TutorialStep[];
  next: () => void;
  previous: () => void;
  skip: () => void;
  complete: () => void;
  start: () => void;
}

export function useTutorial(tab: TutorialTab): UseTutorialReturn {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const steps = TUTORIAL_STEPS[tab];

  // Check if tutorial should auto-start on first mount
  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      if (!hasCompletedTutorial(tab)) {
        setIsActive(true);
        setCurrentStep(0);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [tab]);

  const next = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      // Last step, complete the tutorial
      markTutorialCompleted(tab);
      setIsActive(false);
    }
  }, [currentStep, steps.length, tab]);

  const previous = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const skip = useCallback(() => {
    markTutorialCompleted(tab);
    setIsActive(false);
  }, [tab]);

  const complete = useCallback(() => {
    markTutorialCompleted(tab);
    setIsActive(false);
  }, [tab]);

  const start = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  return {
    isActive,
    currentStep,
    totalSteps: steps.length,
    steps,
    next,
    previous,
    skip,
    complete,
    start,
  };
}
