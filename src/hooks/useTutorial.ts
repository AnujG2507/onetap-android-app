import { useState, useCallback, useEffect, useRef } from 'react';

export type TutorialTab = 'access' | 'reminders' | 'library' | 'profile';

export interface TutorialStep {
  targetId: string;
  titleKey: string;
  descriptionKey: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const TUTORIAL_STORAGE_PREFIX = 'onetap_tutorial_completed_';
const VISIT_COUNT_PREFIX = 'onetap_tab_visits_';

// Check if a tutorial has been completed
function hasCompletedTutorial(tab: TutorialTab): boolean {
  return localStorage.getItem(`${TUTORIAL_STORAGE_PREFIX}${tab}`) === 'true';
}

// Mark a tutorial as completed
function markTutorialCompleted(tab: TutorialTab): void {
  localStorage.setItem(`${TUTORIAL_STORAGE_PREFIX}${tab}`, 'true');
}

// Get visit count for a tab
function getVisitCount(tab: TutorialTab): number {
  const count = localStorage.getItem(`${VISIT_COUNT_PREFIX}${tab}`);
  return count ? parseInt(count, 10) : 0;
}

// Increment and return visit count for a tab
function incrementVisitCount(tab: TutorialTab): number {
  const newCount = getVisitCount(tab) + 1;
  localStorage.setItem(`${VISIT_COUNT_PREFIX}${tab}`, String(newCount));
  return newCount;
}

// Reset a specific tutorial
export function resetTutorial(tab: TutorialTab): void {
  localStorage.removeItem(`${TUTORIAL_STORAGE_PREFIX}${tab}`);
  localStorage.removeItem(`${VISIT_COUNT_PREFIX}${tab}`);
}

// Reset all tutorials
export function resetAllTutorials(): void {
  const tabs: TutorialTab[] = ['access', 'reminders', 'library', 'profile'];
  tabs.forEach(tab => {
    localStorage.removeItem(`${TUTORIAL_STORAGE_PREFIX}${tab}`);
    localStorage.removeItem(`${VISIT_COUNT_PREFIX}${tab}`);
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
  const hasTrackedVisit = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track visits and trigger tutorial on second visit OR after 5+ seconds on first visit
  useEffect(() => {
    // Skip if already completed
    if (hasCompletedTutorial(tab)) return;

    // Track visit only once per mount
    if (!hasTrackedVisit.current) {
      hasTrackedVisit.current = true;
      const visitCount = incrementVisitCount(tab);

      // Second visit or later: trigger immediately (with small DOM delay)
      if (visitCount >= 2) {
        timeoutRef.current = setTimeout(() => {
          if (!hasCompletedTutorial(tab)) {
            setIsActive(true);
            setCurrentStep(0);
          }
        }, 500);
        return;
      }
    }

    // First visit: trigger after 5 seconds of staying on the tab
    timeoutRef.current = setTimeout(() => {
      if (!hasCompletedTutorial(tab)) {
        setIsActive(true);
        setCurrentStep(0);
      }
    }, 5000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
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
