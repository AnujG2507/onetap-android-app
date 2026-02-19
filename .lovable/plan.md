

# Fix: Long Title Overflow in Viewer Headers

## Scope

After reviewing all viewer components:
- **SlideshowViewer** -- HAS the bug (title text pushes buttons off-screen)
- **VideoPlayer** -- NOT affected (no title displayed in header, just back/share/open buttons)
- **Native PDF Viewer** -- NOT affected (handled entirely in Java, not web)

Only `SlideshowViewer.tsx` needs fixing.

## Changes

### File: `src/pages/SlideshowViewer.tsx`

Three CSS class additions in the header bar (around lines 374-387):

1. **Left container** (back button + title): Add `min-w-0 flex-1` so it can shrink
2. **Title span**: Add `truncate` so long names get ellipsis
3. **Right container** (counter + share + open): Add `flex-shrink-0` so buttons never compress

### Before
```
[<-] My Very Long Shortcut Name That Goes On And On   [1/1] [Share] [Open]
                                                        ^^^ pushed off screen
```

### After
```
[<-] My Very Long Shortcut Na...   [1/1] [Share] [Open]
```

### Technical Detail

- Line ~375: `<div className="flex items-center gap-3">` becomes `<div className="flex items-center gap-3 min-w-0 flex-1">`
- Line ~384: `<span className="text-white font-medium">` becomes `<span className="text-white font-medium truncate">`
- Line ~387: `<div className="flex items-center gap-2">` becomes `<div className="flex items-center gap-2 flex-shrink-0">`

No other files need changes.

