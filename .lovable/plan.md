

## Goal
Remove the excessive gap between the type label (e.g., "Link") and the target (e.g., "· jiobppulsecharg...") in the shortcuts list metadata row.

## Problem
The current grid layout uses:
- `minmax(0,40%)` for the type column - reserves up to 40% width even when type is short like "Link"
- `gap-2` (8px) between all columns - creates visible separation

## Solution
Change the metadata row from a 3-column grid to a simpler flex layout where:
- Type label uses `shrink-0` (fixed width based on content)
- Target uses `flex-1 min-w-0 truncate` (fills remaining space, truncates)
- Badge uses `shrink-0` (fixed width)
- Use `gap-1.5` (6px) for tighter spacing between type and target

## File Change

**`src/components/ShortcutsList.tsx`** (line 151-158)

Change:
```tsx
<div className="mt-0.5 min-w-0 overflow-hidden grid grid-cols-[minmax(0,40%)_minmax(0,1fr)_auto] items-center gap-2">
  <span className="text-xs text-muted-foreground truncate">
    {typeLabel}
  </span>

  <span className="text-xs text-muted-foreground truncate">
    {target ? `· ${target}` : ''}
  </span>
```

To:
```tsx
<div className="mt-0.5 min-w-0 overflow-hidden flex items-center gap-1.5">
  <span className="text-xs text-muted-foreground shrink-0">
    {typeLabel}
  </span>

  <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
    {target ? `· ${target}` : ''}
  </span>
```

## Why This Works
- `shrink-0` on type label means it takes exactly the width of "Link", "Photo", etc. - no extra space
- `gap-1.5` reduces the gap from 8px to 6px for tighter visual grouping
- `flex-1 min-w-0 truncate` on target ensures it fills remaining space and truncates properly
- Badge keeps `shrink-0` so it's always visible

## Result
The type and target will appear close together like: `Link · jiobppulsecharg...` instead of `Link          · jiobppulsecharg...`

