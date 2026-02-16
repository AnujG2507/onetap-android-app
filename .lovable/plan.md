

## Fix: Shortcut Deletion Not Syncing from Home Screen

### Root Cause

The sync logic has an overly defensive guard that was written **before** shadow dynamic registration was implemented. Now that every pinned shortcut is also registered as a dynamic shortcut, the Android `ShortcutManager` API returns accurate data. But the JS guard still blocks all deletion:

```text
syncWithHomeScreen():
  1. Gets pinned IDs from OS (e.g., 4 shortcuts)
  2. Reads local storage (e.g., 5 shortcuts — user removed one from home screen)
  3. Guard: "4 < 5 = partial OS response, skip deletion"  <-- BLOCKS FIX
  4. All 5 shortcuts remain in app
```

There is also a secondary issue: `syncWithHomeScreen` only runs on initial mount, not when the app returns to the foreground. So even after fixing the guard, the user has to fully restart the app to see the change.

A third issue: when a shortcut is unpinned from the home screen, its shadow dynamic shortcut remains registered in the system, creating orphan dynamic shortcuts that can hit the system limit (usually 15).

### Solution

#### 1. `src/hooks/useShortcuts.ts` -- Fix the sync guard logic

Replace the overly defensive guard with a smarter approach:
- **Trust the OS when shadow dynamic shortcuts are in use** (Android 8+, which is all supported versions)
- Remove the `ids.length < currentShortcuts.length` guard that blocks all deletion
- Keep the `ids.length === 0` guard as a safety net (if the API truly fails, it returns empty)
- Add sync on app resume so changes are picked up immediately

```typescript
const syncWithHomeScreen = useCallback(async () => {
  if (!Capacitor.isNativePlatform()) return;
  
  try {
    const { ids } = await ShortcutPlugin.getPinnedShortcutIds();
    const stored = localStorage.getItem(STORAGE_KEY);
    const currentShortcuts: ShortcutData[] = stored ? JSON.parse(stored) : [];
    
    console.log(`[useShortcuts] Sync: ${ids.length} pinned on OS, ${currentShortcuts.length} in storage`);
    
    // If OS returns 0 and we have shortcuts, treat as unreliable
    // (API may have failed entirely)
    if (ids.length === 0 && currentShortcuts.length > 0) {
      console.log('[useShortcuts] OS returned 0 IDs with local data present, skipping (API may be unreliable)');
      setShortcuts(currentShortcuts);
      return;
    }
    
    // Trust the OS response — shadow dynamic registration makes it reliable
    const pinnedSet = new Set(ids);
    const synced = currentShortcuts.filter(s => pinnedSet.has(s.id));
    
    if (synced.length !== currentShortcuts.length) {
      const removedCount = currentShortcuts.length - synced.length;
      console.log(`[useShortcuts] Removed ${removedCount} orphaned shortcuts`);
      saveShortcuts(synced);
    } else {
      setShortcuts(currentShortcuts);
    }
  } catch (error) {
    console.warn('[useShortcuts] Sync failed:', error);
  }
}, [saveShortcuts]);
```

#### 2. `src/hooks/useShortcuts.ts` -- Add sync on app resume

Update the existing `appStateChange` listener to also run `syncWithHomeScreen` when the app returns to the foreground (not just native usage events):

```typescript
useEffect(() => {
  if (!Capacitor.isNativePlatform()) return;

  const listener = App.addListener('appStateChange', ({ isActive }) => {
    if (isActive && initialSyncDone.current) {
      console.log('[useShortcuts] App resumed, syncing usage + home screen');
      syncNativeUsageEvents();
      syncWithHomeScreen();  // <-- NEW: also sync shortcut state
    }
  });

  return () => { listener.then(l => l.remove()); };
}, [syncNativeUsageEvents, syncWithHomeScreen]);
```

#### 3. Native: Clean up orphaned dynamic shortcuts

**File: `native/android/app/src/main/java/app/onetap/access/plugins/ShortcutPlugin.java`** in `getPinnedShortcutIds`:

After computing the pinned set, remove any dynamic shortcuts that are no longer pinned (orphan cleanup):

```java
// Clean up orphaned dynamic shortcuts (dynamic but no longer pinned)
List<String> orphanDynamicIds = new ArrayList<>();
for (ShortcutInfo dynInfo : dynamicShortcuts) {
    if (!dynInfo.isPinned()) {
        orphanDynamicIds.add(dynInfo.getId());
    }
}
if (!orphanDynamicIds.isEmpty()) {
    manager.removeDynamicShortcuts(orphanDynamicIds);
    Log.d("ShortcutPlugin", "Cleaned up " + orphanDynamicIds.size() + " orphaned dynamic shortcuts");
}
```

This prevents hitting Android's dynamic shortcut limit (typically 15) over time.

### How It Works After the Fix

```text
User removes shortcut from home screen:
  1. Android unpins the shortcut (isPinned=false, isDynamic=true)
  2. User opens the app (or it resumes)
  3. syncWithHomeScreen runs
  4. getPinnedShortcutIds returns 4 IDs (the removed one is excluded)
     - Also cleans up the orphaned dynamic shortcut
  5. JS filters local shortcuts: keeps only the 4 that match
  6. Saves updated list -- shortcut disappears from the app
```

### Android Version Compatibility

| Android Version | API Used | Shadow Dynamic | Sync Reliable? |
|---|---|---|---|
| 8.0-10 (API 26-29) | `getPinnedShortcuts()` | Yes | Yes -- dynamic registration makes tracking reliable |
| 11 (API 30) | `getShortcuts(FLAG_MATCH_PINNED)` | Yes | Yes |
| 12-15 (API 31-35) | `getShortcuts(FLAG_MATCH_PINNED)` | Yes | Yes -- `isPinned()` accurately reflects unpin |

### Summary of Changes

| File | Change |
|---|---|
| `src/hooks/useShortcuts.ts` | Remove overly defensive sync guard, trust OS response, add `syncWithHomeScreen` on app resume |
| `ShortcutPlugin.java` (`getPinnedShortcutIds`) | Clean up orphaned dynamic shortcuts that are no longer pinned |

