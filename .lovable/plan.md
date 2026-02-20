
# Audit: Edge-to-Edge Overlap on Access Page Sub-Screens

## Root Cause Analysis

The app uses a safe-area system defined in `src/index.css`:
- `--android-safe-bottom` is injected by `MainActivity.java` as a CSS variable (e.g., `24px` for a device with gesture navigation)
- `safe-bottom` class = `padding-bottom: var(--android-safe-bottom, 16px)`
- `safe-bottom-action` = `padding-bottom: calc(var(--android-safe-bottom, 16px) + 16px)`
- The BottomNav is `fixed bottom-0` and uses `safe-bottom`, making it taller than `56px` on devices with gesture navigation

The pages that scroll under the fixed bottom nav need to add clearance equal to **BottomNav height + Android safe bottom**. The BottomNav is `h-14` (56px = 3.5rem) in portrait. So the correct clearance is `calc(3.5rem + var(--android-safe-bottom, 0px))`.

**The problem:** Several screens use `pb-20` (80px fixed) as their bottom clearance instead of the safe-area-aware formula. On a device with, e.g., 24px gesture nav inset, the bottom nav occupies `56px + 24px = 80px`. So `pb-20` accidentally works on some devices but fails on others. On gesture-nav devices with larger insets, or on the sub-screens that bypass the layout, content is clipped or overlaps the nav bar.

## Findings by Component

### CRITICAL: `ContactShortcutCustomizer.tsx` — Wrong root class

**Line 169:** `<div className="min-h-app-viewport bg-background flex flex-col animate-fade-in">`

`min-h-app-viewport` makes this component own a full-viewport height root, detaching it from the parent flex chain in `AccessFlow`. Because `AccessFlow` renders it inside a `flex-1 flex flex-col` container, the correct root class is `flex-1 flex flex-col` — just like `UrlInput` and `ShortcutCustomizer` use. 

Using `min-h-app-viewport` here causes the component to size itself relative to `100dvh` rather than fitting in the available space, potentially creating overflow or layout bugs on some Android devices.

**Fix:** Change line 169 root div from `min-h-app-viewport bg-background flex flex-col animate-fade-in` → `flex-1 flex flex-col animate-fade-in`

Also: the bottom content area on line 183 uses `safe-bottom-action` inside the scroll area — this is correct, but since the root was wrong, this fix depends on the root fix above.

### HIGH: `SettingsPage.tsx` — `pb-20` hard-coded bottom clearance

**Line 218:** `<div className="flex-1 flex flex-col pb-20">`

