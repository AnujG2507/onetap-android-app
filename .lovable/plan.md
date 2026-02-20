
# Fix: Editing a Text/Checklist Access Point — Two Bugs

## What's Broken

### Bug 1 — "Save" Does Not Save Changes When `isChecklist` Flips

In `handleSave()` (line 142–234 of `ShortcutEditSheet.tsx`), the updates object only includes `textContent` and `isChecklist` **when `shortcut.type === 'text'`**:

```ts
textContent: shortcut.type === 'text' ? textContent : undefined,
isChecklist: shortcut.type === 'text' ? isChecklist : undefined,
```

This is correct and does save. However, the `hasChanges` tracking in the `useEffect` (lines 113–132) has a subtle issue — it evaluates `textChanged` as:

```ts
const textChanged = shortcut.type === 'text' && (
  textContent !== (shortcut.textContent || '') || isChecklist !== (shortcut.isChecklist || false)
);
```

This correctly detects changes so the Save button should be enabled. Looking deeper: when `isChecklist` changes from `true` (checklist) to `false` (note), the native `updatePinnedShortcut` call in `useShortcuts.updateShortcut` (line 404–422) **does** pass `isChecklist: shortcut.isChecklist`. This should work for the native side too.

**However** — the `handleReAdd` function (line 236–277) is the real culprit. It **does not include `textContent` or `isChecklist` in its `updates` object**:

```ts
const updates = {
  name,
  icon,
  quickMessages: ...,
  resumeEnabled: ...,
  // ← textContent and isChecklist are COMPLETELY MISSING
};
```

So when the user presses "Re-add to Home Screen" after converting a checklist to a note:
1. `onSave()` is called with an `updates` object that lacks `textContent` / `isChecklist`
2. The native shortcut is re-created using the **old** `shortcut` object (checklist), not the updated content
3. The home screen shortcut still launches a checklist
4. The app data may also be stale depending on timing

### Bug 2 — "Re-add to Home Screen" Does Not Delete/Disable the Old Shortcut

When the user presses "Re-add to Home Screen", `handleReAdd` calls:
1. `onSave(shortcut.id, updates)` — updates the data in localStorage
2. `onReAddToHomeScreen(updatedShortcut)` — calls `createHomeScreenShortcut()` in Index.tsx

`createHomeScreenShortcut()` calls `ShortcutPlugin.createPinnedShortcut()` which **pins a new shortcut** with the **same ID**. On Android, calling `requestPinShortcut` for an already-pinned ID with the same shortcut ID does **update** the dynamic shortcut entry — but since text shortcuts create a new pinned shortcut intent (not a dynamic one), **both the old icon and any new icon may coexist** unless the old one is explicitly disabled first.

The correct sequence should be:
1. Save changes to localStorage
2. **Disable/remove the old pinned shortcut** via `ShortcutPlugin.disablePinnedShortcut({ id })`
3. **Then** call `createHomeScreenShortcut()` to pin the new one

This matches the pattern already used in `deleteShortcut()` in `useShortcuts.ts`.

---

## Changes Required

### `src/components/ShortcutEditSheet.tsx`

**Fix 1 — Add `textContent` and `isChecklist` to `handleReAdd` updates:**

The `handleReAdd` function's `updates` object (around line 240) must include text fields for text-type shortcuts, mirroring what `handleSave` already does:

```ts
// Text content - only for text shortcuts
textContent: shortcut.type === 'text' ? textContent : undefined,
isChecklist: shortcut.type === 'text' ? isChecklist : undefined,
```

Also, the `updatedShortcut` object (line 266) must spread the full `updates` (which now includes text fields), so `onReAddToHomeScreen` receives the correct state.

**Fix 2 — Disable old shortcut before re-adding:**

The `handleReAddToHomeScreen` callback in `Index.tsx` (line 175–183) calls `createHomeScreenShortcut` directly. It needs to first call `ShortcutPlugin.disablePinnedShortcut({ id: shortcut.id })` before pinning the new one.

```ts
const handleReAddToHomeScreen = useCallback(async (shortcut: ShortcutData) => {
  // Step 1: Disable/remove the old pinned shortcut (same ID, new content)
  if (Capacitor.isNativePlatform()) {
    try {
      await ShortcutPlugin.disablePinnedShortcut({ id: shortcut.id });
    } catch (e) {
      console.warn('[Index] Failed to disable old shortcut before re-add:', e);
    }
  }
  // Step 2: Pin the new shortcut
  const success = await createHomeScreenShortcut(shortcut, {
    fileData: shortcut.thumbnailData,
    thumbnailData: shortcut.thumbnailData,
  });
  if (success) {
    toast({ title: t('shortcutAction.addedToHomeScreen', 'Added to home screen') });
  }
}, [toast, t]);
```

---

## Summary

| File | Location | Change |
|---|---|---|
| `src/components/ShortcutEditSheet.tsx` | `handleReAdd()` updates object | Add `textContent` and `isChecklist` for text shortcuts |
| `src/pages/Index.tsx` | `handleReAddToHomeScreen()` | Disable old pinned shortcut before creating new one |

No new dependencies, no database changes, no translation keys needed.
