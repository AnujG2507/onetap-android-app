import { useState, useCallback } from 'react';

const ONBOARDING_KEY = 'onetap_onboarding_complete';
const LANGUAGE_SELECTED_KEY = 'onetap_language_selected';

export function useOnboarding() {
  const [isComplete, setIsComplete] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [hasSelectedLanguage, setHasSelectedLanguage] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LANGUAGE_SELECTED_KEY) === 'true';
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

  const markLanguageSelected = useCallback(() => {
    try {
      localStorage.setItem(LANGUAGE_SELECTED_KEY, 'true');
    } catch {
      // Ignore storage errors
    }
    setHasSelectedLanguage(true);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => prev + 1);
  }, []);

  const previousStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  const resetOnboarding = useCallback(() => {
    try {
      localStorage.removeItem(ONBOARDING_KEY);
      localStorage.removeItem(LANGUAGE_SELECTED_KEY);
    } catch {
      // Ignore storage errors
    }
    setIsComplete(false);
    setHasSelectedLanguage(false);
    setCurrentStep(0);
  }, []);

  return {
    isComplete,
    hasSelectedLanguage,
    currentStep,
    setCurrentStep,
    completeOnboarding,
    skipOnboarding,
    markLanguageSelected,
    nextStep,
    previousStep,
    resetOnboarding,
  };
}
