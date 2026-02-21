

## Shortcut Pinning Flow Audit

### Current Flow Summary

1. User creates shortcut -> `createShortcut()` saves to localStorage immediately
2. `createHomeScreenShortcut()` calls native `requestPinShortcut()` with PendingIntent callback
3. `verifyShortcutPinned()` is called (fire-and-forget, not awaited)
4. Verification: 500ms timeout / appStateChange -> 300ms grace -> checkPinConfirmed -> OS fallback -> remove if not confirmed

### Critical Edge Cases Found

#### EDGE CASE 1: `syncWithHomeScreen` races with `verifyShortcutPinned` (HIGH RISK)

**The Problem:** On cold start, `syncWithHomeScreen` runs after a 1.5s delay (line 173-176). If the user creates a shortcut and the app is killed/restarted before the PendingIntent callback fires, the cold-start sync will query the OS for pinned IDs. If the OS hasn't registered the pin yet (within the 30s cooldown), the shortcut could be deleted.

**Current Mitigation:** `recentlyCreatedIds` from the registry (30s cooldown) protects new pins. This is adequate -- no fix needed.

#### EDGE CASE 2: `appStateChange` fires BEFORE PendingIntent callback writes to SharedPreferences (MEDIUM RISK)

**The Problem:** When the user drags the shortcut to the home screen, the app goes to background then returns to foreground. The `appStateChange` listener resolves the promise, then a 300ms grace period runs. But on slow devices (budget Samsung, Xiaomi), the `BroadcastReceiver` may not have written to SharedPreferences within 300ms of the app resuming, especially if the system is under load.

**Result:** `checkPinConfirmed` returns false, OS fallback query also might not report it yet on some launchers, and the shortcut gets deleted from localStorage despite being on the home screen.

**Fix:** Increase the grace period after appStateChange from 300ms to 500ms, and add a retry loop for `checkPinConfirmed` (check twice with a gap).

#### EDGE CASE 3: `verifyShortcutPinned` removes shortcut but it IS on the home screen (OS query unreliable) (MEDIUM RISK)

**The Problem:** `getPinnedShortcutIds` on some OEM devices (Xiaomi, OPPO) can return incomplete results, especially right after pinning. If both `checkPinConfirmed` and the OS query fail, the shortcut is deleted from the app but remains on the home screen as a dead icon.

**Fix:** When neither confirmation source confirms the pin, do NOT delete the shortcut. Instead, keep it and let `syncWithHomeScreen` (which runs on next app resume) handle cleanup later. This follows the principle: "better to have a shortcut in the app that isn't on the home screen than vice versa."

#### EDGE CASE 4: `checkPinConfirmed` consumes the confirmation (checkAndClear) before retry (LOW RISK)

**The Problem:** `ShortcutPinConfirmReceiver.checkAndClear()` removes the SharedPreferences entry after reading. If the JS-side check happens and the bridge call fails silently, the confirmation is consumed and a retry would return false.

**Current Status:** This is a theoretical risk. The bridge is reliable in practice. No fix needed, but the retry logic in Edge Case 2's fix should account for this by only calling `checkPinConfirmed` once.

### Proposed Changes

**File: `src/hooks/useShortcuts.ts` -- `verifyShortcutPinned` function**

1. After `appStateChange` resolves, increase post-resume grace from 300ms to 500ms for slow devices
2. Remove the deletion logic (Phase 5). If neither PendingIntent callback nor OS query confirms the pin, keep the shortcut in localStorage. The rationale: the 30s creation registry already protects the shortcut during `syncWithHomeScreen`, and deleting eagerly causes data loss on slow/unreliable OEM devices.
3. Only show the "not pinned" toast and delete if the shortcut was created more than 30 seconds ago AND the OS explicitly does not list it -- but this is already handled by `syncWithHomeScreen` on next app resume. So `verifyShortcutPinned` should only be an early-exit optimization, never a destructive action.

The resulting `verifyShortcutPinned` will:
- Wait for dialog close (500ms timeout or appStateChange)
- Wait 500ms grace for BroadcastReceiver
- Check `checkPinConfirmed` -- if confirmed, return (success)
- Check OS fallback -- if confirmed, return (success)
- If neither confirms: log a warning but DO NOT delete. Let `syncWithHomeScreen` handle it on next resume (after the 30s cooldown expires).

### Technical Details

```text
BEFORE (destructive):
  Dialog close -> 300ms -> checkPinConfirmed? -> OS query?
    -> NOT confirmed -> DELETE from localStorage + toast

AFTER (safe):
  Dialog close -> 500ms -> checkPinConfirmed? -> OS query?
    -> NOT confirmed -> LOG WARNING only
    -> syncWithHomeScreen (next resume, after 30s) handles cleanup
```

This ensures zero data loss: a shortcut saved to localStorage is never eagerly deleted by `verifyShortcutPinned`. The only path to deletion is `syncWithHomeScreen`, which runs after the creation cooldown has expired and the OS has had time to register the pin.

