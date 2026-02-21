

## Reduce MIN_SYNC_INTERVAL Debounce

### Change

**File: `src/hooks/useShortcuts.ts` (line ~56)**

Reduce `MIN_SYNC_INTERVAL` from 5000ms to 2000ms for faster foreground syncs while still preventing rapid-fire duplicate syncs on OEM devices (Samsung split-screen, notification shade toggles).

```text
BEFORE: const MIN_SYNC_INTERVAL = 5000;
AFTER:  const MIN_SYNC_INTERVAL = 2000;
```

2000ms strikes a good balance -- fast enough that foreground syncs feel responsive, but still guards against the rapid `appStateChange` events some OEM launchers fire in quick succession.

