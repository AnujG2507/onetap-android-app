

## Fix: Profile Page Crash — Rules of Hooks Violation

### Root Cause

The `useMemo` on **line 363** of `ProfilePage.tsx` is placed **after** two conditional early returns:

```text
Line 267: if (loading) return <spinner/>;    // early return
Line 276: if (!user)  return <sign-in view/>; // early return
   ...
Line 363: const validAvatarUrl = useMemo(...) // HOOK AFTER CONDITIONAL RETURN
```

React requires that hooks are called in the **exact same order** on every render. When `user` transitions from `null` to a real User object (after OAuth completes):

- Previous render: `user` was null, so the component returned at line 276. The `useMemo` on line 363 was never called.
- Current render: `user` exists, so the component passes line 276 and reaches line 363. React sees an extra hook it did not see before.

This crashes React immediately with a "Rendered more hooks than during the previous render" error, which gets caught by ErrorBoundary and shows the "Refresh App" page.

### Fix

Move `validAvatarUrl` (and related variables that depend on `user`) above the conditional returns so they execute on every render, regardless of auth state.

### Changes

**File: `src/components/ProfilePage.tsx`**

1. Move the following block from lines 357-365 to just after the existing hooks (around line 60, after `useTutorial`):

```typescript
// Derived user data - must be above conditional returns (Rules of Hooks)
const userMeta = user?.user_metadata ?? {};
const rawAvatarUrl = userMeta?.avatar_url || userMeta?.picture || null;
const fullName = userMeta?.full_name || userMeta?.name || 'User';
const email = user?.email || '';
const validAvatarUrl = useMemo(() =>
  rawAvatarUrl && isValidImageSource(rawAvatarUrl) ? rawAvatarUrl : null,
[rawAvatarUrl]);
```

2. Remove the original block (lines 352-365) including the `console.log` diagnostic.

3. Remove the diagnostic `console.log` statements added in the previous fix (lines 103, 352-356) since they are no longer needed.

### Why This Works

By placing all hooks and derived values before any conditional returns, React always sees the same number of hooks in the same order, regardless of whether `user` is null or not. The `useMemo` will simply compute `null` when there is no user, which is harmless.

### Summary

| File | Change |
|---|---|
| `src/components/ProfilePage.tsx` | Move `useMemo` (and related derived values) above conditional early returns to fix Rules of Hooks violation |

