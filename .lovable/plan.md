

# Deep Audit and Redesign: Home Screen Auto-Sync Logic (Android 12+)

## 1. How It Works Today

### Source of Truth
- **App storage**: localStorage key `quicklaunch_shortcuts` (an array of `ShortcutData` objects)
- **Android OS**: `ShortcutManager` tracks pinned and dynamic shortcuts

### Sync Triggers (Current)
| Trigger | Where | What Happens |
|---------|-------|-------------|
| App mount | `useShortcuts.ts` line 146 | Calls `syncWithHomeScreen()` |
| App resume (foreground) | `useShortcuts.ts` line 176 | Calls `syncWithHomeScreen()` on `appStateChange` |
| Delete from app | `useShortcuts.ts` line 292 | Calls `disablePinnedShortcut()` then removes from localStorage |

### Shadow Dynamic Registration
When a shortcut is pinned via `requestPinShortcut()`, the plugin also calls `addDynamicShortcuts()` with the same `ShortcutInfo`. This is critical because `getShortcuts(FLAG_MATCH_PINNED)` only reliably returns shortcuts that were also registered as dynamic on many OEM launchers.

### Reconciliation Logic (`syncWithHomeScreen`)
1. Calls `getPinnedShortcutIds()` on native side
2. Native queries `ShortcutManager.getShortcuts(FLAG_MATCH_PINNED)`
3. Filters results by `info.isPinned() == true`
4. Cleans up orphaned dynamic shortcuts (dynamic but not pinned)
5. Returns pinned IDs to JS
6. JS filters localStorage to keep only shortcuts whose IDs are in the pinned set
7. **Special case**: If OS returns 0 IDs and localStorage has shortcuts, skips sync entirely (treats as unreliable API response)

---

## 2. Why PDF Shortcuts Behave Differently (The Core Bug)

After tracing the entire flow, **there is no type-specific bug in the sync logic itself.** The `syncWithHomeScreen()` function is type-agnostic -- it only compares IDs. The problem is upstream in how `getPinnedShortcutIds()` interacts with Android's `ShortcutManager`.

### The Real Issue: `ShortcutManager` Reporting Inconsistency

When `getShortcuts(FLAG_MATCH_PINNED)` is called, Android returns shortcuts that:
1. Were pinned via `requestPinShortcut()`
2. AND still have an active dynamic shortcut registration (the "shadow" registration)

**The failure scenario for PDFs (and potentially any file type):**

1. User creates a PDF shortcut. `createPinnedShortcut` runs on a **background thread**.
2. The file copy (`copyToAppStorage`) succeeds.
3. `requestPinShortcut()` is called on the main thread -- returns `true`.
4. `addDynamicShortcuts()` is called immediately after -- this is the shadow registration.
5. **But**: Android has a **hard limit of ~15 dynamic shortcuts** (varies by OEM, typically 4-15). If the limit is exceeded, `addDynamicShortcuts()` throws `IllegalArgumentException` and the shadow registration silently fails (caught in the `try/catch` at line 446-449).
6. Without the shadow dynamic registration, `getShortcuts(FLAG_MATCH_PINNED)` **will not return this shortcut** on subsequent queries.
7. On the next `syncWithHomeScreen()`, the shortcut is not in the pinned set, so it gets **removed from localStorage**.

### Why This Hits PDFs More Than Images

It's not about the file type -- it's about **creation order and timing**. PDFs are often the nth shortcut created, pushing past the dynamic shortcut limit. However, the specific failure depends on:
- How many total shortcuts the user has (dynamic limit is global per app)
- OEM launcher behavior (Samsung, OnePlus, Xiaomi all have different limits)
- Whether previous shortcuts had their dynamic registrations cleaned up

### Evidence in Code

```java
// Line 444-449 in ShortcutPlugin.java
try {
    shortcutManager.addDynamicShortcuts(Collections.singletonList(finalShortcutInfo));
    android.util.Log.d("ShortcutPlugin", "Pushed shadow dynamic shortcut: " + finalId);
} catch (Exception dynEx) {
    // Non-fatal: shortcut is still pinned, just won't be tracked by some OEM launchers
    android.util.Log.w("ShortcutPlugin", "Failed to register dynamic shortcut (non-fatal): " + dynEx.getMessage());
}
```

The comment says "non-fatal" but it is actually **critical** -- without the dynamic registration, the shortcut becomes invisible to `getPinnedShortcutIds()`, and the next sync **deletes it from the app**.

---

## 3. All Current Inconsistencies

