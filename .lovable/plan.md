
# Fix Horizontal Overflow in Profile Page

## Problem

The Profile page is experiencing **horizontal overflow** when the Usage Insights section displays the weekly activity chart. This happens in both signed-in and signed-out states.

## Root Cause

The chart library (`recharts` `ResponsiveContainer`) calculates its width based on its parent element. In a flex/scroll container without explicit width constraints, the chart can expand beyond the viewport width.

The issue is in the layout chain:
1. `ScrollArea` creates a viewport that doesn't constrain width
2. The content wrapper inside `ScrollArea` has no `min-w-0` to prevent flex children from expanding
3. `ResponsiveContainer` detects an unconstrained width and overflows

## Solution

Apply width constraints at multiple levels for defense in depth:

### 1. ScrollArea Viewport - Add overflow-x-hidden

In `ProfilePage.tsx`, use the `viewportClassName` prop on `ScrollArea` to prevent horizontal scrolling:

```tsx
<ScrollArea className="flex-1" viewportClassName="overflow-x-hidden">
```

### 2. Content Wrapper - Add min-w-0 and w-full

Add `min-w-0 w-full` to the main content wrapper to constrain flex child widths:

```tsx
<div className="flex flex-col pb-20 min-w-0 w-full">
```

### 3. UsageInsights Wrapper - Defense in depth

The wrapper already has `px-5`, but add `w-full min-w-0 overflow-hidden` for additional safety:

```tsx
<div className="px-5 w-full min-w-0 overflow-hidden">
  <UsageInsights />
</div>
```

---

## Implementation Details

### File: src/components/ProfilePage.tsx

**Change 1: Signed-out state ScrollArea (line 260)**

Add `viewportClassName` prop:

```tsx
<ScrollArea className="flex-1" viewportClassName="overflow-x-hidden">
```

**Change 2: Signed-out content wrapper (line 261)**

Add width constraints:

```tsx
<div className="flex flex-col pb-20 min-w-0 w-full">
```

**Change 3: Signed-out UsageInsights wrapper (line 308)**

Add width and overflow constraints:

```tsx
<div className="px-5 w-full min-w-0 overflow-hidden">
  <UsageInsights />
</div>
```

**Change 4: Signed-in state ScrollArea (line 345)**

Add `viewportClassName` prop:

```tsx
<ScrollArea className="flex-1" viewportClassName="overflow-x-hidden">
```

**Change 5: Signed-in content wrapper (line 346)**

Add width constraints:

```tsx
<div className="flex flex-col pb-20 min-w-0 w-full">
```

**Change 6: Signed-in UsageInsights wrapper (line 451)**

Add width and overflow constraints:

```tsx
<div className="mb-4 w-full min-w-0 overflow-hidden">
  <UsageInsights />
</div>
```

---

## Why This Works

| Class | Purpose |
|-------|---------|
| `overflow-x-hidden` on viewport | Prevents horizontal scroll at the ScrollArea level |
| `min-w-0` on flex children | Allows flex items to shrink below their intrinsic width |
| `w-full` | Constrains element to parent width (100%) |
| `overflow-hidden` on wrapper | Clips any overflow from chart rendering |

---

## Testing Checklist

- Verify Profile page (signed-out) has no horizontal scroll
- Verify Profile page (signed-in) has no horizontal scroll
- Verify weekly activity chart displays correctly
- Verify page scrolls vertically without issues
- Test in portrait and landscape orientations
- Check that other pages (Access, Reminders, Bookmarks) are unaffected
