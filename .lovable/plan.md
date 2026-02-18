

# Remaining Loopholes in Sync Logic After Recent Changes

## Issues Found

### Issue 1 (Critical): Early-Return Paths in `getPinnedShortcutIds` Missing New Fields

**Location**: `ShortcutPlugin.java` lines 4188-4214

Three early-return paths (API < 31, context is null, ShortcutManager is null) return a `JSObject` with only `ids` -- they are **missing** `registeredIds`, `recentlyCreatedIds`, `dynamicCount`, `maxDynamic`, and `manufacturer`.

When the JS side destructures `{ ids, registeredIds, recentlyCreatedIds, dynamicCount }`, the missing fields become `undefined`. Specifically:
- `registeredIds` becomes `undefined`, and `registeredIds.length` throws a **runtime crash** (`Cannot read properties of undefined`)
- This kills the entire sync function silently

**Fix**: Add all six fields to every early-return path, mirroring the error/catch block pattern already used at line 4304.

---

### Issue 2 (Medium): Orphan Cleanup Removes Recently-Created Shadow Registrations

**Location**: `ShortcutPlugin.java` lines 4259-4269

The orphan cleanup in `getPinnedShortcutIds` removes any dynamic shortcut where `isPinned() == false`. But during the 1-5 second race window after `requestPinShortcut()`, a newly-created shortcut is dynamic but `isPinned()` has not yet flipped to `true`. The orphan cleanup **destroys its shadow registration**, making it invisible to the next sync.

The `recentlyCreatedIds` cooldown protects it from being deleted from localStorage, but the shadow itself is gone -- meaning on subsequent syncs after the cooldown expires, the shortcut will be deleted.

**Fix**: Cross-reference with the creation registry before classifying a dynamic shortcut as orphaned. If its ID exists in the registry and was created within the cooldown period, skip it.

---

### Issue 3 (Medium): Registry Never Self-Cleans

The creation registry (`shortcut_creation_registry` SharedPreferences) grows forever. Entries are added on creation and removed on explicit delete, but if a user removes a shortcut from the home screen (drag to Remove), the registry entry is **never cleaned up**. Over months/years, the registry accumulates hundreds of stale IDs.

This causes the zero-ID guard (`registeredIds.length > 3`) to become permanently stuck -- even if the user has removed all shortcuts, the registry will always have >3 entries, so sync will never proceed.

**Fix**: After a successful sync where the OS returned >0 pinned IDs, prune registry entries that are NOT in the OS pinned set AND are older than the cooldown period. This should happen in the JS layer after reconciliation.

---

### Issue 4 (Low): `updatePinnedShortcut` Does Not Update Registry Timestamp

**Location**: `ShortcutPlugin.java` lines 4522-4538

When a shortcut is updated (edit name, icon, etc.), `updatePinnedShortcut` calls `ensureDynamicShortcutSlot` + `addDynamicShortcuts` but does NOT call `registerShortcutCreation` to refresh the timestamp. If the update happens when the original creation timestamp is ancient, the eviction logic may immediately evict this shortcut's shadow (since it has the oldest timestamp).

**Fix**: Call `registerShortcutCreation(shortcutId)` in `updatePinnedShortcut` after successful shadow re-registration to refresh the timestamp, protecting it from immediate eviction.

---

### Issue 5 (Low): Syntax Issue — Misplaced Closing Brace

**Location**: `ShortcutPlugin.java` line 4865

There is a stray `}` that closes `clearCrashLogs` at line 4864, then another `}` at line 4865 which appears to close the class prematurely. The pool management methods at lines 4867-4949 are **outside the class body**. This will cause a **compilation error**.

**Fix**: Remove the extra `}` at line 4865 so the pool management methods remain inside the class.

---

## Implementation Plan

### Step 1: Fix early-return paths in `getPinnedShortcutIds`
- Add `registeredIds`, `recentlyCreatedIds`, `dynamicCount`, `maxDynamic`, `manufacturer` to all three early-return blocks (API < 31, null context, null manager)

### Step 2: Protect recently-created shortcuts from orphan cleanup
- In the orphan cleanup loop (line 4259-4269), check the creation registry timestamp before marking a dynamic shortcut as orphaned
- If the shortcut was created within `CREATION_COOLDOWN_MS`, skip it

### Step 3: Add registry self-cleaning to JS reconciliation
- After a successful sync where `ids.length > 0`, call a new native method `cleanupRegistry` that removes entries not in the pinned set and older than the cooldown
- Alternatively, do this in JS by passing the confirmed IDs back to native

### Step 4: Refresh registry timestamp on update
- Add `registerShortcutCreation(shortcutId)` call in `updatePinnedShortcut` after successful shadow re-registration

### Step 5: Fix stray closing brace
- Remove the extra `}` at line 4865

---

## Files Modified

| File | Changes |
|------|---------|
| `ShortcutPlugin.java` | Fix 3 early-return paths in `getPinnedShortcutIds`; protect recently-created from orphan cleanup; add `cleanupRegistry` method; refresh timestamp in `updatePinnedShortcut`; fix stray brace |
| `ShortcutPlugin.ts` | Add `cleanupRegistry` method signature |
| `shortcutPluginWeb.ts` | Add `cleanupRegistry` web fallback |
| `useShortcuts.ts` | Call `cleanupRegistry` after successful sync with `ids.length > 0` |

