

# Plan: Fix Home Screen Sync to Work Reactively

## Problem Summary

The "My Shortcuts" list only syncs with the Android home screen on app restart. The sync button and shortcut creation don't trigger proper reloads because:

1. **Multiple hook instances don't share state** - `useShortcuts()` is called independently in `AccessFlow.tsx`, `ShortcutsList.tsx`, and `Index.tsx`. Each creates its own `useState` initialized from localStorage, but they don't sync when another instance writes.

2. **`syncWithHomeScreen` reads stale state** - The function uses its closure's `shortcuts` array instead of reading fresh data from localStorage.

3. **No event-based sync between components** - When `AccessFlow` creates a shortcut, `ShortcutsList` doesn't know about it until the page is fully reloaded.

## Technical Root Cause

```
AccessFlow               ShortcutsList              Index
    |                         |                        |
useShortcuts()           useShortcuts()          useShortcuts()
    |                         |                        |
[state: [A, B]]         [state: [A, B]]          [state: [A, B]]
    |                         |                        |
createShortcut(C)             |                        |
    |                         |                        |
localStorage: [A, B, C]       |                        |
[state: [A, B, C]] ✓    [state: [A, B]] ✗       [state: [A, B]] ✗
```

## Solution

### 1. Add Custom Event Broadcasting

When shortcuts are modified, dispatch a custom event so all hook instances can refresh their state from localStorage.

### 2. Add Event Listener in Hook

Each hook instance listens for the custom event and reloads from localStorage when fired.

### 3. Fix `syncWithHomeScreen` to Read Fresh Data

Instead of using the closure's `shortcuts` state, read directly from localStorage to ensure we have the latest data.

### 4. Emit Events After Shortcut Creation

After a shortcut is created in `AccessFlow`, emit the event so `ShortcutsList` updates immediately.

## File Changes

### File: `src/hooks/useShortcuts.ts`

#### Change 1: Add event broadcasting in `saveShortcuts`

```typescript
// Lines 36-42 - Enhanced saveShortcuts with event dispatch
const saveShortcuts = useCallback((data: ShortcutData[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  setShortcuts(data);
  
  // Sync to Android widgets
  syncToWidgets(data);
  
  // Broadcast change to other hook instances
  window.dispatchEvent(new CustomEvent('shortcuts-changed', { detail: data }));
}, [syncToWidgets]);
```

#### Change 2: Add listener for cross-instance sync

```typescript
// After line 141 (after initial sync effect) - Add new effect to listen for changes
useEffect(() => {
  const handleShortcutsChanged = (event: CustomEvent<ShortcutData[]>) => {
    // Update local state from event payload (avoids re-reading localStorage)
    setShortcuts(event.detail);
  };

  window.addEventListener('shortcuts-changed', handleShortcutsChanged as EventListener);
  
  return () => {
    window.removeEventListener('shortcuts-changed', handleShortcutsChanged as EventListener);
  };
}, []);
```

#### Change 3: Fix `syncWithHomeScreen` to read fresh data

```typescript
// Lines 44-71 - Fix syncWithHomeScreen to read from localStorage
const syncWithHomeScreen = useCallback(async () => {
  if (!Capacitor.isNativePlatform()) return;
  
  try {
    const { ids } = await ShortcutPlugin.getPinnedShortcutIds();
    
    // Read fresh data from localStorage instead of stale closure state
    const stored = localStorage.getItem(STORAGE_KEY);
    const currentShortcuts: ShortcutData[] = stored ? JSON.parse(stored) : [];
    
    // If no pinned shortcuts returned (empty array), skip sync
    if (ids.length === 0 && currentShortcuts.length > 0) {
      console.log('[useShortcuts] No pinned shortcuts returned, skipping sync');
      return;
    }
    
    const pinnedSet = new Set(ids);
    
    // Keep only shortcuts that are still pinned on home screen
    const synced = currentShortcuts.filter(s => pinnedSet.has(s.id));
    
    if (synced.length !== currentShortcuts.length) {
      const removedCount = currentShortcuts.length - synced.length;
      console.log(`[useShortcuts] Synced with home screen, removed ${removedCount} orphaned shortcuts`);
      saveShortcuts(synced);
    } else {
      // Even if no orphans removed, update state from localStorage to pick up any new shortcuts
      setShortcuts(currentShortcuts);
    }
  } catch (error) {
    console.warn('[useShortcuts] Failed to sync with home screen:', error);
  }
}, [saveShortcuts]); // Removed `shortcuts` dependency - now reads fresh from localStorage
```

#### Change 4: Add `refreshFromStorage` function for manual refresh

```typescript
// Add new function for explicitly refreshing state from storage
const refreshFromStorage = useCallback(() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const data: ShortcutData[] = stored ? JSON.parse(stored) : [];
    setShortcuts(data);
    return data;
  } catch {
    return [];
  }
}, []);

// Return it in the hook's return object
return {
  shortcuts,
  createShortcut,
  createContactShortcut,
  deleteShortcut,
  incrementUsage,
  updateShortcut,
  getShortcut,
  syncWithHomeScreen,
  refreshFromStorage, // New
};
```

### File: `src/components/ShortcutsList.tsx`

#### Change 1: Use refreshFromStorage in manual refresh handler

```typescript
// Line 258 - Add refreshFromStorage to destructured values
const { shortcuts, deleteShortcut, updateShortcut, incrementUsage, syncWithHomeScreen, refreshFromStorage } = useShortcuts();

// Lines 350-358 - Enhanced manual refresh handler
const handleManualRefresh = useCallback(async () => {
  setIsSyncing(true);
  try {
    // First refresh from localStorage to pick up any new shortcuts from other components
    refreshFromStorage();
    // Then sync with home screen to remove orphans
    await syncWithHomeScreen();
  } finally {
    setTimeout(() => setIsSyncing(false), 500);
  }
}, [refreshFromStorage, syncWithHomeScreen]);
```

## Summary of Changes

| File | Change | Purpose |
|------|--------|---------|
| `src/hooks/useShortcuts.ts` | Add `shortcuts-changed` event dispatch | Notify other hook instances of changes |
| `src/hooks/useShortcuts.ts` | Add event listener for `shortcuts-changed` | React to changes from other instances |
| `src/hooks/useShortcuts.ts` | Fix `syncWithHomeScreen` to read fresh data | Avoid stale closure state |
| `src/hooks/useShortcuts.ts` | Add `refreshFromStorage` function | Manual state refresh capability |
| `src/components/ShortcutsList.tsx` | Use `refreshFromStorage` in sync handler | Ensure sync button gets latest data |

## Testing Checklist

1. **Create a shortcut** from the Access flow, then immediately open "My Shortcuts" - the new shortcut should appear without app restart
2. **Tap the sync button** in "My Shortcuts" - verify it shows the spinner and updates the list
3. **Delete a shortcut** from the home screen, then tap sync - verify it's removed from the list
4. **Create multiple shortcuts** in succession, then open list - all should appear
5. **Test on app resume** - create shortcut, background app, return, open list - shortcut should be there

