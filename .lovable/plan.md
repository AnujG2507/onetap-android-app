

# Fix: Reduce Excessive Gap Between Status Bar and App Header

## Problem

On Android, there is an unnaturally large gap between the status bar and the app header (including the hamburger menu). This happens because the safe area inset is applied **twice**:

1. The outer container (e.g., `Index.tsx`) applies `safe-top` class, which adds `padding-top: var(--android-safe-top)`
2. Each header inside it applies `pt-header-safe`, which adds `padding-top: calc(var(--android-safe-top) + 1rem)`

Result: total top padding = **2x the status bar height + 1rem**, pushing content too far down.

## Solution

Remove `safe-top` from the outer page containers and let each header's `pt-header-safe` / `pt-header-safe-compact` be the single source of truth for status bar spacing. This is the correct pattern -- headers should own the safe area + visual padding together.

For pages that do not have a header with `pt-header-safe` (e.g., ErrorBoundary, NotFound, AuthCallback), keep `safe-top` since they need it directly.

## Changes

### 1. `src/pages/Index.tsx` (line 554)
Remove `safe-top` from the outer container class.

```
Before: "min-h-app-viewport bg-background flex flex-col overflow-hidden safe-top"
After:  "min-h-app-viewport bg-background flex flex-col overflow-hidden"
```

### 2. `src/pages/MyShortcuts.tsx` (line 46)
Remove `safe-top` from the outer container class (the header already has `pt-header-safe`).

```
Before: "min-h-app-viewport bg-background flex flex-col safe-top"
After:  "min-h-app-viewport bg-background flex flex-col"
```

### Pages that keep `safe-top` (no changes needed)
These pages don't have a `pt-header-safe` header, so `safe-top` on the container is correct:
- `ErrorBoundary.tsx` -- centered error message, no header
- `NotFound.tsx` -- centered 404 message, no header
- `AuthCallback.tsx` -- centered auth loading state, no header

## Impact

- All 4 main tabs (Access, Reminders, Library, Profile) will have correct spacing since they all render inside `Index.tsx`
- The hamburger menu (AppMenu) in the Access and Profile headers will sit at the proper height, fully in the visible area
- Sub-screens (UrlInput, ShortcutCustomizer, ScheduledActionCreator, SettingsPage, etc.) already use `pt-header-safe-compact` without a `safe-top` container, so they are unaffected
- MyShortcuts page will also have correct spacing

Only **2 files** need a single-line change each.