`SettingsPage` renders as a full-screen replacement within `AccessFlow` (via `if (showSettings) return <SettingsPage .../>`). It also appears from `NotificationsPage`. There is **no BottomNav** visible when Settings is open (it's a full-screen overlay). So `pb-20` is just a visual breathing room, which is fine **only if there's no Android nav bar safe area to worry about**. But the `pt-header-safe-compact` in the header does cover the status bar.

However, the bottom of `SettingsPage` renders directly behind the Android gesture navigation bar (since there's no bottom nav, but the gesture nav bar still overlays content). It should use `safe-bottom` on the scroll area or the last content item.

**Fix:** The `ScrollArea` inside (line 234) doesn't account for the Android nav safe area. Add `safe-bottom` padding to the scroll area's inner content `div` instead of `pb-20` on the root. Change `pb-20` → `pb-0` on the root wrapper and add `safe-bottom` to the scroll area's inner `<div className="space-y-4 pb-8">` → `<div className="space-y-4 pb-8 safe-bottom">`.

Actually the simpler fix is: the root `pb-20` should be replaced with `pb-[calc(5rem+var(--android-safe-bottom,0px))]` — but since this is a full-screen page with no BottomNav, it just needs `safe-bottom` clearance. Change `pb-20` to `pb-safe-bottom` (or use `safe-bottom` on the inner div).

### HIGH: `ProfilePage.tsx` — `pb-20` hard-coded bottom clearance

**Lines 239 and 315:** `<div className="flex flex-col pb-20 min-w-0 w-full">`

These are inside a `ScrollArea` (which is `flex-1`). The bottom nav IS visible on the profile tab, so the clearance needs to be nav height + safe bottom. `pb-20` (80px) = `h-14` (56px) + ~24px extra, which is close but not safe-area-aware.

**Fix:** Change `pb-20` → `pb-[calc(3.5rem+var(--android-safe-bottom,0px)+1rem)]` on both instances. Or more cleanly, use a Tailwind arbitrary value: `pb-[calc(3.5rem+var(--android-safe-bottom,0px)+1rem)]`.

### MEDIUM: `NotificationsPage.tsx` — `pb-20` hard-coded bottom clearance

**Line 591:** `<div className="flex-1 flex flex-col pb-20">`

Same pattern as ProfilePage — BottomNav is visible on this tab.

**Fix:** Change `pb-20` → `pb-[calc(3.5rem+var(--android-safe-bottom,0px)+1rem)]`.

### MEDIUM: `BookmarkLibrary.tsx` — `pb-20` hard-coded bottom clearance

**Line 605:** `<div className="flex flex-col h-full pb-20">`

Same — BottomNav is visible on bookmarks tab.

**Fix:** Change `pb-20` → `pb-[calc(3.5rem+var(--android-safe-bottom,0px)+1rem)]`.

Also, the inner scroll content: **Line 968:** `<div ref={scrollContainerRef} className="ps-5 pe-5 pb-16">` — `pb-16` (64px) here is extra scroll padding inside the scroll area. This is fine as-is since the parent has the clearance fix.

### LOW: `SlideshowCustomizer.tsx` — `pb-24` hard-coded

**Line 233:** `<div className="flex-1 overflow-y-auto px-5 pb-24 space-y-6">`

This is a sub-screen inside AccessFlow (no BottomNav visible). `pb-24` (96px) is extra visual clearance for the fixed confirm button. The confirm button is not actually shown (the scrollable content ends and the button appears in the header area?). Let me verify — SlideshowCustomizer has its CTA in the header, so the `pb-24` may just be extra scroll breathing room. The key question is whether the bottom content area overlaps the Android nav bar.

Since the SlideshowCustomizer renders inside `flex-1 flex flex-col` (line 216 `<div className="flex-1 flex flex-col min-h-0">`), the parent handles the height bounding. The `pb-24` here is just internal scroll spacing, not a layout concern. **No change needed.**

## Summary of Changes

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `ContactShortcutCustomizer.tsx` | 169 | Wrong root class (`min-h-app-viewport`) breaks layout chain | Change to `flex-1 flex flex-col animate-fade-in` |
| `SettingsPage.tsx` | 218 | `pb-20` doesn't respect Android nav safe area when Settings shown without BottomNav | Change `pb-20` → remove it; add `safe-bottom` to inner scroll content div (line 235) |
| `ProfilePage.tsx` | 239, 315 | `pb-20` doesn't respect Android nav safe area dynamically | Change to `pb-[calc(3.5rem+var(--android-safe-bottom,0px)+1rem)]` |
| `NotificationsPage.tsx` | 591 | `pb-20` doesn't respect Android nav safe area dynamically | Change to `pb-[calc(3.5rem+var(--android-safe-bottom,0px)+1rem)]` |
| `BookmarkLibrary.tsx` | 605 | `pb-20` doesn't respect Android nav safe area dynamically | Change to `pb-[calc(3.5rem+var(--android-safe-bottom,0px)+1rem)]` |

## Implementation Details

### File 1: `src/components/ContactShortcutCustomizer.tsx`

Line 169 — change root wrapper:
```tsx
// Before:
<div className="min-h-app-viewport bg-background flex flex-col animate-fade-in">

// After:
<div className="flex-1 flex flex-col animate-fade-in">
```
This makes it consistent with `UrlInput` (line 145) and `ShortcutCustomizer` (line 192), which both use `flex flex-col h-full` and correctly inherit from the AccessFlow container.

### File 2: `src/components/SettingsPage.tsx`

Line 218 — remove `pb-20` from root, it's unnecessary since Settings is full-screen with no BottomNav:
```tsx
// Before:
<div className="flex-1 flex flex-col pb-20">

// After:
<div className="flex-1 flex flex-col">
```

Line 235 — add `safe-bottom` to inner scroll div so the last item doesn't sit behind the Android gesture nav bar:
```tsx
// Before:
<div className="space-y-4 pb-8">

// After:
<div className="space-y-4 pb-8 safe-bottom">
```

### File 3: `src/components/ProfilePage.tsx`

Lines 239 and 315 — update `pb-20` to safe-area-aware formula:
```tsx
// Before:
<div className="flex flex-col pb-20 min-w-0 w-full">

// After:
<div className="flex flex-col pb-[calc(3.5rem+var(--android-safe-bottom,0px)+1rem)] min-w-0 w-full">
```

### File 4: `src/components/NotificationsPage.tsx`

Line 591 — update `pb-20` to safe-area-aware formula:
```tsx
// Before:
<div className="flex-1 flex flex-col pb-20">

// After:
<div className="flex-1 flex flex-col pb-[calc(3.5rem+var(--android-safe-bottom,0px)+1rem)]">
```

### File 5: `src/components/BookmarkLibrary.tsx`

Line 605 — update `pb-20` to safe-area-aware formula:
```tsx
// Before:
<div className="flex flex-col h-full pb-20">

// After:
<div className="flex flex-col h-full pb-[calc(3.5rem+var(--android-safe-bottom,0px)+1rem)]">
```

## No Changes Needed

- `UrlInput.tsx` — correct `flex flex-col h-full`, uses `safe-bottom-action` in footer
- `ShortcutCustomizer.tsx` — correct `flex flex-col h-full`, uses `safe-bottom-action` in footer
- `SlideshowCustomizer.tsx` — correct `flex-1 flex flex-col min-h-0`, `pb-24` is internal scroll spacing
- `SuccessScreen.tsx` — renders as flex child inside AccessFlow, no layout issues
- `OnboardingFlow.tsx` — uses `fixed inset-0` intentionally (modal overlay), uses `pt-header-safe-compact` correctly
- `ErrorBoundary.tsx` — uses `min-h-app-viewport` with `safe-top`, acceptable for error state
- `ScheduledActionCreator.tsx` / `ScheduledTimingPicker.tsx` — rendered inside Sheets, sheet handles safe areas
- `MyShortcuts.tsx` — standalone page (no BottomNav), uses `min-h-app-viewport` correctly
- `AuthCallback.tsx` — standalone page, uses `min-h-app-viewport safe-top` correctly
