

# Simplify: Trust the OS, Remove All Guards

## Philosophy

The user's position is clear: **removing a shortcut from the home screen means the user wants it deleted**. The OS API should be trusted. No guards, no thresholds, no caps.

## What Changes

### File: `src/hooks/useShortcuts.ts`

Replace the entire `syncWithHomeScreen` body (lines 51-120) with straightforward logic:

1. Ask OS for pinned shortcut IDs
2. Build confirmed set from OS pinned IDs + recently created IDs (keep race protection for brand-new shortcuts only)
3. Filter localStorage to only keep confirmed shortcuts
4. Save the result -- no guards, no caps, no skip conditions

The new logic will be:

```typescript
const syncWithHomeScreen = useCallback(async () => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { ids, recentlyCreatedIds } = await ShortcutPlugin.getPinnedShortcutIds();
    const stored = localStorage.getItem(STORAGE_KEY);
    const currentShortcuts: ShortcutData[] = stored ? JSON.parse(stored) : [];

    if (currentShortcuts.length === 0) return;

    // Recently created shortcuts get race protection (OS may not report them yet)
    const confirmed = new Set([...ids, ...recentlyCreatedIds]);

    // Trust the OS: keep only shortcuts that are confirmed on home screen
    const synced = currentShortcuts.filter(s => confirmed.has(s.id));

    if (synced.length !== currentShortcuts.length) {
      const removedCount = currentShortcuts.length - synced.length;
      console.log(`[useShortcuts] Removed ${removedCount} shortcuts not found on home screen`);
      saveShortcuts(synced);
    } else {
      setShortcuts(currentShortcuts);
    }
  } catch (error) {
    console.warn('[useShortcuts] Sync failed:', error);
  }
}, [saveShortcuts]);
```

### What's removed

- Zero-ID guard (the "OS returned 0, skip sync" block) -- gone
- Partial-zero guard (the "cap deletions at 50%" block) -- gone
- Registry cleanup call -- gone (unnecessary complexity)
- All OEM-specific workarounds -- gone

### What's kept

- `recentlyCreatedIds` race protection -- a shortcut created 2 seconds ago may not yet appear in OS query, so we still trust those
- Basic error handling with try/catch
- The rest of the hook (create, delete, update, usage tracking) is untouched

### No other files changed

