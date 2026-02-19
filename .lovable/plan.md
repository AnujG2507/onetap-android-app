

# Fix: Profile Page Item Count

## Problem

The item count displayed on the Profile page only sums **saved links + scheduled actions**, but completely **ignores shortcuts** (the main data type stored in `quicklaunch_shortcuts`). It also doesn't update reactively when data changes -- it only recalculates on mount or when `user` changes.

## Solution

### 1. Include shortcuts in the count (`ProfilePage.tsx`)

Update `refreshCounts` to also read shortcuts from localStorage and include non-dormant ones in the total:

```typescript
const refreshCounts = useCallback(() => {
  try {
    const linksCount = getSavedLinks().length;
    const actionsCount = getScheduledActions().length;

    let shortcutsCount = 0;
    const stored = localStorage.getItem('quicklaunch_shortcuts');
    if (stored) {
      const shortcuts = JSON.parse(stored);
      shortcutsCount = Array.isArray(shortcuts)
        ? shortcuts.filter((s: any) => s.syncState !== 'dormant').length
        : 0;
    }

    setLocalItemCount(linksCount + actionsCount + shortcutsCount);
  } catch (error) {
    console.error('[ProfilePage] refreshCounts failed:', error);
  }
}, []);
```

### 2. Listen for data change events

Add event listeners so the count updates reactively when shortcuts, bookmarks, or scheduled actions change -- not just on mount:

```typescript
useEffect(() => {
  refreshCounts();
  setSyncStatus(getSyncStatus());

  const handleUpdate = () => {
    refreshCounts();
    setSyncStatus(getSyncStatus());
  };

  window.addEventListener('shortcuts-changed', handleUpdate);
  window.addEventListener('bookmarks-changed', handleUpdate);
  window.addEventListener('scheduled-actions-changed', handleUpdate);

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') handleUpdate();
  };
  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    window.removeEventListener('shortcuts-changed', handleUpdate);
    window.removeEventListener('bookmarks-changed', handleUpdate);
    window.removeEventListener('scheduled-actions-changed', handleUpdate);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}, [user, refreshCounts]);
```

This replaces the current `useEffect` that only runs once per `user` change and doesn't listen for data mutations.

### Summary of changes

- **File**: `src/components/ProfilePage.tsx`
  - `refreshCounts`: add shortcut counting (excluding dormant)
  - `useEffect`: add listeners for `shortcuts-changed`, `bookmarks-changed`, `scheduled-actions-changed`, and `visibilitychange`