| Issue | Severity | Description |
|-------|----------|-------------|
| Dynamic shortcut limit overflow | **Critical** | `addDynamicShortcuts` silently fails when limit exceeded, causing sync to delete the shortcut from app storage |
| Zero-ID guard is too aggressive | High | If OS returns 0 pinned IDs, sync is skipped entirely. But 0 could be legitimate (all shortcuts manually unpinned) |
| No boot-time shortcut reconciliation | Medium | `BootReceiver` only restores scheduled actions, not shortcut sync |
| Orphan cleanup timing | Medium | Dynamic shortcuts are cleaned in `getPinnedShortcutIds` but this runs after pinned query, creating a race |
| No launcher change detection | Low | Switching launchers can break `isPinned()` state; no handling |
| File deletion not checked | Low | If `shortcuts/` directory files are deleted (cache clear), shortcuts still appear in app but fail on tap |

---

## 4. Failure Mode Analysis

| Failure Mode | Why It Happens | Android Provides Signal? | Mitigation |
|---|---|---|---|
| User removes shortcut from home screen | Drag to "Remove" | Yes, via `isPinned()` returning false on next `getShortcuts()` query | Current reconciliation handles this (when dynamic shortcut exists) |
| Dynamic shortcut limit exceeded | Android limits dynamic shortcuts to ~4-15 per app | No explicit signal; `addDynamicShortcuts` throws `IllegalArgumentException` | Must manage dynamic shortcut pool (see fix below) |
| App killed/restarted | OS reclaims memory | No signal needed | Current mount sync handles this |
| Device reboot | System restart | `BOOT_COMPLETED` broadcast | Currently only restores scheduled actions, not shortcut sync |
| Launcher switch | User changes default launcher | No direct signal | Must reconcile on resume |
| `getShortcuts(FLAG_MATCH_PINNED)` returns stale data | Known Android bug on some OEMs | No | Cross-reference with dynamic shortcuts |
| Cache/data cleared | User clears app data | No | Shortcuts become orphans; files are lost |

---

## 5. Things Android Will Never Tell Us (And How We Handle Them)

1. **"A shortcut was just unpinned"** -- Android does NOT send a broadcast when a user drags a shortcut off the home screen. There is no callback, no intent, nothing. The only way to know is to **poll** via `getShortcuts(FLAG_MATCH_PINNED)` when the app is foregrounded. This is what the current design does, and it is the correct approach.

2. **"The dynamic shortcut limit was exceeded"** -- Android throws an exception, but the only reliable response is to proactively manage the pool. You cannot query the limit reliably across OEMs.

3. **"The launcher changed"** -- No broadcast for launcher changes. The `isPinned()` state may become unreliable. Must re-sync on every foreground.

4. **"File permissions were revoked"** -- `content://` URI permissions can be revoked at any time (app restart, storage provider update). The `copyToAppStorage` approach (copying files to app-internal storage with `FileProvider` URIs) mitigates this, but if the copy failed silently, the shortcut exists with a dead URI.

5. **"The shortcut icon was moved to a different page/folder"** -- No signal. Irrelevant to sync, but worth noting.

---

## 6. Proposed Architecture (Final)

### Source of Truth: Reconciled Hybrid

- **localStorage** is the primary data store (shortcut metadata, creation order, usage counts)
- **ShortcutManager** is the pin-state oracle (is it still on the home screen?)
- Reconciliation runs on every app foreground and corrects drift

### Key Changes

#### Change 1: Replace `addDynamicShortcuts` with `setDynamicShortcuts` Pool Management

**Problem**: `addDynamicShortcuts` can exceed limits silently.

**Fix**: Before registering a new dynamic shortcut, check the current count. If at/near the limit, remove the oldest dynamic shortcut first. Use `setDynamicShortcuts()` instead of `addDynamicShortcuts()` for atomic replacement.

Better yet: after pinning, immediately query `getShortcuts(FLAG_MATCH_PINNED)` to verify the shortcut appears. If it doesn't, retry the dynamic registration after removing the least-recently-used dynamic shortcut.

Implementation in `createPinnedShortcut` (ShortcutPlugin.java):

```java
// After requestPinShortcut succeeds:
// 1. Get current dynamic shortcuts
List<ShortcutInfo> currentDynamic = shortcutManager.getDynamicShortcuts();
int maxDynamic = shortcutManager.getMaxShortcutCountPerActivity();

// 2. If at limit, remove oldest to make room
if (currentDynamic.size() >= maxDynamic) {
    // Remove the first (oldest) dynamic shortcut that is still pinned
    // (it doesn't need the dynamic registration anymore if pinned)
    List<String> toRemove = new ArrayList<>();
    for (ShortcutInfo info : currentDynamic) {
        if (info.isPinned()) {
            toRemove.add(info.getId());
            break; // Remove just one to make room
        }
    }
    if (!toRemove.isEmpty()) {
        shortcutManager.removeDynamicShortcuts(toRemove);
    }
}

// 3. Now add the new shadow dynamic shortcut
shortcutManager.addDynamicShortcuts(Collections.singletonList(finalShortcutInfo));
```

