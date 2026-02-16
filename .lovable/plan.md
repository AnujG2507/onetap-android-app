

## Fix: Dynamic Shortcut Limit and Sync Logic Hardening

### Problem

Android limits dynamic shortcuts per activity to `getMaxShortcutCountPerActivity()` (typically 15, minimum 4). The current code uses `addDynamicShortcuts()` which throws `IllegalArgumentException` when the limit is reached. The exception is caught silently, so the shortcut is still pinned but its shadow dynamic registration fails.

### Why It Matters Less on Android 12+

On Android 12+, `getShortcuts(FLAG_MATCH_PINNED)` returns pinned shortcuts **regardless of dynamic registration**. So even if the dynamic shadow fails, sync still works. However:
- Failed `addDynamicShortcuts` calls generate unnecessary exceptions in logs
- The orphan cleanup logic depends on `getDynamicShortcuts()` to find unpinned shadows
- It's messy and will confuse future debugging

### Solution

#### 1. Replace `addDynamicShortcuts` with `pushDynamicShortcuts` (Android 12+ only)

**File: `ShortcutPlugin.java`** -- in the shortcut creation flow (~line 435) and update flow (~line 4421)

`pushDynamicShortcuts()` (API 30+) automatically evicts the least-recently-used dynamic shortcut when the limit is reached. Since the app targets Android 12+ (API 31+), this is always available.

```java
// Before (line 435):
shortcutManager.addDynamicShortcuts(Collections.singletonList(finalShortcutInfo));

// After:
shortcutManager.pushDynamicShortcuts(Collections.singletonList(finalShortcutInfo));
```

Same change at line 4421 for the update flow.

#### 2. Remove the Android 8-10 code path in `getPinnedShortcutIds`

**File: `ShortcutPlugin.java`** -- lines 4103-4142

Since the app only supports Android 12+, the legacy `getPinnedShortcuts()` code path (API 26-29) and the API version check are unnecessary. Simplify to always use `getShortcuts(FLAG_MATCH_PINNED)`.

```java
// Before: two branches for API < 30 and API >= 30
// After: always use getShortcuts(FLAG_MATCH_PINNED), with early return if API < 31

if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
    // App requires Android 12+ (API 31), this shouldn't happen
    JSObject result = new JSObject();
    result.put("ids", new JSArray());
    call.resolve(result);
    return;
}

List<ShortcutInfo> pinnedShortcuts = manager.getShortcuts(ShortcutManager.FLAG_MATCH_PINNED);
```

#### 3. Sync logic in `useShortcuts.ts` -- already correct

The current JS sync logic (after the last fix) is sound for Android 12+:
- Trusts the OS response from `getShortcuts(FLAG_MATCH_PINNED)` which accurately reflects pin state
- Keeps the `ids.length === 0` safety net for API failures
- Syncs on app resume via `appStateChange` listener
- Orphan cleanup removes stale dynamic shortcuts

No JS changes needed.

### Summary of Changes

| File | Change |
|---|---|
| `ShortcutPlugin.java` (shortcut creation, ~line 435) | Replace `addDynamicShortcuts` with `pushDynamicShortcuts` to avoid limit exceptions |
| `ShortcutPlugin.java` (shortcut update, ~line 4421) | Same: `addDynamicShortcuts` to `pushDynamicShortcuts` |
| `ShortcutPlugin.java` (`getPinnedShortcutIds`, ~line 4103-4142) | Remove legacy Android 8-10 code path, always use `getShortcuts(FLAG_MATCH_PINNED)` with API 31+ guard |

### No Practical Shortcut Limit

With `pushDynamicShortcuts`:
- Users can create **unlimited pinned shortcuts** (pinning has no system limit)
- The dynamic shadow registration auto-evicts the oldest when the ~15 limit is hit
- Sync uses `FLAG_MATCH_PINNED` which tracks pinned status independently of dynamic registration
- Orphan cleanup still works: removes dynamic shortcuts whose pinned counterpart was removed from home screen

