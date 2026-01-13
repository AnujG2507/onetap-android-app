import { useState, useCallback, useEffect } from 'react';

const SETTINGS_KEY = 'onetap_settings';

export interface AppSettings {
  alwaysUseExternalPlayer: boolean;
}

const defaultSettings: AppSettings = {
  alwaysUseExternalPlayer: false,
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings(prev => {
      const newSettings = { ...prev, ...updates };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
      return newSettings;
    });
  }, []);

  return { settings, updateSettings };
}

// Utility to get settings synchronously (for use in non-React code)
export function getSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}
