// React hook for managing scheduled actions
import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import type { 
  ScheduledAction, 
  CreateScheduledActionInput,
  ScheduledActionDestination 
} from '@/types/scheduledAction';
import {
  getScheduledActions,
  createScheduledAction as createAction,
  updateScheduledAction,
  deleteScheduledAction as deleteAction,
  toggleScheduledAction,
  getActiveCount,
  onScheduledActionsChange,
} from '@/lib/scheduledActionsManager';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';

interface UseScheduledActionsReturn {
  actions: ScheduledAction[];
  activeCount: number;
  isLoading: boolean;
  
  // CRUD operations
  createScheduledAction: (input: CreateScheduledActionInput) => Promise<ScheduledAction | null>;
  updateAction: (id: string, updates: Partial<ScheduledAction>) => Promise<boolean>;
  deleteScheduledAction: (id: string) => Promise<boolean>;
  toggleAction: (id: string) => Promise<boolean>;
  
  // Permission checks
  checkPermissions: () => Promise<{ notifications: boolean; alarms: boolean }>;
  requestPermissions: () => Promise<{ notifications: boolean; alarms: boolean }>;
  openAlarmSettings: () => Promise<void>;
  
  // Test/debug
  showTestNotification: () => Promise<{ success: boolean; error?: string }>;
}

