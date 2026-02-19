

# Thorough Evaluation: Auto-Sync Logic for OEM Android 12+ Devices

## Current Logic (after latest change)

```
App resumes -> getPinnedShortcutIds() -> get OS ids + recentlyCreatedIds
  -> confirmed = ids + recentlyCreatedIds
  -> keep only confirmed shortcuts in localStorage
```

This is clean and trusts the OS. But there are several issues that will cause failures on OEM devices.

---

## Issue 1: Race Condition on App Mount

**Problem**: `syncWithHomeScreen` runs on mount (line 147) AND on `appStateChange` (line 174). When the app cold-starts (e.g., after being killed by the OS), both fire in quick succession. The mount effect runs `syncWithHomeScreen()`, and then the `appStateChange` listener fires `isActive=true` immediately after. This means two concurrent calls to `getPinnedShortcutIds()` can overlap, with the second one potentially reading stale localStorage while the first is still writing.

**Fix**: Add a guard so sync only runs once at a time. Use a `ref` to track if a sync is in progress.

---

## Issue 2: Timing of Dynamic Shortcut Registration vs. Pinned Query

**Problem**: When `createPinnedShortcut` is called in Java, it:
1. Calls `manager.addDynamicShortcuts()` (registers the shortcut)
2. Calls `manager.requestPinShortcut()` (asks the launcher to pin it)
3. Calls `registerShortcutCreation(id)` (records in registry with timestamp)

The user then sees a confirmation dialog on their home screen. But `requestPinShortcut` is **asynchronous** -- the shortcut is not actually pinned until the user confirms. If the app resumes (or `syncWithHomeScreen` runs) between step 2 and the user confirming, the shortcut will NOT appear in `getShortcuts(FLAG_MATCH_PINNED)`.

The `recentlyCreatedIds` (10-second cooldown) protects against this, but 10 seconds may not be enough if the user is slow to confirm or if Samsung's launcher delays the pin operation.

**Fix**: Increase the cooldown to 30 seconds. This is safe because it only prevents deletion of brand-new shortcuts; it does not prevent any other operation.

---

## Issue 3: No Debounce on Resume Sync

**Problem**: On Samsung devices, the `appStateChange` event can fire multiple times rapidly when the user switches apps (split screen, picture-in-picture, notification shade). Each firing triggers a full `syncWithHomeScreen` call. If the OS is under load, any of these calls could return incomplete data.

**Fix**: Add a debounce -- only run sync if at least 5 seconds have passed since the last sync.

---

## Issue 4: Error Cases Return Empty Arrays, Not Errors

**Problem**: In the native `getPinnedShortcutIds` Java method, every error case (context null, manager null, exception caught) returns `ids: []` instead of throwing or returning an error flag. The JS side then treats `ids: []` as "zero pinned shortcuts" and deletes everything.

**Fix**: Add a boolean `error` field to the native response. When any error occurs, set `error: true`. On the JS side, skip sync if `error` is true.

---

## Issue 5: `disablePinnedShortcut` Can Cause Stale OS Cache

**Problem**: When the user deletes a shortcut from the app, `disablePinnedShortcut` calls `manager.disableShortcuts()`. On some Samsung devices, a disabled shortcut may still appear in `getShortcuts(FLAG_MATCH_PINNED)` with `isPinned() = true` for a brief period. This is not harmful (it would prevent deletion, not cause it), but it means the sync could keep a shortcut that was already deleted from localStorage by `deleteShortcut()`. This is a minor inconsistency but not a data loss issue.

**No fix needed** -- this is harmless.

---

## Implementation Plan

### File 1: `native/android/app/src/main/java/app/onetap/access/plugins/ShortcutPlugin.java`

**Change 1**: Increase `CREATION_COOLDOWN_MS` from 10 seconds to 30 seconds (line 143).

**Change 2**: Add an `error` boolean to all error-case responses in `getPinnedShortcutIds`. Currently lines 4192-4201, 4207-4216, 4220-4230, and 4328-4338 all return `ids: []` silently. Add `result.put("error", true)` to each of these blocks. For the success path (line 4320), add `result.put("error", false)`.

### File 2: `src/hooks/useShortcuts.ts`

**Change 1**: Add a `syncInProgress` ref to prevent concurrent syncs.

**Change 2**: Add a `lastSyncTime` ref to debounce syncs (minimum 5 seconds between syncs).

**Change 3**: In `syncWithHomeScreen`, check the `error` field from the native response and skip sync if the native side reported an error.

**Change 4**: In the mount effect, remove the direct `syncWithHomeScreen()` call -- let the `appStateChange` handler be the single entry point for sync. This eliminates the double-sync race on cold start.

### File 3: `src/plugins/ShortcutPlugin.ts`

**Change 1**: Add `error?: boolean` to the return type of `getPinnedShortcutIds()`.

---

## Updated `syncWithHomeScreen` Logic

```typescript
const syncInProgress = useRef(false);
const lastSyncTime = useRef(0);
const MIN_SYNC_INTERVAL = 5000; // 5 seconds

const syncWithHomeScreen = useCallback(async () => {
  if (!Capacitor.isNativePlatform()) return;
  if (syncInProgress.current) return;

  const now = Date.now();
  if (now - lastSyncTime.current < MIN_SYNC_INTERVAL) return;

  syncInProgress.current = true;
  lastSyncTime.current = now;

  try {
    const result = await ShortcutPlugin.getPinnedShortcutIds();

    // If native side reported an error, skip sync entirely
    if (result.error) {
      console.warn('[useShortcuts] Native reported error, skipping sync');
      return;
    }

    const { ids, recentlyCreatedIds } = result;
    const stored = localStorage.getItem(STORAGE_KEY);
    const currentShortcuts: ShortcutData[] = stored ? JSON.parse(stored) : [];

    if (currentShortcuts.length === 0) return;

    const confirmed = new Set([...ids, ...recentlyCreatedIds]);
    const synced = currentShortcuts.filter(s => confirmed.has(s.id));

    if (synced.length !== currentShortcuts.length) {
      const removedCount = currentShortcuts.length - synced.length;
      console.log(`[useShortcuts] Removed ${removedCount} shortcuts not on home screen`);
      saveShortcuts(synced);
    } else {
      setShortcuts(currentShortcuts);
    }
  } catch (error) {
    console.warn('[useShortcuts] Sync failed:', error);
  } finally {
    syncInProgress.current = false;
  }
}, [saveShortcuts]);
```

## Summary of All Changes

| Change | File | Purpose |
|--------|------|---------|
| Cooldown 10s to 30s | ShortcutPlugin.java | Protect new shortcuts from slow launcher confirmation |
| Add `error` field | ShortcutPlugin.java | Distinguish "0 pinned" from "API failed" |
| Add `error` to type | ShortcutPlugin.ts | TypeScript type safety |
| Concurrent sync guard | useShortcuts.ts | Prevent double-sync on cold start |
| 5s debounce | useShortcuts.ts | Prevent rapid-fire syncs on Samsung |
| Skip sync on error | useShortcuts.ts | Don't delete shortcuts when native API fails |
| Remove mount sync call | useShortcuts.ts | Single entry point via appStateChange |

