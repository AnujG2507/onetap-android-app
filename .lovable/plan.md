

## Fix: Re-add to Home Screen Not Pinning New Shortcut

### Root Cause

When re-adding a shortcut to the home screen, the flow is:
1. `disablePinnedShortcut(id)` -- calls `ShortcutManager.disableShortcuts([id])`, marking the ID as disabled
2. `createPinnedShortcut(id, ...)` -- calls `ShortcutManager.requestPinShortcut(info)` with the same ID

**Android rejects `requestPinShortcut` for shortcut IDs that are in a disabled state.** The disable step marks the ID as unusable, and the create step never clears that state. So the old shortcut is removed but the new one silently fails to pin.

### Fix

**File: `native/android/app/src/main/java/app/onetap/access/plugins/ShortcutPlugin.java`**

Add a `ShortcutManager.enableShortcuts()` call just before `requestPinShortcut` in two places (the text shortcut synchronous path and the general background-thread path). This re-enables the ID if it was previously disabled, making the pin request succeed. If the ID was never disabled, `enableShortcuts` is a harmless no-op.

**Synchronous text shortcut path (~line 352):** Before `sm.requestPinShortcut(textShortcutInfo, ...)`, add:
```java
try {
    sm.enableShortcuts(Collections.singletonList(id));
} catch (Exception e) {
    // Harmless if shortcut was never disabled
}
```

**Background-thread general path (~line 581):** Before `shortcutManager.requestPinShortcut(finalShortcutInfo, ...)`, add the same enable call with `finalId`.

### No JS Changes Needed

The JS-side flow (`disablePinnedShortcut` then `createPinnedShortcut`) is correct in concept. The problem is purely in the native layer not clearing the disabled state before re-pinning.

### After Pulling

Run `npx cap sync` after pulling the changes.