**Critical insight**: A pinned shortcut that already has `isPinned() == true` does NOT need its dynamic shadow to remain registered -- it will still appear in `getShortcuts(FLAG_MATCH_PINNED)` once it has been confirmed as pinned by the OS. The shadow is only needed for the initial registration to "seed" the pinned state tracking.

#### Change 2: Improve Zero-ID Guard Logic

**Current**: If OS returns 0 IDs and app has shortcuts, skip sync entirely.

**Fix**: Only skip if the OS returned 0 AND `getDynamicShortcuts()` also returned 0 AND the user has shortcuts in localStorage. This triple-check reduces false positives while still guarding against a completely broken API.

```typescript
// In syncWithHomeScreen:
if (ids.length === 0 && currentShortcuts.length > 0) {
    // Verify with a secondary check - if dynamic shortcuts also report 0,
    // the ShortcutManager may be genuinely broken
    // Pass dynamic count from native for cross-reference
    console.log('[useShortcuts] OS returned 0 pinned IDs, cross-referencing...');
    // If we have many shortcuts but OS says 0, likely API failure
    if (currentShortcuts.length > 3) {
        console.log('[useShortcuts] Skipping sync - likely API failure');
        return;
    }
    // For small counts (1-3), it's plausible user removed all
    // Proceed with sync after a confirmation delay
}
```

#### Change 3: Return Dynamic Shortcut Count from `getPinnedShortcutIds`

Update the native method to also return diagnostic info: dynamic count, max dynamic limit, and manufacturer. This lets the JS side make smarter decisions.

```java
// In getPinnedShortcutIds:
result.put("ids", ids);
result.put("dynamicCount", dynamicShortcuts.size());
result.put("maxDynamic", manager.getMaxShortcutCountPerActivity());
result.put("manufacturer", Build.MANUFACTURER);
```

Update JS interface and `syncWithHomeScreen` to consume this.

#### Change 4: Verify Pinned State After Creation

After `createPinnedShortcut` returns success, the JS layer should schedule a delayed verification (e.g., 3 seconds later) to confirm the shortcut appears in `getPinnedShortcutIds`. If not, log a warning and re-attempt the dynamic registration.

This goes in `ShortcutCustomizer.tsx` (or equivalent creation flow) after the native call succeeds.

#### Change 5: Handle `updatePinnedShortcut` Dynamic Re-registration

The `updatePinnedShortcut` method already calls `addDynamicShortcuts` (line 4421). Apply the same pool management as Change 1 to prevent overflow during updates.

---

## 7. Implementation Plan

### Step 1: Fix Dynamic Shortcut Pool Management (ShortcutPlugin.java)
- In `createPinnedShortcut`: Add pool limit check before `addDynamicShortcuts`
- In `updatePinnedShortcut`: Same pool management
- Use `getMaxShortcutCountPerActivity()` for the limit
- Remove oldest pinned-but-dynamic shortcut if at capacity

### Step 2: Enrich `getPinnedShortcutIds` Response (ShortcutPlugin.java)
- Add `dynamicCount`, `maxDynamic`, `manufacturer` to response
- Update JS interface in `ShortcutPlugin.ts` to accept these fields

### Step 3: Improve Zero-ID Guard (useShortcuts.ts)
- Use the enriched response data
- Only skip sync for large shortcut counts (>3) when OS returns 0
- For small counts, proceed with sync (user may have legitimately removed all)

### Step 4: Add Post-Creation Verification (useShortcuts.ts or ShortcutCustomizer.tsx)
- After `createHomeScreenShortcut` succeeds, schedule a 3-second delayed check
- Call `getPinnedShortcutIds` and verify the new shortcut appears
- If missing, log warning (this catches the pool overflow silently)

### Step 5: Documentation Update
- Update ARCHITECTURE.md with the sync contract
- Document the dynamic shortcut limit issue and mitigation

---

## 8. Files Modified

| File | Change |
|------|--------|
| `native/.../plugins/ShortcutPlugin.java` | Pool management in `createPinnedShortcut` and `updatePinnedShortcut`; enriched `getPinnedShortcutIds` response |
| `src/plugins/ShortcutPlugin.ts` | Update `getPinnedShortcutIds` return type with diagnostic fields |
| `src/hooks/useShortcuts.ts` | Improve zero-ID guard logic; add post-creation verification |
| `ARCHITECTURE.md` | Document sync contract and dynamic shortcut limit handling |

