

## Simplify Access Tab: Remove Link Tile, Reorganize to 2x3 Grid

### What Changes

Remove the "Link" tile from the main content grid in the Access tab. The link/URL shortcut functionality remains fully intact -- users can still create link shortcuts via:
- Clipboard detection suggestions
- Bookmark library ("Saved Bookmarks" secondary button)
- Share sheet (URLs shared from other apps)
- Back navigation from the link shortcut customizer

### New Layout

```text
Row 1:  [Photo]    [Video]    [Audio]
Row 2:  [Document] [Contact]  [Text]
```

Both rows use 3 equal columns, creating a clean, symmetrical grid.

### Technical Details

**File: `src/components/ContentSourcePicker.tsx`**

1. Remove the Link `GridButton` from the grid (lines 210-218) -- the block rendering the Link tile with `onEnterUrl`
2. Merge all 6 tiles into a single grid section with `grid-cols-3` instead of the current split of Row 1 (4 cols) and Row 2 (3 cols)
3. Reorder tiles: Photo, Video, Audio, Document, Contact, Text
4. Update the `activePicker` conditional grid layout to use `grid-cols-1` when a picker is active (unchanged) and `grid-cols-3` when collapsed
5. Remove the landscape `grid-cols-7` override (now 6 items, so `landscape:grid-cols-6`)
6. The `link` type remains in the `ActivePicker` type and `handleActionSelect` for internal use (clipboard suggestion still triggers it), but the tile is simply not rendered

No changes needed to `AccessFlow.tsx` -- the `onEnterUrl` prop and URL step logic remain intact for all other entry points.

