
# Plan: Consistent Overflow Handling for Name and Metadata Rows

## Problem

In the My Shortcuts list, while the name row now uses `HorizontalScrollText`, the **Type + Target metadata row** (e.g., "Link · very-long-domain-name.com") still uses basic `truncate` which can fail to constrain overflow in certain flex layouts.

## Solution

Apply the same `HorizontalScrollText` component to **both** the name and the metadata row in `ShortcutsList.tsx`. This ensures:

1. **Consistent behavior**: Both rows can be horizontally scrolled to reveal full content
2. **No layout overflow**: The container bounds are strictly enforced
3. **Better UX**: Users can swipe to see full type + target instead of it being cut off with ellipsis

## Files to Modify

### `src/components/ShortcutsList.tsx`

**Current (lines 538-541):**
```tsx
<span className="text-xs text-muted-foreground truncate block max-w-full">
  {typeLabel}
  {target && ` · ${target}`}
</span>
```

**Proposed:**
```tsx
<HorizontalScrollText className="text-xs text-muted-foreground">
  {typeLabel}
  {target && ` · ${target}`}
</HorizontalScrollText>
```

## Visual Result

```
┌────────────────────────────────────────────────────────┐
│ [Icon] │ Shortcut Name...→        │ 5 taps │    >     │
│        │ Link · very-long-targ...→                    │
└────────────────────────────────────────────────────────┘
         ↑                          ↑
         Swipe to scroll            Swipe to scroll
```

Both text rows can now be independently scrolled horizontally to reveal full content, while fixed elements (icon, badge, chevron) remain visible.

## Additional Consideration

The parent `div` (line 526) already has `max-w-full min-w-0` constraints, which should work properly with `HorizontalScrollText`. If needed, we can also add explicit width constraints to the button container.

## Testing Checklist

- Shortcuts with long names display correctly with horizontal scroll
- Shortcuts with long URLs/targets display correctly with horizontal scroll  
- Tap count badge always remains visible
- Chevron icon always remains visible
- Both rows can be scrolled independently
