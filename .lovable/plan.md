

# Fix: Light Mode Color Contrast Issues

## Problem

Several UI elements have text/icon colors that blend into the background in light mode, making them hard to read or invisible. The most noticeable is the "Move to Trash" button, but the issue exists in multiple places.

## Issues Identified

### Issue 1: BookmarkActionSheet -- "Move to Trash" button looks identical to non-destructive actions
**File**: `src/components/BookmarkActionSheet.tsx` (lines 379-385)

The "Move to Trash" action uses `text-muted-foreground` (gray) for both the icon and text, making it indistinguishable from non-destructive actions like "Edit" or "Open". It should have a warning/destructive tint to signal its nature.

**Fix**: Change icon and text color to `text-destructive` with a subtle destructive hover background, matching the pattern used by `ShortcutActionSheet.tsx` and `ScheduledActionActionSheet.tsx` for their delete buttons.

```
Before: className="w-full flex items-center gap-3 p-3 ... hover:bg-muted/50 ..."
         <Trash2 className="... text-muted-foreground" />
         <span className="font-medium ...">{t('bookmarkAction.moveToTrash')}</span>

After:  className="w-full flex items-center gap-3 p-3 ... hover:bg-destructive/10 ... text-destructive"
         <Trash2 className="..." />
         <span className="font-medium ...">{t('bookmarkAction.moveToTrash')}</span>
```

### Issue 2: BookmarkItem -- "Move to Trash" confirmation button blends into background
**File**: `src/components/BookmarkItem.tsx` (lines 412-416)

The "Move to Trash" button in the delete confirmation dialog uses `outline` variant styling: `bg-background` (white) with default foreground text. On a white dialog background, it nearly disappears -- just a faint border.

**Fix**: Use a more visible styling with an amber/warning tone to differentiate it from "Cancel" while keeping it less severe than "Delete Permanently".

```
Before: className="border border-input bg-background hover:bg-accent hover:text-accent-foreground"
After:  className="border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
```

### Issue 3: TrashItem -- Expiry countdown text too faint when not urgent
**File**: `src/components/TrashItem.tsx` (lines 218-220)

When `daysRemaining > 7`, the countdown uses `text-muted-foreground` (45% gray on ~98% white = low contrast). This is fine for secondary info, but the trash context makes timing important.

**Fix**: Bump from `text-muted-foreground` to `text-foreground/70` for better readability.

```
Before: daysRemaining <= 7 ? "text-destructive" : "text-muted-foreground"
After:  daysRemaining <= 7 ? "text-destructive" : "text-foreground/70"
```

### Issue 4: BookmarkActionSheet -- "Delete Permanently" icon inherits parent color inconsistently
**File**: `src/components/BookmarkActionSheet.tsx` (lines 390-393)

The trash icon on "Delete Permanently" has no explicit color class -- it inherits `text-destructive` from the parent, but this is implicit and could break. Should be explicit.

**Fix**: No change needed -- the parent `text-destructive` class cascades correctly. This is already fine.

### Issue 5: ScheduledActionItem -- Disabled state too faint
**File**: `src/components/ScheduledActionItem.tsx` (line 330)

When a scheduled action is disabled and not a platform URL and not a contact, the icon area uses `bg-muted text-muted-foreground`. The muted foreground on muted background in light mode has very low contrast (45% gray on 94% gray = roughly 3.4:1, borderline WCAG AA).

**Fix**: Use slightly darker text for disabled icons.

```
Before: "bg-muted text-muted-foreground"
After:  "bg-muted text-muted-foreground/80"
```

Wait -- `/80` makes it lighter. The issue is `text-muted-foreground` (45%) on `bg-muted` (94%) which is actually fine at ~3.4:1. Leave this as-is.

## Summary of Changes

| File | Change | Impact |
|------|--------|--------|
| `BookmarkActionSheet.tsx` | "Move to Trash" button: change to `text-destructive` with `hover:bg-destructive/10` | Most visible fix -- trash action now clearly looks destructive |
| `BookmarkItem.tsx` | "Move to Trash" confirmation button: amber styling instead of outline | Button no longer invisible on white dialog |
| `TrashItem.tsx` | Non-urgent expiry text: `text-foreground/70` instead of `text-muted-foreground` | Slightly better readability for trash countdown |

3 files, 3 targeted changes. No design system or CSS variable changes needed.
