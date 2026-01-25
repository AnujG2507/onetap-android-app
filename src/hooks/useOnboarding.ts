import { useState, useCallback, useEffect } from 'react';

const ONBOARDING_KEY = 'onetap_onboarding_complete';

export function useOnboarding() {
  const [isComplete, setIsComplete] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) === 'true';
    } catch {
      return false;
    }
  });
  
  const [currentStep, setCurrentStep] = useState(0);

  const completeOnboarding = useCallback(() => {
    try {
      localStorage.setItem(ONBOARDING_KEY, 'true');
    } catch {
      // Ignore storage errors
    }
    setIsComplete(true);
  }, []);

  const skipOnboarding = useCallback(() => {
    completeOnboarding();
  }, [completeOnboarding]);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => prev + 1);
  }, []);

  const previousStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  const resetOnboarding = useCallback(() => {
    try {
      localStorage.removeItem(ONBOARDING_KEY);
    } catch {
      // Ignore storage errors
    }
    setIsComplete(false);
    setCurrentStep(0);
  }, []);

  return {
    isComplete,
    currentStep,
    setCurrentStep,
    completeOnboarding,
    skipOnboarding,
    nextStep,
    previousStep,
    resetOnboarding,
  };
}
