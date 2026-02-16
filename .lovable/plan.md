

## Fix: Profile Page Crash After OAuth Sign-In

### Problem
After successful OAuth sign-in (green dot visible on profile tab), opening the Profile tab triggers the ErrorBoundary ("refresh app" page). The exact crash point is unknown because there are no console logs available.

### Root Cause Analysis
The signed-in Profile view renders several components/hooks that are NOT rendered in the signed-out view:
- `SyncStatusIndicator` (uses `useSyncStatus` hook)
- User Info Card with `ImageWithFallback`
- Sync Status Card with cloud counts
- Settings Card with auto-sync toggle
- Account Actions (Delete Account dialog)

The most likely crash points:

1. **`refreshCounts()` has no error boundary** — The `useEffect` on line 97 calls `refreshCounts()` which runs `Promise.all([getCloudBookmarkCount(), getCloudScheduledActionsCount()])`. While the individual functions have try/catch, the `Promise.all` + state setters could fail if the component unmounts mid-flight or if the session is in a transitional state.

2. **`useSyncStatus` hook** — Used by `SyncStatusIndicator`, it calls `useAuth()` internally, creating a second auth subscription. During the initial session establishment with implicit flow, there could be a race condition where the user object is partially available.

3. **Missing translation keys** — If any `t()` interpolation key (like `profile.syncCompleteDesc` with `{ uploaded, downloaded }`) receives undefined values, it could potentially crash depending on the i18next configuration.

### Solution: Two-Part Fix

#### Part 1: Add Defensive Error Handling

**File: `src/components/ProfilePage.tsx`**
- Wrap `refreshCounts()` call in try/catch
- Add `console.log` statements at key render decision points
- Wrap the entire signed-in return JSX in a try/catch render guard

```typescript
// Line 72-83: Add try/catch to refreshCounts
const refreshCounts = async () => {
  try {
    setLocalCount(getSavedLinks().length);
    setLocalRemindersCount(getScheduledActions().length);
    if (user) {
      const [bookmarkCount, actionsCount] = await Promise.all([
        getCloudBookmarkCount(),
        getCloudScheduledActionsCount()
      ]);
      setCloudCount(bookmarkCount);
      setCloudRemindersCount(actionsCount);
    }
  } catch (error) {
    console.error('[ProfilePage] refreshCounts failed:', error);
    // Don't crash - just leave counts at their default
  }
};
```

```typescript
// Line 97-100: Add error logging and guard against unmounted updates
useEffect(() => {
  let cancelled = false;
  console.log('[ProfilePage] useEffect triggered, user:', !!user);
  
  const doRefresh = async () => {
    try {
      await refreshCounts();
    } catch (e) {
      console.error('[ProfilePage] Refresh failed:', e);
    }
    if (!cancelled) {
      setSyncStatus(getSyncStatus());
    }
  };
  doRefresh();
  
  return () => { cancelled = true; };
}, [user]);
```

**File: `src/components/ProfilePage.tsx`** — Add render-time logging
```typescript
// Before the signed-in return (around line 333):
console.log('[ProfilePage] Rendering signed-in view', {
  hasUser: !!user,
  email: user?.email,
  hasMetadata: !!user?.user_metadata,
});
```

#### Part 2: Guard `SyncStatusIndicator` Against Partial State

**File: `src/components/SyncStatusIndicator.tsx`**
- Wrap component in try/catch to prevent rendering errors from bubbling up

```typescript
export function SyncStatusIndicator({ className }: { className?: string }) {
  try {
    const { syncState, isEnabled } = useSyncStatus();
    // ... existing render logic ...
  } catch (error) {
    console.error('[SyncStatusIndicator] Render error:', error);
    return null; // Silently fail instead of crashing
  }
}
```

Since hooks can't be called inside try/catch (React rules of hooks), we'll instead create a wrapper:

**File: `src/components/SyncStatusIndicator.tsx`**
- Add an inner component that does the actual rendering, wrapped by an outer error-catching component
- Or better: just add a local ErrorBoundary wrapper

#### Part 3: Add Diagnostic Logging to `useSyncStatus`

**File: `src/hooks/useSyncStatus.ts`**
- Add a console.log when the hook initializes to track if it's the crash source

```typescript
// At the top of the hook:
console.log('[useSyncStatus] Init, user:', !!user, 'online:', isOnline);
```

### Summary of Changes

| File | Change |
|---|---|
| `src/components/ProfilePage.tsx` | Wrap `refreshCounts` in try/catch, add cancellation guard to useEffect, add render-time logging |
| `src/components/SyncStatusIndicator.tsx` | Add error boundary protection so it returns null instead of crashing |
| `src/hooks/useSyncStatus.ts` | Add diagnostic logging |

### Expected Outcome
- If the crash was in `refreshCounts` or `SyncStatusIndicator`, the defensive handling will prevent it
- The added console logs will be visible in the next session, helping identify the exact crash point if it persists
- The ErrorBoundary will no longer be triggered for the Profile page

