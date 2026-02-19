

# Fix: Auto-Sync Deletes Shortcuts on Samsung When OS Returns 0 Pinned IDs

## Root Cause

The sync logic in `syncWithHomeScreen` (useShortcuts.ts) has a **fatal threshold bug** in the zero-ID guard:

```text
Samsung OS returns 0 pinned IDs (intermittent One UI bug)
  -> registeredIds.length is 1 (you have 1 shortcut)
  -> 1 <= 3 threshold
  -> Guard says: "plausible user removed all manually"
  -> Proceeds to filter localStorage against empty confirmed set
  -> Shortcut deleted from localStorage
```

The `registeredIds.length > 3` guard was designed to catch OEM API failures, but it only protects users with 4+ shortcuts. Users with 1-3 shortcuts are completely unprotected.

Additionally, a second issue: even when sync runs correctly, `cleanupRegistry` prunes the registry entry for the shortcut (since OS confirmed it as pinned, this is fine), but on the NEXT app resume, if Samsung returns 0 again, the registry is now empty (0 entries, still <=3), and the shortcut is deleted.

## Fix Strategy

Replace the fixed threshold (`> 3`) with a smarter guard that compares the OS result against localStorage count rather than registry count. The principle: **never trust a sudden drop to zero**.

### Rule Changes

| Scenario | Old Behavior | New Behavior |
|----------|-------------|--------------|
| OS=0, localStorage=1, registry=1 | Deletes shortcut | Skips sync (sudden zero) |
| OS=0, localStorage=5, registry=8 | Skips sync (registry>3) | Skips sync (sudden zero) |
| OS=0, localStorage=0 | No-op (nothing to reconcile) | No-op |
| OS=2, localStorage=5 | Removes 3 shortcuts | Removes 3 shortcuts (unchanged) |
| OS=1, localStorage=2 | Removes 1 shortcut | Removes 1 shortcut (unchanged) |

### The Core Fix

**When OS returns 0 pinned IDs but localStorage has shortcuts, ALWAYS skip sync.** Users cannot remove all shortcuts simultaneously without also deleting them from the app. The only scenario where OS=0 and localStorage>0 is an OS API failure.

This is safe because:
- Deleting a shortcut from the app calls `disablePinnedShortcut` which removes it from localStorage directly
- Removing a shortcut from the home screen (drag to Remove) does NOT delete it from localStorage -- the app still shows it
- Therefore OS=0 + localStorage>0 always means the OS lied

## Implementation

### File: `src/hooks/useShortcuts.ts`

Replace the zero-ID guard block (lines 67-82) with:

```typescript
// Zero-ID guard: if OS says 0 pinned but we have shortcuts, always skip.
// Rationale: the only way to reach OS=0 + localStorage>0 is an OS API failure
// (Samsung One UI, Xiaomi MIUI). Legitimate deletions go through deleteShortcut()
// which removes from localStorage directly, so localStorage would already be 0.
if (ids.length === 0 && currentShortcuts.length > 0) {
  if (dynamicCount < 0) {
    console.log('[useShortcuts] OS returned error state, skipping sync');
    setShortcuts(currentShortcuts);
    return;
  }
  console.log('[useShortcuts] OS returned 0 IDs but localStorage has ' + 
    currentShortcuts.length + ' shortcuts — skipping sync (OEM protection)');
  setShortcuts(currentShortcuts);
  return;
}
```

Also add a **partial-zero guard**: if OS returns significantly fewer IDs than localStorage in a single sync, cap the maximum deletions to prevent mass wipes:

```typescript
// Partial-zero guard: cap deletions per sync to 50% of shortcuts (rounded up).
// Prevents mass deletion from intermittent OS failures that return partial results.
const maxDeletions = Math.ceil(currentShortcuts.length / 2);
if (synced.length < currentShortcuts.length - maxDeletions) {
  console.log('[useShortcuts] Sync would delete too many shortcuts (' + 
    (currentShortcuts.length - synced.length) + '/' + currentShortcuts.length + 
    '), capping at ' + maxDeletions);
  // Keep the most recently created shortcuts that OS didn't confirm
  const unconfirmed = currentShortcuts
    .filter(s => !confirmed.has(s.id))
    .sort((a, b) => b.createdAt - a.createdAt);
  const toKeep = unconfirmed.slice(0, unconfirmed.length - maxDeletions);
  const toKeepIds = new Set(toKeep.map(s => s.id));
  synced = currentShortcuts.filter(s => confirmed.has(s.id) || toKeepIds.has(s.id));
}
```

### File: No other files changed

Only `useShortcuts.ts` needs modification. The native Java code is correct -- the problem is entirely in how the JS interprets the native response.

## Summary

- Remove the `registeredIds.length > 3` threshold -- it's fundamentally flawed for small shortcut counts
- Always skip sync when OS returns 0 and localStorage has shortcuts
- Add a partial-zero guard to cap maximum deletions per sync cycle at 50%
- This makes sync bulletproof against Samsung One UI's intermittent `getShortcuts()` failures