export function useScheduledActions(): UseScheduledActionsReturn {
  const [actions, setActions] = useState<ScheduledAction[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const batteryCheckDone = useRef(false);

  // Load actions on mount and subscribe to changes
  useEffect(() => {
    const loadActions = () => {
      const current = getScheduledActions();
      setActions(current);
      setActiveCount(getActiveCount());
      setIsLoading(false);
    };

    loadActions();
    
    const unsubscribe = onScheduledActionsChange(loadActions);
    return unsubscribe;
  }, []);

  // Proactive battery optimization check on startup
  useEffect(() => {
    if (batteryCheckDone.current) return;
    if (!Capacitor.isNativePlatform()) return;
    
    const enabledActions = actions.filter(a => a.enabled);
    if (enabledActions.length === 0) return;

    batteryCheckDone.current = true;

    (async () => {
      try {
        const { exempted } = await ShortcutPlugin.checkBatteryOptimization();
        if (!exempted) {
          console.log('[useScheduledActions] User has scheduled actions but not battery-exempted, requesting');
          await ShortcutPlugin.requestBatteryOptimization();
        }
      } catch (e) {
        console.warn('[useScheduledActions] Battery optimization check failed:', e);
      }
    })();
  }, [actions]);

  // Create a new scheduled action
  const createScheduledAction = useCallback(async (
    input: CreateScheduledActionInput
  ): Promise<ScheduledAction | null> => {
    // Step 1: Save to local storage first - this MUST succeed
    let action: ScheduledAction;
    try {
      console.log('[ScheduledActions] Creating action with input:', {
        name: input.name,
        destinationType: input.destination.type,
        triggerTime: input.triggerTime,
        recurrence: input.recurrence,
      });
      action = createAction(input);
      console.log('[ScheduledActions] Action saved to localStorage:', action.id);
    } catch (localError) {
      console.error('[ScheduledActions] Failed to save action to localStorage:', localError);
      return null; // Only return null if local save fails
    }

    // Step 2: Try to schedule with native plugin (best-effort, non-blocking)
    try {
      const destinationData = JSON.stringify(input.destination);
      console.log('[ScheduledActions] Calling native scheduleAction with:', {
        id: action.id,
        name: action.name,
        description: input.description,
        destinationType: input.destination.type,
        triggerTime: input.triggerTime,
        recurrence: input.recurrence,
      });
      
      const result = await ShortcutPlugin.scheduleAction({
        id: action.id,
        name: action.name,
        description: input.description,
        destinationType: input.destination.type as 'file' | 'url' | 'contact',
        destinationData,
        triggerTime: input.triggerTime,
        recurrence: input.recurrence,
      });

      if (result.success) {
        console.log('[ScheduledActions] Native scheduling succeeded');
      } else {
        console.warn('[ScheduledActions] Native scheduling failed (non-fatal):', result.error);
      }
    } catch (nativeError) {
      // Plugin threw an exception - log it but don't fail the creation
      console.warn('[ScheduledActions] Native plugin exception (non-fatal):', nativeError);
    }

    // Always return the action if local save succeeded
    return action;
  }, []);

  // Update an existing action
  const updateAction = useCallback(async (
    id: string, 
    updates: Partial<ScheduledAction>
  ): Promise<boolean> => {
    try {
      const updated = updateScheduledAction(id, updates);
      if (!updated) return false;

      // If trigger time or enabled state changed, update native alarm
      if ('triggerTime' in updates || 'enabled' in updates) {
        if (updated.enabled) {
          const destinationData = JSON.stringify(updated.destination);
          await ShortcutPlugin.scheduleAction({
            id: updated.id,
            name: updated.name,
            description: updated.description,
            destinationType: updated.destination.type as 'file' | 'url' | 'contact',
            destinationData,
            triggerTime: updated.triggerTime,
            recurrence: updated.recurrence,
          });
        } else {
          await ShortcutPlugin.cancelScheduledAction({ id });
        }
      }

      return true;
    } catch (error) {
      console.error('Error updating scheduled action:', error);
      return false;
    }
  }, []);

  // Delete an action
  const deleteScheduledAction = useCallback(async (id: string): Promise<boolean> => {
    try {
      // Cancel native alarm first
      await ShortcutPlugin.cancelScheduledAction({ id });
      
      // Then delete from storage
      return deleteAction(id);
    } catch (error) {
      console.error('Error deleting scheduled action:', error);
      return false;
    }
  }, []);

  // Toggle enabled state
  const toggleAction = useCallback(async (id: string): Promise<boolean> => {
    try {
      const action = toggleScheduledAction(id);
      if (!action) return false;

      if (action.enabled) {
        // Re-schedule the alarm
        const destinationData = JSON.stringify(action.destination);
        await ShortcutPlugin.scheduleAction({
          id: action.id,
          name: action.name,
          description: action.description,
          destinationType: action.destination.type as 'file' | 'url' | 'contact',
          destinationData,
          triggerTime: action.triggerTime,
          recurrence: action.recurrence,
        });
      } else {
        // Cancel the alarm
        await ShortcutPlugin.cancelScheduledAction({ id });
      }

      return true;
    } catch (error) {
      console.error('Error toggling scheduled action:', error);
      return false;
    }
  }, []);

  // Check current permission status
  const checkPermissions = useCallback(async (): Promise<{ 
    notifications: boolean; 
    alarms: boolean 
  }> => {
    try {
      const [notifResult, alarmResult] = await Promise.all([
        ShortcutPlugin.checkNotificationPermission(),
        ShortcutPlugin.checkAlarmPermission(),
      ]);

      return {
        notifications: notifResult.granted,
        alarms: alarmResult.granted,
      };
    } catch (error) {
      console.error('Error checking permissions:', error);
      return { notifications: false, alarms: false };
    }
  }, []);

  // Request required permissions
  const requestPermissions = useCallback(async (): Promise<{ 
    notifications: boolean; 
    alarms: boolean 
  }> => {
    try {
      // Request notification permission first
      const notifResult = await ShortcutPlugin.requestNotificationPermission();
      
      // Check alarm permission (may need to direct to settings on Android 12+)
      const alarmResult = await ShortcutPlugin.checkAlarmPermission();

      return {
        notifications: notifResult.granted,
        alarms: alarmResult.granted,
      };
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return { notifications: false, alarms: false };
    }
  }, []);

  // Open system settings for exact alarm permission (Android 12+)
  const openAlarmSettings = useCallback(async (): Promise<void> => {
    try {
      await ShortcutPlugin.openAlarmSettings();
    } catch (error) {
      console.error('Error opening alarm settings:', error);
    }
  }, []);

  // Show test notification immediately (bypasses alarm system)
  const showTestNotification = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    try {
      return await ShortcutPlugin.showTestNotification();
    } catch (error) {
      console.error('Error showing test notification:', error);
      return { success: false, error: String(error) };
    }
  }, []);

  return {
    actions,
    activeCount,
    isLoading,
    createScheduledAction,
    updateAction,
    deleteScheduledAction,
    toggleAction,
    checkPermissions,
    requestPermissions,
    openAlarmSettings,
    showTestNotification,
  };
}
