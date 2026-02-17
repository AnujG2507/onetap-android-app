// Scheduled Actions Manager
// Handles CRUD operations and storage for scheduled actions

import type { 
  ScheduledAction, 
  CreateScheduledActionInput,
  RecurrenceType,
  RecurrenceAnchor
} from '@/types/scheduledAction';
import { recordDeletion } from './deletionTracker';

const STORAGE_KEY = 'scheduled_actions';
const SELECTION_KEY = 'scheduled_actions_selection';
const SORT_PREFERENCES_KEY = 'scheduled_actions_sort_prefs';

// Event for reactivity
const CHANGE_EVENT = 'scheduled-actions-changed';
const SELECTION_CHANGE_EVENT = 'scheduled-actions-selection-changed';

function notifyChange(): void {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function notifySelectionChange(): void {
  window.dispatchEvent(new CustomEvent(SELECTION_CHANGE_EVENT));
}

export function onScheduledActionsChange(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

export function onSelectionChange(callback: () => void): () => void {
  window.addEventListener(SELECTION_CHANGE_EVENT, callback);
  return () => window.removeEventListener(SELECTION_CHANGE_EVENT, callback);
}

// Generate unique ID
function generateId(): string {
  return `sa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get all scheduled actions
export function getScheduledActions(): ScheduledAction[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as ScheduledAction[];
  } catch (error) {
    console.error('Failed to load scheduled actions:', error);
    return [];
  }
}

// Save all scheduled actions
function saveScheduledActions(actions: ScheduledAction[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(actions));
    notifyChange();
  } catch (error) {
    console.error('Failed to save scheduled actions:', error);
  }
}

// Get a single scheduled action by ID
export function getScheduledAction(id: string): ScheduledAction | null {
  const actions = getScheduledActions();
  return actions.find(a => a.id === id) || null;
}

// Create a new scheduled action
export function createScheduledAction(input: CreateScheduledActionInput): ScheduledAction {
  const action: ScheduledAction = {
    id: generateId(),
    name: input.name,
    description: input.description,
    destination: input.destination,
    triggerTime: input.triggerTime,
    recurrence: input.recurrence,
    enabled: true,
    createdAt: Date.now(),
    recurrenceAnchor: input.recurrenceAnchor,
  };

  const actions = getScheduledActions();
  actions.push(action);
  saveScheduledActions(actions);

  return action;
}

// Update an existing scheduled action
export function updateScheduledAction(
  id: string, 
  updates: Partial<Omit<ScheduledAction, 'id' | 'createdAt'>>
): ScheduledAction | null {
  const actions = getScheduledActions();
  const index = actions.findIndex(a => a.id === id);
  
  if (index === -1) return null;

  actions[index] = { ...actions[index], ...updates };
  saveScheduledActions(actions);

  return actions[index];
}

// Delete a scheduled action
export function deleteScheduledAction(id: string): boolean {
  const actions = getScheduledActions();
  const filtered = actions.filter(a => a.id !== id);
  
  if (filtered.length === actions.length) return false;

  recordDeletion('scheduled_action', id);
  saveScheduledActions(filtered);
  removeFromSelection(id);
  return true;
}

// Toggle enabled state
export function toggleScheduledAction(id: string): ScheduledAction | null {
  const action = getScheduledAction(id);
  if (!action) return null;

  return updateScheduledAction(id, { enabled: !action.enabled });
}

// Get active (enabled) scheduled actions sorted by trigger time
export function getActiveScheduledActions(): ScheduledAction[] {
  return getScheduledActions()
    .filter(a => a.enabled)
    .sort((a, b) => a.triggerTime - b.triggerTime);
}

// Get count of enabled actions
export function getActiveCount(): number {
  return getScheduledActions().filter(a => a.enabled).length;
}

// ============= Selection Management =============

export function getSelectedIds(): Set<string> {
  try {
    const stored = localStorage.getItem(SELECTION_KEY);
    if (!stored) return new Set();
    return new Set(JSON.parse(stored) as string[]);
  } catch {
    return new Set();
  }
}

function saveSelectedIds(ids: Set<string>): void {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify([...ids]));
    notifySelectionChange();
  } catch (error) {
    console.error('Failed to save selection:', error);
  }
}

export function toggleSelection(id: string): void {
  const selected = getSelectedIds();
  if (selected.has(id)) {
    selected.delete(id);
  } else {
    selected.add(id);
  }
  saveSelectedIds(selected);
}

export function addToSelection(id: string): void {
  const selected = getSelectedIds();
  selected.add(id);
  saveSelectedIds(selected);
}

export function removeFromSelection(id: string): void {
  const selected = getSelectedIds();
  selected.delete(id);
  saveSelectedIds(selected);
}

export function clearSelection(): void {
  saveSelectedIds(new Set());
}

export function selectAll(): void {
  const actions = getScheduledActions();
  const allIds = new Set(actions.map(a => a.id));
  saveSelectedIds(allIds);
}

export function isSelected(id: string): boolean {
  return getSelectedIds().has(id);
}

export function getSelectedCount(): number {
  return getSelectedIds().size;
}

export function getSelectedActions(): ScheduledAction[] {
  const selected = getSelectedIds();
  return getScheduledActions().filter(a => selected.has(a.id));
}

// ============= Bulk Operations =============

export function bulkDelete(ids: string[]): number {
  const actions = getScheduledActions();
  const toDelete = new Set(ids);
  const filtered = actions.filter(a => !toDelete.has(a.id));
  const deletedCount = actions.length - filtered.length;
  
  if (deletedCount > 0) {
    saveScheduledActions(filtered);
    // Clear selection for deleted items
    ids.forEach(id => removeFromSelection(id));
  }
  
  return deletedCount;
}

export function bulkToggleEnabled(ids: string[], enabled: boolean): number {
  const actions = getScheduledActions();
  const toToggle = new Set(ids);
  let toggledCount = 0;
  
  const updated = actions.map(a => {
    if (toToggle.has(a.id) && a.enabled !== enabled) {
      toggledCount++;
      return { ...a, enabled };
    }
    return a;
  });
  
  if (toggledCount > 0) {
    saveScheduledActions(updated);
  }
  
  return toggledCount;
}

// ============= Sort Preferences =============

export type SortMode = 'next' | 'alphabetical' | 'recurrence';

export interface SortPreferences {
  mode: SortMode;
  reversed: boolean;
}

export function getSortPreferences(): SortPreferences {
  try {
    const stored = localStorage.getItem(SORT_PREFERENCES_KEY);
    if (!stored) return { mode: 'next', reversed: false };
    return JSON.parse(stored) as SortPreferences;
  } catch {
    return { mode: 'next', reversed: false };
  }
}

export function saveSortPreferences(prefs: SortPreferences): void {
  try {
    localStorage.setItem(SORT_PREFERENCES_KEY, JSON.stringify(prefs));
  } catch (error) {
    console.error('Failed to save sort preferences:', error);
  }
}

// ============= Time Computation =============

// Compute next trigger time for recurring actions
export function computeNextTrigger(
  recurrence: RecurrenceType,
  anchor: RecurrenceAnchor,
  afterTime: number = Date.now()
): number {
  const now = new Date(afterTime);
  const result = new Date(now);

  // Set the time of day
  result.setHours(anchor.hour, anchor.minute, 0, 0);

  switch (recurrence) {
    case 'once':
      // For one-time, just return the anchor time if it's in the future
      if (result.getTime() <= afterTime) {
        result.setDate(result.getDate() + 1);
      }
      break;

    case 'daily':
      // If the time has passed today, schedule for tomorrow
      if (result.getTime() <= afterTime) {
        result.setDate(result.getDate() + 1);
      }
      break;

    case 'weekly':
      if (anchor.dayOfWeek !== undefined) {
        const currentDay = result.getDay();
        let daysUntil = anchor.dayOfWeek - currentDay;
        
        if (daysUntil < 0 || (daysUntil === 0 && result.getTime() <= afterTime)) {
          daysUntil += 7;
        }
        
        result.setDate(result.getDate() + daysUntil);
      }
      break;

    case 'yearly':
      if (anchor.month !== undefined && anchor.dayOfMonth !== undefined) {
        result.setMonth(anchor.month, anchor.dayOfMonth);
        
        // If this date has passed this year, schedule for next year
        if (result.getTime() <= afterTime) {
          result.setFullYear(result.getFullYear() + 1);
        }
      }
      break;
  }

  return result.getTime();
}

// Advance a recurring action to its next trigger time
export function advanceToNextTrigger(id: string): ScheduledAction | null {
  const action = getScheduledAction(id);
  if (!action || action.recurrence === 'once' || !action.recurrenceAnchor) {
    return null;
  }

  const nextTrigger = computeNextTrigger(
    action.recurrence,
    action.recurrenceAnchor,
    action.triggerTime + 1000 // Add 1 second to ensure we get the *next* occurrence
  );

  // Reset notification tracking for the new occurrence
  return updateScheduledAction(id, { 
    triggerTime: nextTrigger,
    notificationClicked: false,
    lastNotificationTime: undefined,
  });
}

// ============= Notification Tracking =============

// Mark a notification as clicked (user acted on it)
export function markNotificationClicked(id: string): void {
  updateScheduledAction(id, { notificationClicked: true });
}

// Mark a notification as shown (for tracking missed notifications)
export function markNotificationShown(id: string): void {
  updateScheduledAction(id, { 
    lastNotificationTime: Date.now(),
    notificationClicked: false,
  });
}

// ============= Formatting =============

// Format trigger time for display
export function formatTriggerTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isDifferentYear = date.getFullYear() !== now.getFullYear();

  const timeStr = date.toLocaleTimeString(undefined, { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });

  // Check if it's today
  if (date.toDateString() === now.toDateString()) {
    return `Today at ${timeStr}`;
  }

  // Check if it's tomorrow
  if (date.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow at ${timeStr}`;
  }

  // Check if it's within this week (and same year)
  const daysUntil = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil < 7 && !isDifferentYear) {
    const dayName = date.toLocaleDateString(undefined, { weekday: 'long' });
    return `${dayName} at ${timeStr}`;
  }

  // Otherwise show full date (include year if different)
  const dateStr = date.toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric',
    ...(isDifferentYear && { year: 'numeric' }),
  });
  return `${dateStr} at ${timeStr}`;
}

// Format recurrence for display
export function formatRecurrence(recurrence: RecurrenceType): string {
  switch (recurrence) {
    case 'once': return 'One time';
    case 'daily': return 'Every day';
    case 'weekly': return 'Every week';
    case 'yearly': return 'Every year';
  }
}
