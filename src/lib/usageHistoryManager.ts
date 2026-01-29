import type { ShortcutData } from '@/types/shortcut';

export interface UsageEvent {
  shortcutId: string;
  timestamp: number; // Unix timestamp in ms
}

const USAGE_HISTORY_KEY = 'quicklaunch_usage_history';
const MIGRATION_KEY = 'usage_history_migrated';
const MAX_HISTORY_DAYS = 30;

export const usageHistoryManager = {
  // Add a new usage event
  // Optional timestamp parameter allows recording events from native layer with their original timestamp
  recordUsage(shortcutId: string, timestamp?: number): void {
    const history = this.getHistory();
    history.push({ shortcutId, timestamp: timestamp ?? Date.now() });
    this.saveHistory(history);
    this.purgeOldEntries();
  },

  // Get all usage history
  getHistory(): UsageEvent[] {
    try {
      const stored = localStorage.getItem(USAGE_HISTORY_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  // Save history to localStorage
  saveHistory(history: UsageEvent[]): void {
    try {
      localStorage.setItem(USAGE_HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('[usageHistoryManager] Failed to save history:', error);
    }
  },

  // Remove entries older than 30 days
  purgeOldEntries(): void {
    const cutoff = Date.now() - (MAX_HISTORY_DAYS * 24 * 60 * 60 * 1000);
    const history = this.getHistory().filter(e => e.timestamp >= cutoff);
    this.saveHistory(history);
  },

  // Get taps grouped by day for last N days
  getDailyTaps(days: number): Map<string, number> {
    const history = this.getHistory();
    const result = new Map<string, number>();
    
    // Initialize with zeros for each day
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().split('T')[0]; // YYYY-MM-DD
      result.set(key, 0);
    }
    
    // Count taps per day
    history.forEach(event => {
      const key = new Date(event.timestamp).toISOString().split('T')[0];
      if (result.has(key)) {
        result.set(key, (result.get(key) || 0) + 1);
      }
    });
    
    return result;
  },

  // Get total taps for current month
  getThisMonthTaps(): number {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    return this.getHistory()
      .filter(e => e.timestamp >= startOfMonth.getTime())
      .length;
  },

  // Migrate existing usage data to history (runs once)
  migrateExistingUsage(shortcuts: ShortcutData[]): void {
    const migrated = localStorage.getItem(MIGRATION_KEY);
    if (migrated) return;
    
    const history: UsageEvent[] = [];
    const now = Date.now();
    const thirtyDaysAgo = now - (MAX_HISTORY_DAYS * 24 * 60 * 60 * 1000);
    
    shortcuts.forEach(s => {
      if (s.usageCount > 0) {
        // Distribute usage over the time since creation (within last 30 days)
        const startTime = Math.max(s.createdAt, thirtyDaysAgo);
        const age = now - startTime;
        
        if (age > 0) {
          const interval = age / s.usageCount;
          
          for (let i = 0; i < s.usageCount; i++) {
            const eventTime = startTime + (interval * i);
            // Only add events from last 30 days
            if (eventTime >= thirtyDaysAgo) {
              history.push({
                shortcutId: s.id,
                timestamp: eventTime
              });
            }
          }
        }
      }
    });
    
    if (history.length > 0) {
      this.saveHistory(history);
    }
    
    localStorage.setItem(MIGRATION_KEY, 'true');
    console.log('[usageHistoryManager] Migrated existing usage data:', history.length, 'events');
  }
};
