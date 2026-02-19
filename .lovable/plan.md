

# Sync Access Points Count After Home Screen Unpin

## Problem

When a user unpins a shortcut from the home screen and then opens the app, the "My Access Points" button still shows the old count. The sync that reconciles with the OS (`syncWithHomeScreen`) only runs reliably when the app **resumes** from background -- not on a fresh cold start.

### Why It Happens

The `useShortcuts` hook has two relevant effects:

1. **Mount effect** -- runs once on startup, sets `initialSyncDone = true`, but deliberately does NOT call `syncWithHomeScreen` (per the code comment).
2. **appStateChange listener** -- calls `syncWithHomeScreen` when the app becomes active, but only if `initialSyncDone` is already `true`.

On a cold start (app was killed), the Capacitor `appStateChange` event with `isActive=true` may fire before the listener is even registered, or the event may not fire at all since it's a fresh launch, not a resume. This means `syncWithHomeScreen` never runs, and the stale shortcut data (including the unpinned one) persists until the user backgrounds and foregrounds the app.

## Solution

Call `syncWithHomeScreen()` during the mount effect with a small delay (to avoid racing with other startup work). This ensures the OS is queried for the current set of pinned shortcuts on every app launch, not just on resume.

## Technical Details

### File: `src/hooks/useShortcuts.ts`

**Change the mount effect** (lines 162-170) to also call `syncWithHomeScreen` after a short delay:

```
// Current:
useEffect(() => {
  syncToWidgets(shortcuts);
  usageHistoryManager.migrateExistingUsage(shortcuts);
  syncNativeUsageEvents();
  initialSyncDone.current = true;
}, []);

// Updated:
useEffect(() => {
  syncToWidgets(shortcuts);
  usageHistoryManager.migrateExistingUsage(shortcuts);
  syncNativeUsageEvents();
  initialSyncDone.current = true;

  // Sync with home screen on cold start (2s delay for app to settle)
  const timer = setTimeout(() => {
    syncWithHomeScreen();
  }, 2000);
  return () => clearTimeout(timer);
}, []);
```

This aligns with the existing 2-second delay pattern used by `useAutoSync` for daily sync on initial mount.

### No changes needed to `MyShortcutsButton.tsx`

The button already listens for the `shortcuts-changed` event, which `saveShortcuts` dispatches when `syncWithHomeScreen` removes unpinned shortcuts. Once the sync runs on cold start, the button count will update automatically.

