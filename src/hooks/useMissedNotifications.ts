// Hook to detect and manage missed scheduled notifications
// Checks for past-due actions when the app opens and provides a way to display them
// Only shows actions that were NOT clicked by the user
// Syncs native Android click data on startup

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ScheduledAction } from '@/types/scheduledAction';
import { 
  getScheduledActions, 
  updateScheduledAction,
  advanceToNextTrigger,
  onScheduledActionsChange,
  markNotificationClicked,
} from '@/lib/scheduledActionsManager';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';

const DISMISSED_KEY = 'missed_notifications_dismissed';
const DISMISSED_TIMESTAMPS_KEY = 'missed_notifications_dismissed_times';
const CHECK_INTERVAL = 60000; // Re-check every minute
const CLEANUP_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

interface UseMissedNotificationsReturn {
  missedActions: ScheduledAction[];
  hasMissedActions: boolean;
  dismissAction: (id: string) => void;
  dismissAll: () => void;
  executeAction: (action: ScheduledAction) => void;
  rescheduleAction: (id: string) => Promise<void>;
}

// Get dismissed timestamps map
function getDismissedTimestamps(): Map<string, number> {
  try {
    const stored = localStorage.getItem(DISMISSED_TIMESTAMPS_KEY);
    if (!stored) return new Map();
    return new Map(Object.entries(JSON.parse(stored)));
  } catch {
    return new Map();
  }
}

// Save dismissed timestamps to localStorage
function saveDismissedTimestamps(timestamps: Map<string, number>): void {
  try {
    localStorage.setItem(DISMISSED_TIMESTAMPS_KEY, JSON.stringify(Object.fromEntries(timestamps)));
  } catch (error) {
    console.error('Failed to save dismissed timestamps:', error);
  }
}

// Get IDs that have been dismissed (persisted in localStorage)
function getDismissedIds(): Set<string> {
  try {
    const stored = localStorage.getItem(DISMISSED_KEY);
    if (!stored) return new Set();
    return new Set(JSON.parse(stored) as string[]);
  } catch {
    return new Set();
  }
}

// Save dismissed IDs to localStorage (persists across sessions)
function saveDismissedIds(ids: Set<string>): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch (error) {
    console.error('Failed to save dismissed IDs:', error);
  }
}

// Clean up old dismissed IDs that are older than CLEANUP_MAX_AGE
function cleanupOldDismissedIds(): void {
  const now = Date.now();
  const timestamps = getDismissedTimestamps();
  const dismissedIds = getDismissedIds();
  const existingActionIds = new Set(getScheduledActions().map(a => a.id));
  
  let cleanedCount = 0;
  const newDismissedIds = new Set<string>();
  const newTimestamps = new Map<string, number>();
  
  for (const id of dismissedIds) {
    const timestamp = timestamps.get(id) || 0;
    const isStale = (now - timestamp) > CLEANUP_MAX_AGE;
    const actionExists = existingActionIds.has(id);
    
    // Keep if: action still exists OR dismissed recently
    if (actionExists || !isStale) {
      newDismissedIds.add(id);
      if (timestamps.has(id)) {
        newTimestamps.set(id, timestamps.get(id)!);
      }
    } else {
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`[useMissedNotifications] Cleaned up ${cleanedCount} old dismissed IDs`);
    saveDismissedIds(newDismissedIds);
    saveDismissedTimestamps(newTimestamps);
  }
}

// Check if an action is past-due (trigger time has passed)
function isPastDue(action: ScheduledAction): boolean {
  return action.enabled && action.triggerTime < Date.now();
}

// Sync clicked notification IDs from native Android
async function syncNativeClickedIds(): Promise<void> {
  try {
    const result = await ShortcutPlugin.getClickedNotificationIds();
    if (result.success && result.ids.length > 0) {
      console.log('[useMissedNotifications] Syncing', result.ids.length, 'clicked IDs from native');
      // Mark each ID as clicked in our local storage
      for (const id of result.ids) {
        markNotificationClicked(id);
      }
    }
  } catch (error) {
    console.warn('[useMissedNotifications] Failed to sync native clicked IDs:', error);
  }
}

