import { useState, useEffect } from 'react';

export interface OnboardingData {
  topic?: string;
  learningStyle?: 'procedural' | 'exploratory' | 'hybrid';
}

const ONBOARDING_STORAGE_KEY = 'deepit_onboarding_complete';
const ONBOARDING_DATA_KEY = 'deepit_onboarding_data';

export function useOnboarding() {
  const [isComplete, setIsComplete] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
  });

  const [data, setData] = useState<OnboardingData>(() => {
    if (typeof window === 'undefined') return {};
    const stored = localStorage.getItem(ONBOARDING_DATA_KEY);
    return stored ? JSON.parse(stored) : {};
  });

  const completeOnboarding = (onboardingData: OnboardingData) => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    localStorage.setItem(ONBOARDING_DATA_KEY, JSON.stringify(onboardingData));
    setIsComplete(true);
    setData(onboardingData);
  };

  const resetOnboarding = () => {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    localStorage.removeItem(ONBOARDING_DATA_KEY);
    setIsComplete(false);
    setData({});
  };

  return {
    isComplete,
    data,
    completeOnboarding,
    resetOnboarding,
  };
}
