

# Fix: Hamburger Menu Not Scrollable in Landscape Mode

## Problem

The hamburger menu (AppMenu) uses a flex column layout inside a side Sheet, but has no scroll container. In landscape mode, the available viewport height is roughly 300-400px. The menu content (header + 3 menu items + cloud backup + separator + theme picker + safe-bottom padding) easily exceeds this, making bottom items unreachable.

## Affected Component

**`src/components/AppMenu.tsx`** -- the main (and only) component that needs fixing.

### Other components already handle landscape correctly:
- **SettingsPage**: Uses `ScrollArea className="flex-1"` around its content -- OK
- **BookmarkLibrary**: Uses `ScrollArea` with flex layout -- OK
- **ProfilePage**: Uses `ScrollArea` -- OK
- **NotificationsPage**: Uses `ScrollArea` -- OK
- **SavedLinksSheet**: Uses `ScrollArea` with explicit `landscape:h-[90vh]` -- OK
- **TrashSheet**: Uses `ScrollArea` -- OK

The hamburger menu is the only view missing scroll support.

## Solution

Wrap the entire menu body (items + theme section) in a `ScrollArea` so it scrolls when content exceeds the available height. The layout changes:

**Before:**
```
SheetContent (flex col, full height)
  SheetHeader (shrink-0)
  div.flex-1 (menu items -- overflows in landscape)
  div.mt-auto (theme picker -- pushed off-screen)
```

**After:**
```
SheetContent (flex col, full height)
  SheetHeader (shrink-0)
  ScrollArea.flex-1.min-h-0 (scrollable container)
    div (menu items)
    div (theme picker -- now scrollable into view)
```

## Technical Details

### File: `src/components/AppMenu.tsx`

1. Import `ScrollArea` from `@/components/ui/scroll-area`

2. Wrap the menu items div and theme section together inside a single `ScrollArea`:
   - The `ScrollArea` gets `className="flex-1 min-h-0"` (min-h-0 is critical for flex children to allow shrinking below content size)
   - Inside the ScrollArea, place both the menu items and the theme section as siblings in a wrapper div
   - Remove `mt-auto` from the theme section since it will now be in the normal flow inside the scroll container
   - Add a spacer (`flex-1`) between menu items and theme section so theme stays at the bottom when there's room, but scrolls when there isn't

This approach ensures:
- In portrait mode: theme stays at the bottom (same as current behavior)
- In landscape mode: everything is reachable by scrolling
- No visual change when content fits
