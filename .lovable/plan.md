

## Fix: Orphaned shortcuts after dismissed pin dialog

### Root Cause

The shortcut creation flow has a timing gap:

1. `createShortcut()` saves to localStorage immediately
2. `createHomeScreenShortcut()` sends a pin request to Android
3. Android's `requestPinShortcut` API returns `true` when the launcher accepts the request -- NOT when the user confirms
4. If the user presses Back on the native pin dialog, no failure signal is sent
5. The shortcut remains in localStorage ("My Access Points") despite never being pinned
6. `syncWithHomeScreen` has a 30-second `recentlyCreatedIds` race guard that further protects these orphans from cleanup

### Solution

Add a post-pin verification step. After `createHomeScreenShortcut` returns, wait a few seconds for the pin dialog to resolve, then check if the shortcut actually exists on the home screen. If it does not, remove it from localStorage.

### Technical Details

**File: `src/hooks/useShortcuts.ts`**

Add a `verifyShortcutPinned` method that:
- Accepts a shortcut ID
- Waits ~3 seconds (enough for the pin dialog to resolve)
- Calls `getPinnedShortcutIds()`
- Checks if the ID appears in `ids` (the actual OS-reported pinned shortcuts), deliberately ignoring `recentlyCreatedIds` race protection
- If not found in `ids`, removes the shortcut from localStorage and shows an info toast
- Also calls native `cleanupRegistry` to remove the stale registry entry

Expose this method from the hook's return value.

**File: `src/components/AccessFlow.tsx`**

After every successful `createHomeScreenShortcut` call (link, file, contact, slideshow, text), call `verifyShortcutPinned(shortcut.id)` in the background (fire-and-forget). This runs the check without blocking the success screen.

There are 5 places where `createHomeScreenShortcut` is called in this file:
1. Text shortcut creation (~line 421)
2. Contact shortcut creation (~line 472)
3. File shortcut creation (~line 500)
4. Slideshow shortcut creation (~line 539)
5. Shared content shortcut (~around the same flow)

Each will get a `verifyShortcutPinned(shortcut.id)` call after the success path.

**File: `src/components/MyShortcutsContent.tsx`**

Same pattern for re-add/reconnect flows (~lines 592, 617) -- call `verifyShortcutPinned` after `createHomeScreenShortcut`.

**File: `src/pages/Index.tsx`**

Same pattern for the edit re-pin flow (~line 185).

### Verification Logic (pseudocode)

```text
verifyShortcutPinned(id):
  if not native platform: return
  wait 3 seconds
  result = getPinnedShortcutIds()
  if result.error: return (don't delete on API failure)
  if id NOT in result.ids:
    remove shortcut from localStorage
    broadcast 'shortcuts-changed'
    show info toast: "Shortcut was not added to home screen"
    cleanupRegistry([...other confirmed ids])
```

### Why 3 seconds?

- Android pin dialog is modal; user either confirms or dismisses quickly
- 3 seconds gives the launcher enough time to register the pin if confirmed
- Short enough that the user might still be on the success screen, so the toast is visible
- Does not block the UI (runs in background)

### What about the Sync button?

The existing `syncWithHomeScreen` already handles long-term cleanup (after the 30s registry window). This fix addresses the immediate gap where the shortcut appears orphaned right after creation. No changes needed to the sync button logic itself -- the verification handles the critical window.

### Files to modify

| File | Change |
|------|--------|
| `src/hooks/useShortcuts.ts` | Add `verifyShortcutPinned` method |
| `src/components/AccessFlow.tsx` | Call verify after each `createHomeScreenShortcut` |
| `src/components/MyShortcutsContent.tsx` | Call verify after re-add/reconnect pin flows |
| `src/pages/Index.tsx` | Call verify after edit re-pin flow |

