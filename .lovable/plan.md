
# Plan: Ensure Title Text Never Overflows Screen

## Problem Summary

When titles are truncated, they should show an ellipsis and fit within the container. When expanded, they should wrap properly without causing horizontal overflow. The current implementation uses `break-all` for expanded titles, but we need to verify all parent containers are properly constrained.

## Analysis of Current Implementation

All four components follow a similar pattern:

| Component | Content Container Classes | Title Classes (Collapsed) | Title Classes (Expanded) |
|-----------|--------------------------|---------------------------|--------------------------|
| BookmarkItem | `flex-1 min-w-0 overflow-hidden` | `truncate` | `break-all` |
| TrashItem | `flex-1 min-w-0 overflow-hidden` | `truncate` | `break-all` |
| ScheduledActionItem | `flex-1 min-w-0 overflow-hidden` | `truncate` | `break-all` |
| ShortcutListItem | `flex-1 min-w-0 overflow-hidden` | `truncate` | `break-all` |

The parent containers use `min-w-0` which is essential for flex items to allow text truncation. Combined with `overflow-hidden`, this should prevent horizontal overflow.

## Identified Issues

1. **ShortcutListItem** (line 137): The outer container has `overflow-hidden` but the text container uses the same flex pattern. However, the title `<p>` element is inside a flex container with a Badge sibling. The flex layout could potentially cause issues.

2. **All Components**: While `break-all` allows word breaking, it doesn't limit vertical growth. This is intentional for the "expanded" state.

## Solution

Add explicit `overflow-hidden` to the title `<p>` elements themselves as a safety measure, and ensure the flex layout properly constrains content. The changes are minimal:

### File: `src/components/BookmarkItem.tsx`

**Line 331-334** - Add `min-w-0` to the title element as a flex child safety:
```tsx
// Current
<p 
  className={cn(
    "font-medium text-foreground cursor-pointer",
    isTitleExpanded ? "break-all" : "truncate"
  )}

// Updated - No change needed, parent already has min-w-0 overflow-hidden
// The title is a direct child of this constrained container
```

The parent `div` on line 330 already has `flex-1 min-w-0 overflow-hidden` which correctly constrains the children.

### File: `src/components/TrashItem.tsx`

**Line 189** - Parent already has `flex-1 min-w-0 overflow-hidden`. No changes needed.

### File: `src/components/ScheduledActionItem.tsx`

**Line 312** - Parent already has `flex-1 min-w-0 overflow-hidden`. No changes needed.

### File: `src/components/ShortcutsList.tsx`

**Lines 144-157** - The ShortcutListItem has a nested flex container around the title and badge. This needs adjustment:

```tsx
// Line 144-157 - Current structure
<div className="flex-1 min-w-0 overflow-hidden">
  <div className="flex items-start gap-2 max-w-full min-w-0">
    <p className={cn(
      "font-medium flex-1 cursor-pointer",
      isTitleExpanded ? "break-all" : "truncate"
    )}>

// The title <p> should also have min-w-0 to properly truncate within the flex container
```

**Change needed**: Add `min-w-0` to the title `<p>` element on line 147:
```tsx
className={cn(
  "font-medium flex-1 min-w-0 cursor-pointer",  // Added min-w-0
  isTitleExpanded ? "break-all" : "truncate"
)}
```

## Summary of Changes

| File | Change | Lines |
|------|--------|-------|
| `src/components/ShortcutsList.tsx` | Add `min-w-0` to title element class | 147-149 |

The other components (BookmarkItem, TrashItem, ScheduledActionItem) already have proper overflow handling and don't need changes.

## Why This Works

- `flex-1`: Allows the element to grow and shrink
- `min-w-0`: Critical for flex items - allows the element to shrink below its content width (otherwise min-width defaults to content size)
- `overflow-hidden`: Clips any content that exceeds the container bounds
- `truncate`: Single line with ellipsis (includes overflow-hidden, text-ellipsis, whitespace-nowrap)
- `break-all`: Allows breaking at any character to prevent horizontal overflow when expanded

## Testing Checklist

- Create a shortcut with a very long name (50+ characters) and verify it truncates
- Tap the title to expand and verify it wraps without horizontal scrolling
- Repeat for bookmarks, trash items, and scheduled reminders
- Test on narrow mobile viewport to ensure no horizontal scrolling occurs
