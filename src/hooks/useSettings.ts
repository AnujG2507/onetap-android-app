import { useState, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { getSettings, updateSettings, AppSettings } from '@/lib/settingsManager';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';

/**
 * Sync settings to native SharedPreferences so native components can read them.
 */
async function syncSettingsToNative(settings: AppSettings): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  
  try {
    await ShortcutPlugin.syncSettings({
      settings: JSON.stringify(settings),
    });
  } catch (error) {
    console.warn('[useSettings] Failed to sync settings to native:', error);
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(getSettings);

  // Sync settings to native on initial load
  useEffect(() => {
    syncSettingsToNative(settings);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((updates: Partial<AppSettings>) => {
    const updated = updateSettings(updates);
    setSettings(updated);
    
    // Sync to native for native components (video player, etc.)
    syncSettingsToNative(updated);
  }, []);

  return {
    settings,
    updateSettings: update,
  };
}
