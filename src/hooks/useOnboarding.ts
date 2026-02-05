import { useState, useCallback } from 'react';

const ONBOARDING_KEY = 'onetap_onboarding_complete';
// LANGUAGE SUPPORT TEMPORARILY DISABLED
// Language selection step key preserved for future re-enablement.
// Do not delete. Will be re-enabled in a future update.
// const LANGUAGE_SELECTED_KEY = 'onetap_language_selected';

export function useOnboarding() {
  const [isComplete, setIsComplete] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // LANGUAGE SUPPORT TEMPORARILY DISABLED
  // Language selection state always returns true for English-only launch.
  // Do not delete. Original logic preserved below for future re-enablement.
  // const [hasSelectedLanguage, setHasSelectedLanguage] = useState<boolean>(() => {
  //   try {
  //     return localStorage.getItem(LANGUAGE_SELECTED_KEY) === 'true';
  //   } catch {
  //     return false;
  //   }
  // });
  const hasSelectedLanguage = true; // Always true for English-only launch
  
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

  // LANGUAGE SUPPORT TEMPORARILY DISABLED
  // This function is kept as a no-op for API compatibility.
  // Do not delete. Will be re-enabled in a future update.
  const markLanguageSelected = useCallback(() => {
    // Original logic (commented out for English-only launch):
    // try {
    //   localStorage.setItem(LANGUAGE_SELECTED_KEY, 'true');
    // } catch {
    //   // Ignore storage errors
    // }
    // setHasSelectedLanguage(true);
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
      // LANGUAGE SUPPORT TEMPORARILY DISABLED
      // localStorage.removeItem(LANGUAGE_SELECTED_KEY);
    } catch {
      // Ignore storage errors
    }
    setIsComplete(false);
    // LANGUAGE SUPPORT TEMPORARILY DISABLED
    // setHasSelectedLanguage(false);
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
