

# Plan: Fix Shortcut List Item Overflow for Portrait and Landscape

## Problem Analysis

The shortcut list items overflow the screen in both portrait and landscape modes. The "Type + Target" metadata row continues to push content beyond the visible area. This happens due to a broken constraint chain in the flex hierarchy.

## Root Causes

### 1. ScrollArea Viewport Gap
The `ScrollAreaPrimitive.Viewport` component only has `w-full` but lacks `overflow-x-hidden`. This allows child content to expand beyond the intended width.

### 2. Incomplete Flex Constraint Inheritance  
While `min-w-0` and `overflow-hidden` are applied at some levels, the constraint chain breaks at key points:
- The outer `button` container needs explicit width clamping
- The metadata row's `flex-1` element doesn't properly truncate because parent constraints are incomplete

### 3. Landscape Mode Width
In landscape orientation, the sheet can span the full viewport width without constraint, amplifying any overflow issues.

## Solution

Apply a comprehensive constraint strategy at every level of the hierarchy:

```
SheetContent [flex flex-col, overflow-hidden, max-w-full]
  -> ScrollArea [flex-1, w-full, overflow-hidden]
       -> Inner div [p-2, w-full, overflow-hidden]
            -> button [w-full, max-w-full, overflow-hidden]
                 -> Icon [shrink-0, w-12]
                 -> Content [flex-1, min-w-0, overflow-hidden, max-w-[calc(100%-theme(spacing.16))]]
                      -> Title [truncate/break-all, w-full]
                      -> Metadata Row [flex, w-full, overflow-hidden]
                           -> Type+Target [truncate, flex-1, min-w-0]
                           -> Badge [shrink-0, whitespace-nowrap]
                 -> Chevron [shrink-0, w-4]
```

## File Changes

### File: `src/components/ShortcutsList.tsx`

#### Change 1: Add overflow constraint to SheetContent (Line 443)

Add `overflow-hidden` to prevent any content from escaping the sheet boundaries.

```tsx
<SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col overflow-hidden">
```

#### Change 2: Constrain ScrollArea and its container (Lines 569-580)

Add explicit width constraints and overflow control to the scroll container hierarchy.

```tsx
<ScrollArea className="flex-1 w-full overflow-hidden">
  <div className="p-2 w-full max-w-full overflow-hidden">
    {filteredShortcuts.map((shortcut) => (
      <ShortcutListItem
        key={shortcut.id}
        shortcut={shortcut}
        onTap={handleShortcutTap}
        t={t}
      />
    ))}
  </div>
</ScrollArea>
```

#### Change 3: Redesign ShortcutListItem layout (Lines 133-174)

Apply a strict constraint pattern to the entire item:

```tsx
function ShortcutListItem({ 
  shortcut, 
  onTap, 
  t 
}: { 
  shortcut: ShortcutData; 
  onTap: (shortcut: ShortcutData) => void;
  t: (key: string) => string;
}) {
  const [isTitleExpanded, setIsTitleExpanded] = useState(false);
  const typeLabel = getShortcutTypeLabel(shortcut, t);
  const target = getShortcutTarget(shortcut);
  const usageCount = shortcut.usageCount || 0;
  
  return (
    <button
      onClick={() => onTap(shortcut)}
      className="w-full max-w-full flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card mb-2 hover:bg-muted/50 active:bg-muted transition-colors text-start shadow-sm box-border"
    >
      {/* Icon - fixed size, never shrinks */}
      <div className="shrink-0 w-12 h-12">
        <ShortcutIcon shortcut={shortcut} />
      </div>
      
      {/* Text content - takes remaining space, strictly constrained */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {/* Title row */}
        <p 
          className={cn(
            "font-medium w-full",
            isTitleExpanded ? "break-all whitespace-normal" : "truncate"
          )}
          onClick={(e) => {
            e.stopPropagation();
            setIsTitleExpanded(!isTitleExpanded);
          }}
        >
          {shortcut.name}
        </p>
        
        {/* Metadata row - type, target, and badge */}
        <div className="flex items-center gap-2 mt-0.5 w-full overflow-hidden">
          <span className="text-xs text-muted-foreground truncate min-w-0 flex-shrink">
            {typeLabel}
            {target && ` · ${target}`}
          </span>
          <Badge 
            variant="outline" 
            className="shrink-0 text-[10px] px-1.5 py-0 h-5 font-semibold bg-primary/5 border-primary/20 text-primary whitespace-nowrap ml-auto"
          >
            {usageCount} {usageCount === 1 ? t('shortcuts.tap') : t('shortcuts.taps')}
          </Badge>
        </div>
      </div>
      
      {/* Chevron - fixed size, never shrinks */}
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}
```

Key changes in the item layout:
- `max-w-full` and `box-border` on the button to ensure it respects parent width including padding
- Removed redundant `flex-none` from icon (using explicit `w-12 h-12`)
- Changed metadata text from `flex-1` to `flex-shrink` with `min-w-0` - this allows it to shrink to fit
- Added `ml-auto` to the badge to push it to the right edge
- Added `w-full` to both title and metadata row for explicit width binding
- Added `overflow-hidden` to metadata row

### File: `src/components/ui/scroll-area.tsx`

#### Change: Add overflow-x constraint to Viewport (Line 11)

This is the critical fix - the viewport must prevent horizontal overflow:

```tsx
<ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit] overflow-x-hidden">
```

## Summary of Changes

| File | Location | Change |
|------|----------|--------|
| `ShortcutsList.tsx` | Line 443 | Add `overflow-hidden` to SheetContent |
| `ShortcutsList.tsx` | Line 569 | Add `w-full overflow-hidden` to ScrollArea |
| `ShortcutsList.tsx` | Line 570 | Add `w-full max-w-full` to inner div |
| `ShortcutsList.tsx` | Lines 133-174 | Redesign ShortcutListItem with strict constraints |
| `scroll-area.tsx` | Line 11 | Add `overflow-x-hidden` to Viewport |

## Visual Representation

```text
Portrait Mode (360px)                  Landscape Mode (800px)
+----------------------------------+   +----------------------------------------+
| SheetContent [overflow-hidden]   |   | SheetContent [overflow-hidden]         |
| +------------------------------+ |   | +------------------------------------+ |
| | ScrollArea [w-full]          | |   | | ScrollArea [w-full]                | |
| | +---------------------------+| |   | | +--------------------------------+ | |
| | | [Icon] [Title...] [>]     || |   | | | [Icon] [Title truncates...] [>]| | |
| | |        Link · domain [5]  || |   | | |        Link · longer.domain [5]| | |
| | +---------------------------+| |   | | +--------------------------------+ | |
| +------------------------------+ |   | +------------------------------------+ |
+----------------------------------+   +----------------------------------------+
```

## Testing Checklist

- Test in portrait mode (360px width) - items should not overflow horizontally
- Test in landscape mode (800px+ width) - items should stay within bounds
- Verify long titles truncate with ellipsis when collapsed
- Verify tapping title expands it to wrap without horizontal scroll
- Verify long domain names in metadata truncate properly
- Verify badge and chevron always remain visible on the right edge
- Test with extremely long titles (100+ characters with no spaces)

