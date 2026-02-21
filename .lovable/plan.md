

## Remove Timer-Based Pin Dialog Check

The `verifyShortcutPinned` function in `src/hooks/useShortcuts.ts` currently has a multi-phase approach with timers that should be replaced now that PendingIntent confirmation is implemented.

### Current Flow (lines 463-544)
1. **Phase 1 (1.5s):** Wait for pin dialog to close via timeout or app state change
2. **Phase 2 (1s):** Grace period for BroadcastReceiver to fire
3. **Phase 3:** Check `checkPinConfirmed` (PendingIntent callback)
4. **Phase 4:** Fallback OS query
5. **Phase 5:** Remove shortcut if not confirmed

### New Flow
Since PendingIntent fires reliably when the user taps "Add" or drags the shortcut, we only need to:
1. Wait for the user to return to the app (via `appStateChange` to `active`, with a reasonable timeout for "Add" button taps that don't leave the app)
2. Small grace period (300ms) for the BroadcastReceiver to write to SharedPreferences
3. Check `checkPinConfirmed`
4. Fallback OS query
5. Remove if not confirmed

### Changes

**File: `src/hooks/useShortcuts.ts` (lines 463-544)**

Replace the current `verifyShortcutPinned` implementation:

- **Remove Phase 1** (the 1.5s blind timer and app state listener combo). Replace with a single listener that waits for `appStateChange(active)` with a 500ms timeout. The 500ms covers the "Add button" case where the app never leaves foreground; the listener covers the drag-and-drop case where the app goes to background.
- **Reduce Phase 2** grace period from 1000ms to 300ms -- just enough for SharedPreferences write.
- **Keep Phases 3-5** unchanged (PendingIntent check, OS fallback, cleanup).

The resulting code will look like:

```typescript
const verifyShortcutPinned = useCallback(async (id: string) => {
  if (!Capacitor.isNativePlatform()) return;

  // Wait for user to finish interacting with the pin dialog
  await new Promise<void>(resolve => {
    const timeout = setTimeout(() => { cleanup(); resolve(); }, 500);
    let listenerHandle: any = null;
    const cleanup = () => {
      clearTimeout(timeout);
      if (listenerHandle) {
        listenerHandle.then((l: any) => l.remove());
        listenerHandle = null;
      }
    };
    listenerHandle = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) { cleanup(); resolve(); }
    });
  });

  // Brief grace for BroadcastReceiver to write confirmation
  await new Promise(resolve => setTimeout(resolve, 300));

  // ... rest unchanged (checkPinConfirmed, OS fallback, cleanup)
}, [syncToWidgets]);
```

This reduces the total wait from ~2.5s to ~800ms while relying on the PendingIntent callback as the source of truth.
