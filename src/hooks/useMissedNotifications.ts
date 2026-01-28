// Hook to detect and manage missed scheduled notifications
// Checks for past-due actions when the app opens and provides a way to display them
// Only shows actions that were NOT clicked by the user

import { useState, useEffect, useCallback } from 'react';
import type { ScheduledAction } from '@/types/scheduledAction';
import { 
  getScheduledActions, 
  updateScheduledAction,
  advanceToNextTrigger,
  onScheduledActionsChange,
  markNotificationClicked,
} from '@/lib/scheduledActionsManager';

const DISMISSED_KEY = 'missed_notifications_dismissed';
const CHECK_INTERVAL = 60000; // Re-check every minute

interface UseMissedNotificationsReturn {
  missedActions: ScheduledAction[];
  hasMissedActions: boolean;
  dismissAction: (id: string) => void;
  dismissAll: () => void;
  executeAction: (action: ScheduledAction) => void;
  rescheduleAction: (id: string) => Promise<void>;
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

// Check if an action is past-due (trigger time has passed)
function isPastDue(action: ScheduledAction): boolean {
  return action.enabled && action.triggerTime < Date.now();
}

export function useMissedNotifications(): UseMissedNotificationsReturn {
  const [missedActions, setMissedActions] = useState<ScheduledAction[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => getDismissedIds());

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
    setMissedActions(prev => prev.filter(a => a.id !== id));
  }, [dismissedIds]);

  // Dismiss all missed actions
  const dismissAll = useCallback(() => {
    const newDismissed = new Set(dismissedIds);
    missedActions.forEach(action => newDismissed.add(action.id));
    setDismissedIds(newDismissed);
    saveDismissedIds(newDismissed);
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
    
    // For recurring actions, advance to next trigger
    if (action.recurrence !== 'once') {
      advanceToNextTrigger(action.id);
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
      // Advance to next trigger time
      advanceToNextTrigger(id);
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
