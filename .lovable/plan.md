
# Fix Shortcut Sync on Android 12+

## Problem Analysis

The "My Access Points" sync functionality is broken on Android 12 (API 31+) because the native `ShortcutManager.getPinnedShortcuts()` API returns an empty list for shortcuts created using `requestPinShortcut()` alone.

### Root Cause

On Android 12+, the behavior of `getPinnedShortcuts()` changed:
- It only returns shortcuts that are **both** pinned on the home screen **AND** registered with the ShortcutManager as dynamic or manifest shortcuts
- The current implementation creates "orphaned" pinned shortcuts that exist on the home screen but aren't tracked in the ShortcutManager's registry
- This causes `getPinnedShortcutIds()` to always return an empty array

### Current Safety Behavior

The JavaScript sync logic has a safety check (lines 60-63 in `useShortcuts.ts`):
```javascript
if (ids.length === 0 && currentShortcuts.length > 0) {
  console.log('[useShortcuts] No pinned shortcuts returned, skipping sync');
  return;
}
```

This correctly prevents mass deletion but means sync never works on Android 12.

---

## Solution

Modify the native shortcut creation flow to **register shortcuts as dynamic shortcuts** before pinning them. This ensures they appear in `getPinnedShortcuts()` on all Android versions.

### Technical Changes

#### 1. Modify `createPinnedShortcut()` in ShortcutPlugin.java

Before calling `requestPinShortcut()`, first add the shortcut as a dynamic shortcut:

```java
// Add as dynamic shortcut first (makes it trackable by getPinnedShortcuts)
List<ShortcutInfo> dynamicShortcuts = new ArrayList<>(shortcutManager.getDynamicShortcuts());
dynamicShortcuts.add(shortcutInfo);

// Enforce the 15-shortcut limit by removing oldest
int maxShortcuts = shortcutManager.getMaxShortcutCountPerActivity();
while (dynamicShortcuts.size() > maxShortcuts) {
    dynamicShortcuts.remove(0);
}

shortcutManager.setDynamicShortcuts(dynamicShortcuts);

// Then request pinning
boolean requested = shortcutManager.requestPinShortcut(finalShortcutInfo, null);
```

#### 2. Update `disablePinnedShortcut()` in ShortcutPlugin.java

Also remove from dynamic shortcuts when disabling:

```java
// Remove from dynamic shortcuts list
shortcutManager.removeDynamicShortcuts(Collections.singletonList(shortcutId));

// Disable the pinned shortcut
shortcutManager.disableShortcuts(Collections.singletonList(shortcutId), "Deleted from app");
```

#### 3. Keep the Safety Check in useShortcuts.ts

The existing safety check (skip sync when native returns empty but local has shortcuts) remains valuable for edge cases and backward compatibility. No changes needed there.

---

## Files to Modify

| File | Change |
|------|--------|
| `native/android/app/src/main/java/app/onetap/shortcuts/plugins/ShortcutPlugin.java` | Add shortcuts as dynamic before pinning; remove from dynamic when disabling |

---

## Testing Considerations

1. **Android 12 Device/Emulator Required**: Must test on API 31+ device
2. **Create shortcut → Check My Access Points**: Shortcut should appear
3. **Remove from home screen → Press sync button**: Should remove from list
4. **Shortcut limit**: Android allows max 15 dynamic shortcuts per activity - the solution handles overflow

---

## Alternative Considered (Not Recommended)

An alternative would be to maintain a separate tracking mechanism in SharedPreferences for all created shortcuts, bypassing `getPinnedShortcuts()` entirely. However, this:
- Would create sync drift if users remove shortcuts from home screen
- Requires more complex reconciliation logic
- Doesn't solve the fundamental Android API limitation

The dynamic shortcut registration approach is cleaner and follows Android's intended architecture.
