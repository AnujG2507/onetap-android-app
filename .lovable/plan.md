

# Fix: Badge Counts Clipped in Hamburger Menu

## Problem

After adding `ScrollArea` for landscape scrolling, the count badges on "My Access Points" (blue) and "Trash" (red) are being cut off at the right edge of the menu. This happens because the Radix ScrollArea viewport internally sets `overflow: scroll` in both directions, which clips content near the edges.

## Solution

Use the existing `viewportClassName` prop on `ScrollArea` to disable horizontal overflow clipping. Since we only need vertical scrolling, the horizontal axis should not constrain content.

## Technical Details

### File: `src/components/AppMenu.tsx`

Change line 158 from:

```tsx
<ScrollArea className="flex-1 min-h-0">
```

To:

```tsx
<ScrollArea className="flex-1 min-h-0" viewportClassName="!overflow-x-visible">
```

This uses the `viewportClassName` prop (already supported by the project's custom `ScrollArea` component) to override the Radix viewport's horizontal overflow, ensuring badges are fully visible while vertical scrolling continues to work correctly in landscape mode.

Single line change, no other files affected.

