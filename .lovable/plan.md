

## Add Startup Cleanup for Stale Preview Entries

### What and Why

If the app is killed while viewing an image preview, a temporary `__preview_image__` entry can remain in `localStorage`. This is harmless but untidy. A one-time cleanup on app startup ensures it never persists.

### Implementation

**File: `src/App.tsx`**

Add a small cleanup inside the existing `App` component (or at module level before the component). On mount, read `quicklaunch_shortcuts` from `localStorage`, filter out any entry with `id === '__preview_image__'`, and write it back if a stale entry was found.

This will be a single `useEffect` with an empty dependency array inside the `App` function, running once on startup. Roughly 10 lines of code:

```text
useEffect(() => {
  try {
    const stored = localStorage.getItem('quicklaunch_shortcuts');
    if (stored) {
      const shortcuts = JSON.parse(stored);
      const filtered = shortcuts.filter(s => s.id !== '__preview_image__');
      if (filtered.length !== shortcuts.length) {
        localStorage.setItem('quicklaunch_shortcuts', JSON.stringify(filtered));
      }
    }
  } catch (_) {}
}, []);
```

No other files need changes.
