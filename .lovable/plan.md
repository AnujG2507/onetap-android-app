
## Problem

The primary content grid uses a single CSS grid with `grid-cols-4` in portrait. With 7 tiles (4 + 3), the second row of 3 tiles each occupies one `1/4`-width column slot and leaves the 4th slot empty. The 3 tiles do not stretch to fill the remaining horizontal space.

## Root Cause

CSS grid places items into columns strictly based on the `grid-cols-N` value. Items in an incomplete last row are left-aligned and sized to `1/4` width — they do not auto-expand. There is no native CSS grid option to make the last row's items fill the full width without changing the grid definition.

## Solution: Two Separate Rows Instead of One Grid

Replace the single 7-item `grid-cols-4` grid with two explicitly separate rows:

- **Row 1**: `grid grid-cols-4 gap-3` — Photo, Video, Audio, Document (4 tiles, each 1/4 width)
- **Row 2**: `grid grid-cols-3 gap-3` — Contact, Link, Text (3 tiles, each 1/3 width — exactly fills the same total width)

Since both rows share the same `gap-3` and are the same width container, the 3 tiles in row 2 will be visually equal in width to the 4 tiles in row 1's proportional span, and will fill the full horizontal width.

In landscape, both rows merge into a single `grid-cols-7` row (all 7 tiles side-by-side) — this is handled by wrapping the two-row structure in a `landscape:` override that switches to a flex or 7-column grid.

## Exact Layout Plan

```text
Portrait:
┌──────┬──────┬──────┬──────┐
│Photo │Video │Audio │ Doc  │   ← grid-cols-4
├──────┴──┬───┴──┬───┴──────┤
│Contact  │ Link │   Text   │   ← grid-cols-3 (fills full width)
└─────────┴──────┴──────────┘

Landscape:
┌──┬──┬──┬──┬──┬──┬──┐
│Ph│Vi│Au│Do│Co│Li│Tx│   ← grid-cols-7 (unchanged)
└──┴──┴──┴──┴──┴──┴──┘
```

## Implementation

### File: `src/components/ContentSourcePicker.tsx`

**Change**: Replace the single `<div id="tutorial-content-grid" className="grid gap-3 ... grid-cols-4 landscape:grid-cols-7">` containing all 7 `GridButton`s with a wrapper div that holds two sub-grids in portrait but collapses to a 7-column grid in landscape.

The approach:

```jsx
{/* Portrait: two rows. Landscape: single 7-col row */}
<div id="tutorial-content-grid" className={cn(
  "transition-all duration-200",
  activePicker
    ? "grid grid-cols-1 gap-3"
    : "flex flex-col gap-3 landscape:grid landscape:grid-cols-7 landscape:gap-3"
)}>
  {/* Row 1 (portrait) — 4 tiles */}
  <div className={cn(
    "grid grid-cols-4 gap-3",
    "landscape:contents"  /* dissolve into parent 7-col grid in landscape */
  )}>
    {/* Photo, Video, Audio, Document */}
  </div>

  {/* Row 2 (portrait) — 3 tiles, fills full width */}
  <div className={cn(
    "grid grid-cols-3 gap-3",
    "landscape:contents"  /* dissolve into parent 7-col grid in landscape */
  )}>
    {/* Contact, Link, Text */}
  </div>
</div>
```

The key insight is `landscape:contents` on the sub-divs. `display: contents` makes an element "disappear" from the layout — its children are treated as direct children of the parent grid, so in landscape mode they all flow into the 7-column parent grid.

When `activePicker` is set, the outer wrapper switches to `grid-cols-1` and the sub-divs also switch to `grid-cols-1` (each tiles only shows the active one anyway via the conditional rendering).

### Handling the `activePicker` single-column collapse

When an `activePicker` is active, only one tile is rendered (the active one). The two-row structure still works because only one item total renders. The outer `grid-cols-1` collapse is unchanged.

### Conditional rendering with `onSelectContact` / `onEnterUrl`

The Contact tile only renders if `onSelectContact` is passed. The Link tile only renders if `onEnterUrl` is passed. If neither prop is passed, row 2 could have 1-2 tiles. For the standard `AccessFlow` usage both props are always present (7 tiles), so the layout is always the full 4+3 split. This matches existing behaviour.

## No Other Files Affected

This is a pure layout change in one component. No type changes, no logic changes, no i18n changes needed.
