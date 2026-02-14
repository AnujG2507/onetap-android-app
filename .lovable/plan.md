

# Fix Shortcut Sync on Non-Samsung OEMs

## Problem

On Samsung (One UI), `ShortcutManager.getShortcuts(FLAG_MATCH_PINNED)` reliably returns all pinned shortcut IDs. On OnePlus (OxygenOS), Xiaomi (MIUI/HyperOS), OPPO (ColorOS), and Vivo (FuntouchOS/OriginOS), the same API returns an incomplete or empty list for shortcuts created via `requestPinShortcut()` alone -- because these OEM launchers only track shortcuts that are also registered as dynamic shortcuts.

The current JS sync logic (lines 70-85 of `useShortcuts.ts`) interprets a partial list as "delete everything not in the list," causing valid shortcuts to vanish from the app.

## Root Cause

1. **No dynamic shortcut registration**: `createPinnedShortcut` in `ShortcutPlugin.java` (line 425) calls `requestPinShortcut()` without also calling `addDynamicShortcuts()`. OEM launchers need the dynamic registration to track pinned IDs.
2. **Aggressive JS deletion**: When the OS returns a non-empty but incomplete list, the sync removes shortcuts that are actually still on the home screen.

## Solution: Two-Part Fix

### Part 1 -- Shadow Dynamic Registration (Native Java)

**File: `ShortcutPlugin.java`**

After `requestPinShortcut()` succeeds (around line 425), also register the shortcut as a dynamic shortcut:

```text
manager.addDynamicShortcuts(Collections.singletonList(shortcutInfo));
```

This gives OEM launchers the tracking data they need. Android enforces a max of ~15 dynamic shortcuts, which is well within typical usage.

Also mirror this in `updatePinnedShortcut` -- after calling `updateShortcuts()`, also call `addDynamicShortcuts()` with the updated `ShortcutInfo` to keep the dynamic entry in sync.

And in `disablePinnedShortcut` -- the existing `removeDynamicShortcuts()` call (line 4195) already handles cleanup, so no changes needed there.

### Part 2 -- Defensive JS Sync Logic

**File: `src/hooks/useShortcuts.ts`**

Replace the current sync strategy (lines 66-89) with a more defensive approach:

- **Never delete if OS returns fewer IDs than local storage has** -- treat this as an unreliable response (same as the current empty-list guard, but extended to partial lists).
- **Only delete when OS returns IDs AND local count matches or exceeds OS count** -- meaning the OS is confidently reporting the full set.
- Add a **manufacturer-aware log** by reading `navigator.userAgent` or passing device info from native, to help diagnose future OEM-specific issues.

New logic:

```text
if (ids.length === 0) {
  // Keep all -- API unreliable
  return;
}

if (ids.length < currentShortcuts.length) {
  // OS returned fewer than we have locally -- likely incomplete
  // Only mark shortcuts as "confirmed pinned" but don't delete others
  console.log('[useShortcuts] Partial OS response, skipping deletion');
  return;
}

// OS returned same or more IDs than local -- safe to sync
const pinnedSet = new Set(ids);
const synced = currentShortcuts.filter(s => pinnedSet.has(s.id));
if (synced.length !== currentShortcuts.length) {
  saveShortcuts(synced);
}
```

### Part 3 -- Device Info Logging (Native Java)

**File: `ShortcutPlugin.java`** (in `getPinnedShortcutIds`)

Add manufacturer and launcher package to the log output for diagnostics:

```text
Log.d("ShortcutPlugin", "Device: " + Build.MANUFACTURER + ", Launcher: " + getLauncherPackage());
```

This helps identify which OEMs are returning incomplete data in future bug reports.

## Summary of File Changes

| File | Change |
|------|--------|
| `ShortcutPlugin.java` (createPinnedShortcut) | Add `addDynamicShortcuts()` after `requestPinShortcut()` |
| `ShortcutPlugin.java` (updatePinnedShortcut) | Add `addDynamicShortcuts()` after `updateShortcuts()` |
| `ShortcutPlugin.java` (getPinnedShortcutIds) | Add manufacturer + launcher logging |
| `src/hooks/useShortcuts.ts` (syncWithHomeScreen) | Make deletion defensive -- skip if OS returns fewer IDs than local |

## Risk Assessment

- **Dynamic shortcut limit**: Android caps at ~15 dynamic shortcuts. If a user creates more than 15, the oldest dynamic entries may be evicted by the OS, but the pinned shortcut on the home screen remains functional. The sync logic will handle this gracefully because the defensive guard prevents deletion when OS returns fewer IDs.
- **Samsung regression**: Samsung already tracks pinned shortcuts correctly, so adding dynamic registration is additive and harmless.
- **No behavioral change for users**: Shortcuts still pin the same way; this only improves the accuracy of the sync-back query.

