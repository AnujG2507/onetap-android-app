
## Bug: Re-Add to Home Screen Disables Old Shortcut But Never Pins New One

### Root Cause — Double Native Operation Conflict

When the user presses "Re-Add to Home Screen" in the edit sheet, `handleReAdd` runs this sequence:

```
1. await onSave(id, updates)
       └─ updateShortcut() in useShortcuts
              └─ ShortcutPlugin.updatePinnedShortcut()   ← modifies existing home screen shortcut
2. onReAddToHomeScreen(updatedShortcut)
       └─ ShortcutPlugin.disablePinnedShortcut()         ← disables the shortcut just updated
       └─ createHomeScreenShortcut()                      ← tries to pin a new one
```

Step 1 calls `updatePinnedShortcut`, which on the native side updates the existing shortcut's intent and label in place — the shortcut stays live on the home screen.

Step 2 then immediately calls `disablePinnedShortcut` on that same shortcut. This correctly disables it (which the user sees — the old one goes away). But then `createHomeScreenShortcut` calls `ShortcutPlugin.createPinnedShortcut`, which asks Android to show the "Add to home screen" pin dialog.

**Android silently drops the pin dialog in this case** because:
- The shortcut was **just disabled** (in the same process/session), and Android's `ShortcutManager` has rate limiting and state guards that suppress a pin request for a shortcut that was disabled moments ago with the same ID.
- The net result: `disablePinnedShortcut` succeeds (old icon gone) but `createPinnedShortcut` silently does nothing (no popup, no new icon).

### The Fix

The `handleReAdd` path must **skip the `updatePinnedShortcut` call** that `onSave`/`updateShortcut` makes internally, because the full re-pin flow (disable + createPinnedShortcut) replaces it entirely.

There are two clean options:

**Option A — Skip the native update in `updateShortcut` when a re-add is about to follow**

Pass a flag `skipNativeUpdate: true` to `onSave`, and in `updateShortcut`, if this flag is set, only update localStorage and skip the `ShortcutPlugin.updatePinnedShortcut` call. Then the disable + createPinnedShortcut in `handleReAddToHomeScreen` runs cleanly without conflicting with a prior native update.

**Option B — Split save-to-storage from native update entirely**

Extract a `saveToStorageOnly()` helper in `useShortcuts` that writes to localStorage without calling any native plugin methods. `handleReAdd` in `ShortcutEditSheet` calls `saveToStorageOnly` first, then `onReAddToHomeScreen`. This is cleaner architecturally.

**Chosen approach: Option A** — minimal change, lowest risk. Add an optional `skipNativeUpdate` field to the updates parameter type, check it in `updateShortcut` before calling `ShortcutPlugin.updatePinnedShortcut`, and pass it from `handleReAdd`.

---

### Changes Required

#### File 1: `src/hooks/useShortcuts.ts`

In `updateShortcut`, check for a new optional flag on the updates object. If `skipNativeUpdate` is true, skip the `ShortcutPlugin.updatePinnedShortcut` call entirely and return `{ success: true }`.

```ts
// Add skipNativeUpdate as an optional field in the updates parameter
const updateShortcut = useCallback(async (
  id: string,
  updates: Partial<Pick<ShortcutData, ...> & { skipNativeUpdate?: boolean }>
): Promise<{ success: boolean; nativeUpdateFailed?: boolean }> => {
  // Strip skipNativeUpdate before saving to localStorage
  const { skipNativeUpdate, ...storageUpdates } = updates;
  
  const updated = shortcuts.map(s => 
    s.id === id ? { ...s, ...storageUpdates } : s
  );
  saveShortcuts(updated);

  if (Capacitor.isNativePlatform() && !skipNativeUpdate) {
    // ... existing updatePinnedShortcut logic
  }
  
  return { success: true };
}, [...]);
```

The `skipNativeUpdate` flag must also be excluded from the `Pick<ShortcutData, ...>` type — it should be added as an additional key outside the Pick, so it doesn't pollute `ShortcutData`.

The return type of `updateShortcut` stays the same. The `onSave` prop type in `ShortcutEditSheet` and `MyShortcutsContent` passes through to `updateShortcut`, so the additional optional key needs to be accepted there too.

#### File 2: `src/components/ShortcutEditSheet.tsx`

In `handleReAdd`, pass `skipNativeUpdate: true` in the updates object when calling `onSave`:

```ts
const handleReAdd = useCallback(async () => {
  if (!shortcut || !onReAddToHomeScreen) return;

  const updates = {
    name,
    icon,
    quickMessages: ...,
    resumeEnabled: ...,
    textContent: ...,
    isChecklist: ...,
    // ... other existing update fields
    skipNativeUpdate: true,  // ← NEW: skip updatePinnedShortcut, re-add will handle it
  };

  // Save to storage only (no native update)
  await onSave(shortcut.id, updates);
  
  // Then do the full disable + re-pin with fresh data
  onReAddToHomeScreen(updatedShortcut);
  onClose();
}, [...]);
```

This ensures the sequence is:
```
1. await onSave(id, { ...updates, skipNativeUpdate: true })
       └─ updateShortcut(): writes to localStorage only, skips updatePinnedShortcut
2. onReAddToHomeScreen(updatedShortcut)
       └─ disablePinnedShortcut()   ← cleanly disables the old, unmodified shortcut
       └─ createHomeScreenShortcut() ← Android shows pin dialog normally ✓
```

The `onSave` prop type needs to accept the extended updates object. Since `updateShortcut` in `useShortcuts` already accepts `Partial<Pick<ShortcutData, ...>>`, the cleanest approach is to widen the type inline in the prop definition.

#### File 3: `src/types/shortcut.ts` (check only)

Verify `skipNativeUpdate` does not need to be added to `ShortcutData` — it should NOT be added there. It is a transient instruction flag only, not persistent data.

---

### Summary Table

| Step | Before (broken) | After (fixed) |
|---|---|---|
| User presses "Re-Add to Home Screen" | `handleReAdd` calls `onSave` → `updatePinnedShortcut` runs | `handleReAdd` calls `onSave` with `skipNativeUpdate: true` → localStorage only |
| Then `onReAddToHomeScreen` runs | `disablePinnedShortcut` disables the shortcut that was just updated | `disablePinnedShortcut` disables the original, untouched shortcut |
| Then `createHomeScreenShortcut` runs | Android silently drops the pin request (conflict with recent disable) | Android shows the pin dialog normally |
| Result | Old icon gone, no new icon, no popup | Old icon gone, pin dialog appears, new icon placed |

**Files changed:** `src/hooks/useShortcuts.ts`, `src/components/ShortcutEditSheet.tsx`
