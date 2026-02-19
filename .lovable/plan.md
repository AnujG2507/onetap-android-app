

# Fix: Notification Tap Detection Not Syncing Properly

## Root Cause Analysis

There are **three distinct issues** causing tapped notifications to appear as "missed":

### Issue 1: No re-sync on app resume (CRITICAL)

`syncNativeClickedIds()` in `useMissedNotifications.ts` only runs **once** on mount (guarded by `nativeSyncDone.current`). When the user:
1. Receives a notification while the app is in the background
2. Taps the notification (native `NotificationClickActivity` records the click in SharedPreferences)
3. Returns to the app

...the JS layer **never re-fetches** the clicked IDs from native. The action still has `notificationClicked: false` in localStorage, so `checkForMissedActions` treats it as missed.

**Fix:** Add an `appStateChange` listener that re-syncs native clicked IDs every time the app resumes.

### Issue 2: Race condition on cold start (causes banner flash)

Two `useEffect` hooks run on mount:
- Effect 1 (line 163): Async `syncNativeClickedIds().then(checkForMissedActions)`
- Effect 2 (line 177): Synchronous `checkForMissedActions()` runs immediately

Effect 2 runs first, finds actions with `notificationClicked: false`, and shows them as missed. Then Effect 1 completes, marks them clicked, and the banner disappears -- but the user briefly sees a "missed" flash.

**Fix:** Add a `syncComplete` state flag. Suppress rendering missed actions until the first native sync has completed.

### Issue 3: `advanceToNextTrigger` resets click state before sync can happen

For recurring actions, when the native alarm fires and `ScheduledActionReceiver` re-schedules the next occurrence, the JS-side `advanceToNextTrigger` resets `notificationClicked: false` (line 344 of `scheduledActionsManager.ts`). If the user tapped the notification, the click is in SharedPreferences, but the JS field was already reset. If the sync hasn't run yet, the action appears as missed.

This is inherently handled by fixing Issue 1 (re-syncing on resume), as long as the sync runs before `checkForMissedActions`.

---

## Changes

### File: `src/hooks/useMissedNotifications.ts`

1. **Add `appStateChange` listener** to re-sync native clicked IDs on every app resume:

```tsx
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

// Inside the hook:
useEffect(() => {
  if (!Capacitor.isNativePlatform()) return;
  
  const listener = App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      // Re-sync clicked IDs from native every time app resumes
      syncNativeClickedIds().then(() => {
        checkForMissedActions();
      });
    }
  });
  
  return () => {
    listener.then(handle => handle.remove());
  };
}, [checkForMissedActions]);
```

2. **Add sync-complete guard** to prevent the banner flash on cold start:

```tsx
const [syncComplete, setSyncComplete] = useState(false);

// In the mount effect:
useEffect(() => {
  if (!nativeSyncDone.current) {
    nativeSyncDone.current = true;
    cleanupOldDismissedIds();
    syncNativeClickedIds().then(() => {
      checkForMissedActions();
      setSyncComplete(true);  // Signal that sync is done
    });
  } else {
    setSyncComplete(true);
  }
}, [checkForMissedActions]);
```

3. **Gate the return value** so consumers don't see stale missed actions before sync:

```tsx
return {
  missedActions: syncComplete ? missedActions : [],
  hasMissedActions: syncComplete && missedActions.length > 0,
  // ... rest unchanged
};
```

4. For **non-native platforms** (web), `syncComplete` should be set immediately since there's no native bridge to wait for:

```tsx
useEffect(() => {
  if (!nativeSyncDone.current) {
    nativeSyncDone.current = true;
    cleanupOldDismissedIds();
    
    if (Capacitor.isNativePlatform()) {
      syncNativeClickedIds().then(() => {
        checkForMissedActions();
        setSyncComplete(true);
      });
    } else {
      setSyncComplete(true);
    }
  }
}, [checkForMissedActions]);
```

---

## Summary

| Issue | Cause | Fix |
|-------|-------|-----|
| Tapped notifications show as missed | No re-sync on app resume | Add `appStateChange` listener to re-sync native click data |
| Banner flashes briefly on cold start | Race between sync and initial check | Gate output with `syncComplete` flag |
| Recurring actions lose click state | `advanceToNextTrigger` resets `notificationClicked` | Resolved by resume sync running before missed-action check |

One file changed: `src/hooks/useMissedNotifications.ts`

