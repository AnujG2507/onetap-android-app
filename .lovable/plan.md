
# Fix: Scroll Broken in All Tabs (Landscape and Portrait)

## Investigation Results

After thorough analysis of the full component hierarchy, there are **three separate root causes** — not one. The proposed `isVerticalLocked` fix addresses only one of them. All three must be fixed together.

---

## Root Cause 1: Missing `min-h-0` on Tab Wrapper Divs (PRIMARY — causes landscape failure)

In `src/pages/Index.tsx`, all four tab content wrappers use:
```tsx
<div className="flex-1 flex flex-col ...">
```

The outer root container is a **flex column** (`flex flex-col`):
```tsx
<div className="h-app-viewport bg-background flex flex-col overflow-hidden">
```

**The bug**: In CSS flexbox, `flex-1` (which is `flex: 1 1 0`) only guarantees a child can *grow* to fill available space. But the minimum size of a flex child is its intrinsic content size, not zero. Without `min-h-0`, a flex column child will **never shrink below its content height**. This means:

- The tab wrapper div is allowed to be taller than the viewport
- The `ScrollArea` inside gets more height than it needs and **never actually needs to scroll**
- The outer `overflow-hidden` on the root silently clips the overflow, making it look like nothing is there to scroll
- In landscape mode, vertical space is cut nearly in half, so this problem is far more severe

**Fix**: Add `min-h-0` to all four tab wrapper divs in `Index.tsx`.

```tsx
// Before
<div className="flex-1 flex flex-col ...">

// After  
<div className="flex-1 min-h-0 flex flex-col ...">
```

This constrains the tab div to exactly the available space, forcing the `ScrollArea` inside to be the scroll container.

---

## Root Cause 2: `useSwipeNavigation` `onTouchMove` Competes with Native Scroll (causes portrait failure with many items)

The swipe handlers from `useSwipeNavigation` are spread onto the tab wrapper div:
```tsx
{...swipeHandlers}
```

On Android WebView, attaching a React `onTouchMove` listener on a **parent of a `ScrollArea`** can interfere with native scroll gesture recognition. The current handler has no vertical-lock mechanism — it checks for horizontal swipes but doesn't bail out early when the gesture is clearly vertical.

**Fix**: Add an `isVerticalLocked` ref to `useSwipeNavigation.ts`. Once the first `~10px` of movement is more vertical than horizontal, mark the gesture as vertical-locked and stop processing all further touch events for that gesture.

```ts
const isVerticalLocked = useRef(false);

// In handleTouchStart: reset isVerticalLocked
// In handleTouchMove: if deltaY > 10 && deltaY >= deltaX → set isVerticalLocked=true, return early
// In handleTouchEnd: if isVerticalLocked → return early, don't check for swipe
```

---

## Root Cause 3: `ContentSourcePicker` Scroll Div Missing Height Constraint (Access tab landscape)

In `AccessFlow.tsx` (Access tab, `step === 'source'`):
```tsx
<div className="flex-1 min-h-0 overflow-hidden">
  <ContentSourcePicker ... />
</div>
```

Inside `ContentSourcePicker.tsx`:
```tsx
<div ref={scrollContainerRef} className="flex-1 h-full overflow-y-auto pb-6">
```

The `h-full` works correctly when its parent is properly constrained. **This is already correctly set up with `min-h-0` in `AccessFlow`**. However, once Root Cause 1 (missing `min-h-0` on the tab wrapper) is fixed, this chain becomes fully correct. No additional change needed here.

---

## Files to Change

### 1. `src/pages/Index.tsx` — Add `min-h-0` to all four tab wrapper divs

The four tab divs at lines ~565, ~593, ~611, ~628 need `min-h-0` added:

```tsx
// Access tab (line ~565)
<div key={...} className="flex-1 min-h-0 flex flex-col ...">

// Reminders tab (line ~593)  
<div key={...} className="flex-1 min-h-0 flex flex-col ...">

// Bookmarks tab (line ~611)
<div key={...} className="flex-1 min-h-0 flex flex-col ...">

// Profile tab (line ~628)
<div key={...} className="flex-1 min-h-0 flex flex-col ...">
```

### 2. `src/hooks/useSwipeNavigation.ts` — Add `isVerticalLocked` gesture locking

Add a vertical-lock ref so that as soon as a gesture is detected as primarily vertical, the swipe hook backs off entirely and lets the `ScrollArea` handle the touch:

```ts
const isVerticalLocked = useRef(false);

// handleTouchStart: add isVerticalLocked.current = false;
// handleTouchMove: 
//   if (isVerticalLocked.current) return;
//   if (deltaY > 10 && deltaY >= deltaX) { isVerticalLocked.current = true; return; }
// handleTouchEnd: 
//   if (!enabled || isVerticalLocked.current || !isHorizontalSwipe.current) return;
//   ... after done: isVerticalLocked.current = false;
```

---

## Technical Details

```text
Root container: h-app-viewport, flex-col, overflow-hidden
│
├── [Tab wrapper div] flex-1 ← MISSING min-h-0 here
│   │                         Without it, min-height = content-height
│   │                         The div can be taller than viewport
│   │                         ScrollArea never needs to scroll
│   │
│   └── [NotificationsPage / BookmarkLibrary / ProfilePage / AccessFlow]
│           flex-1, flex-col
│           │
│           └── ScrollArea (flex-1)
│                   Viewport: h-full, overflow-y: scroll
│                   ← Never activates because parent is too tall
│
└── BottomNav (fixed, safe-bottom)
```

After fix:
```text
Root container: h-app-viewport, flex-col, overflow-hidden
│
├── [Tab wrapper div] flex-1 min-h-0  ← min-h-0 forces it to shrink to fit
│   │                                   Exactly viewport-height minus BottomNav
│   │
│   └── ScrollArea (flex-1, min-h-0)
│           Viewport: h-full, overflow-y: scroll
│           ← Activates correctly — content overflows the fixed height
```

---

## Summary

| # | Root Cause | Symptom | Fix |
|---|-----------|---------|-----|
| 1 | Missing `min-h-0` on tab wrapper divs | Landscape scroll completely broken; portrait broken with many items | Add `min-h-0` to 4 tab divs in `Index.tsx` |
| 2 | `onTouchMove` swipe handler has no vertical lock | Vertical scroll gestures partially intercepted on Android WebView | Add `isVerticalLocked` ref to `useSwipeNavigation.ts` |
