

## Reduce Cold-Start Sync Delay

### Change

**File: `src/hooks/useShortcuts.ts` (line ~176)**

Reduce the `setTimeout` delay for the initial `syncWithHomeScreen` call on app mount from 1500ms to 500ms.

```text
BEFORE: setTimeout(() => { ... syncWithHomeScreen(); }, 1500);
AFTER:  setTimeout(() => { ... syncWithHomeScreen(); }, 500);
```

This is a single-line change. The grace period inside `verifyShortcutPinned` (also 1500ms) remains unchanged -- that serves a different purpose (waiting for the BroadcastReceiver on slow devices).

