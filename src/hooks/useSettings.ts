import { useState, useCallback } from 'react';
import { getSettings, updateSettings, AppSettings } from '@/lib/settingsManager';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(getSettings);

  const update = useCallback((updates: Partial<AppSettings>) => {
    const updated = updateSettings(updates);
    setSettings(updated);
  }, []);

  return {
    settings,
    updateSettings: update,
  };
}
