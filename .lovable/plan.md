
# Enable Scroll in Bookmark Library & Profile Page

## Problem

The Bookmark Library tab doesn't scroll when there are many saved URLs. This is because it uses a native `<div>` with `overflow-y-auto` instead of the `<ScrollArea>` component that other list views use.

Similarly, the Profile Page uses native overflow styling which may have inconsistent behavior.

## Root Cause

**BookmarkLibrary.tsx** (line 973) uses:
```jsx
<div className="flex-1 overflow-y-auto ps-5 pe-5 pb-16 ...">
```

While other list views like **NotificationsPage.tsx** (line 898) and **MyShortcutsContent.tsx** (line 597) use:
```jsx
<ScrollArea className="flex-1 px-5">
```

The `ScrollArea` component from shadcn/ui provides better cross-platform scroll behavior and consistent touch handling.

---

## Solution

Replace native `div` with `<ScrollArea>` in:

1. **BookmarkLibrary.tsx** - Main bookmark list container
2. **ProfilePage.tsx** - Signed-in and signed-out content areas

---

## Implementation Details

### 1. BookmarkLibrary.tsx

**Current (lines 950-973):**
```jsx
<div 
  ref={scrollContainerRef}
  onScroll={(e) => { /* scroll handler */ }}
  className="flex-1 overflow-y-auto ps-5 pe-5 pb-16 overscroll-contain touch-pan-y"
>
  {/* Bookmark content */}
</div>
```

**Change to:**
```jsx
<ScrollArea 
  className="flex-1" 
  onScrollCapture={(e) => { /* scroll handler */ }}
>
  <div ref={scrollContainerRef} className="ps-5 pe-5 pb-16">
    {/* Bookmark content */}
  </div>
</ScrollArea>
```

Key changes:
- Wrap content with `<ScrollArea>` component
- Move horizontal padding inside the ScrollArea viewport
- Use `onScrollCapture` event on ScrollArea for scroll detection
- Keep `scrollContainerRef` on inner div for scroll position tracking

### 2. ProfilePage.tsx (Signed-out state)

**Current (lines 258-259):**
```jsx
<div className="flex-1 flex flex-col pb-20 overflow-y-auto">
```

**Change to:**
```jsx
<ScrollArea className="flex-1">
  <div className="flex flex-col pb-20">
```

### 3. ProfilePage.tsx (Signed-in state)

**Current (line 339-340):**
```jsx
<div className="flex-1 flex flex-col pb-20 overflow-y-auto">
```

**Change to:**
```jsx
<ScrollArea className="flex-1">
  <div className="flex flex-col pb-20">
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/BookmarkLibrary.tsx` | Replace native scroll `div` with `ScrollArea` component |
| `src/components/ProfilePage.tsx` | Wrap both signed-in and signed-out content with `ScrollArea` |

---

## Technical Notes

- The `ScrollArea` component already provides `overflow-x-hidden` via the `viewportClassName` prop when needed
- The scroll event handler needs to use `onScrollCapture` on ScrollArea or use a ref to the viewport
- Bottom padding remains on the inner content div to clear fixed bottom elements
- The `overscroll-contain` and `touch-pan-y` classes are not needed with ScrollArea as it handles these natively

---

## Testing Checklist

- [ ] Bookmark Library: Add 10+ bookmarks and verify smooth scrolling
- [ ] Bookmark Library: Verify scroll-based bottom button visibility still works
- [ ] Profile Page (signed out): Scroll content if taller than viewport
- [ ] Profile Page (signed in): Scroll through all cards and verify smooth behavior
- [ ] Landscape orientation: Verify scrolling works in both orientations
- [ ] Swipe navigation: Ensure horizontal swipe between tabs still works (no gesture conflicts)
