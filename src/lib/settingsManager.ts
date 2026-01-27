const SETTINGS_KEY = 'onetap_settings';

export type TrashRetentionDays = 7 | 14 | 30 | 60;

export interface AppSettings {
  clipboardDetectionEnabled: boolean;
  trashRetentionDays: TrashRetentionDays;
  autoSyncEnabled: boolean;
  // Notification settings
  scheduledRemindersEnabled: boolean;
  reminderSoundEnabled: boolean;
  // Video player settings
  pipModeEnabled: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  clipboardDetectionEnabled: true,
  trashRetentionDays: 30,
  autoSyncEnabled: true,
  scheduledRemindersEnabled: true,
  reminderSoundEnabled: true,
  pipModeEnabled: true,
};

export function getSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function updateSettings(updates: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const updated = { ...current, ...updates };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
  return updated;
}

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  return getSettings()[key];
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  updateSettings({ [key]: value });
}
