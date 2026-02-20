
## Rename "Trash" to "Bookmark Trash" Throughout the App

### Goal

The trash feature exclusively holds deleted bookmarks (saved URLs), not access points (shortcuts). The current label "Trash" is misleading — renaming it to "Bookmark Trash" makes it unambiguous.

### Scope — One File, All Changes

All visible "Trash" labels come from a single source of truth: `src/i18n/locales/en.json`. Every component (`TrashSheet`, `AppMenu`, `BookmarkLibrary`, `BookmarkActionSheet`, `BookmarkItem`, `SettingsPage`) reads these keys via `t('key')`. Changing the translation file is all that is needed — no component logic changes required.

### All Keys to Update

| Key | Before | After |
|-----|--------|-------|
| `menu.trash` | `"Trash"` | `"Bookmark Trash"` |
| `trash.title` | `"Trash"` | `"Bookmark Trash"` |
| `trash.empty` | `"Trash is empty"` | `"Bookmark Trash is empty"` |
| `trash.noItems` | `"No items in trash"` | `"No items in Bookmark Trash"` |
| `trash.emptyTrash` | `"Empty Trash"` | `"Empty Bookmark Trash"` |
| `trash.emptyTrashConfirm` | `"Empty Trash?"` | `"Empty Bookmark Trash?"` |
| `trash.emptyTrashDesc` | `"...in trash. This action..."` | `"...in Bookmark Trash. This action..."` |
| `trash.trashEmptied` | `"Trash emptied"` | `"Bookmark Trash emptied"` |
| `settingsPage.trashSettings` | `"Trash"` | `"Bookmark Trash"` |
| `settingsPage.trashSettingsDesc` | `"Configure how deleted items are handled"` | unchanged (already clear) |
| `settingsPage.trashRetention` | `"Trash settings"` | `"Bookmark Trash settings"` |
| `library.movedToTrash` | `"Moved to trash"` | `"Moved to Bookmark Trash"` |
| `library.deleteConfirmDesc` | `"...moved to trash. Items in trash are..."` | `"...moved to Bookmark Trash. Items in Bookmark Trash are..."` |
| `library.moveToTrash` | `"Move to Trash"` | `"Move to Bookmark Trash"` |
| `bookmarkAction.moveToTrash` | `"Move to Trash"` | `"Move to Bookmark Trash"` |
| `bookmarkAction.deleteConfirmDesc` | `"...moved to trash. Items in trash are..."` | `"...moved to Bookmark Trash. Items in Bookmark Trash are..."` |

### What Stays the Same

- All internal code variable names (`getTrashLinks`, `moveToTrash`, etc.) — these are internal and don't need renaming.
- Back-end storage keys — data is unaffected.
- The `trash.emptyDesc` description already says "Deleted bookmarks will appear here..." — that body text is already clear, only the title/button references need updating.
- All confirmation body text that only says "...from trash back to your bookmarks" will be kept as-is since context is clear.

### Files Changed

- `src/i18n/locales/en.json` — update the 16 string values listed above.