export function useMissedNotifications(): UseMissedNotificationsReturn {
  const [missedActions, setMissedActions] = useState<ScheduledAction[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => getDismissedIds());
  const nativeSyncDone = useRef(false);

  // Find all past-due actions that haven't been dismissed or clicked
  const checkForMissedActions = useCallback(() => {
    const allActions = getScheduledActions();
    const pastDue = allActions.filter(action => {
      // Must be past-due and not dismissed
      if (!isPastDue(action)) return false;
      if (dismissedIds.has(action.id)) return false;
      
      // Skip if notification was clicked (user already acted on it)
      if (action.notificationClicked === true) return false;
      
      // For one-time actions, only show if within the last 24 hours
      if (action.recurrence === 'once') {
        const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
        if (action.triggerTime < twentyFourHoursAgo) return false;
      }
      
      // For recurring actions, only show if missed within reasonable window
      // (they should auto-advance, but may not if app was closed)
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      if (action.triggerTime < oneWeekAgo) return false;
      
      return true;
    });

    // Sort by trigger time (most recent first)
    pastDue.sort((a, b) => b.triggerTime - a.triggerTime);
    
    setMissedActions(pastDue);
  }, [dismissedIds]);

  // Sync native clicked IDs on mount and run cleanup (once)
  useEffect(() => {
    if (!nativeSyncDone.current) {
      nativeSyncDone.current = true;
      // Clean up old dismissed IDs first
      cleanupOldDismissedIds();
      // Then sync native data
      syncNativeClickedIds().then(() => {
        // Re-check after syncing native data
        checkForMissedActions();
      });
    }
  }, [checkForMissedActions]);

  // Initial check and subscribe to changes
  useEffect(() => {
    checkForMissedActions();
    
    const unsubscribe = onScheduledActionsChange(checkForMissedActions);
    
    // Also re-check periodically in case time passes while app is open
    const interval = setInterval(checkForMissedActions, CHECK_INTERVAL);
    
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [checkForMissedActions]);

  // Dismiss a single action from the missed list
  const dismissAction = useCallback((id: string) => {
    const newDismissed = new Set(dismissedIds);
    newDismissed.add(id);
    setDismissedIds(newDismissed);
    saveDismissedIds(newDismissed);
    
    // Also record the timestamp for cleanup purposes
    const timestamps = getDismissedTimestamps();
    timestamps.set(id, Date.now());
    saveDismissedTimestamps(timestamps);
    
    setMissedActions(prev => prev.filter(a => a.id !== id));
  }, [dismissedIds]);

  // Dismiss all missed actions
  const dismissAll = useCallback(() => {
    const newDismissed = new Set(dismissedIds);
    const timestamps = getDismissedTimestamps();
    const now = Date.now();
    
    missedActions.forEach(action => {
      newDismissed.add(action.id);
      timestamps.set(action.id, now);
    });
    
    setDismissedIds(newDismissed);
    saveDismissedIds(newDismissed);
    saveDismissedTimestamps(timestamps);
    setMissedActions([]);
  }, [dismissedIds, missedActions]);

  // Execute the action (open URL, dial contact, etc.)
  const executeAction = useCallback((action: ScheduledAction) => {
    const { destination } = action;
    
    switch (destination.type) {
      case 'url':
        window.open(destination.uri, '_blank');
        break;
      case 'contact':
        window.open(`tel:${destination.phoneNumber}`, '_self');
        break;
      case 'file':
        // For files, try to open via the native handler or fallback
        window.open(destination.uri, '_blank');
        break;
    }
    
    // Mark as clicked so it won't appear in missed again
    markNotificationClicked(action.id);
    
    // Dismiss from missed list
    dismissAction(action.id);
    
    // For recurring actions, advance until trigger is in the future
    if (action.recurrence !== 'once') {
      let maxIterations = 365;
      let current = getScheduledActions().find(a => a.id === action.id);
      while (current && current.triggerTime < Date.now() && maxIterations > 0) {
        advanceToNextTrigger(action.id);
        current = getScheduledActions().find(a => a.id === action.id);
        maxIterations--;
      }
    } else {
      // For one-time actions that have been executed, disable them
      updateScheduledAction(action.id, { enabled: false, notificationClicked: true });
    }
  }, [dismissAction]);

  // Reschedule a recurring action to its next occurrence
  const rescheduleAction = useCallback(async (id: string) => {
    const action = missedActions.find(a => a.id === id);
    if (!action) return;
    
    if (action.recurrence !== 'once' && action.recurrenceAnchor) {
      // Advance until the trigger time is in the future
      let maxIterations = 365;
      let current = getScheduledActions().find(a => a.id === id);
      while (current && current.triggerTime < Date.now() && maxIterations > 0) {
        advanceToNextTrigger(id);
        current = getScheduledActions().find(a => a.id === id);
        maxIterations--;
      }
    }
    
    // Dismiss from missed list
    dismissAction(id);
  }, [missedActions, dismissAction]);

  return {
    missedActions,
    hasMissedActions: missedActions.length > 0,
    dismissAction,
    dismissAll,
    executeAction,
    rescheduleAction,
  };
}
