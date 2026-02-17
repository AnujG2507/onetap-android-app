

# Dormant Shortcut Reconnect UX

## Problem

When a shortcut is in the "dormant" state (synced from cloud, missing local file), users cannot reconnect a file because:

1. The `updateShortcut` function only accepts cosmetic fields (name, icon, quickMessages, etc.) -- it cannot update `contentUri`, `syncState`, `mimeType`, `thumbnailData`, or `fileSize`.
2. The action sheet hides the "Open" button for dormant shortcuts but does not offer a "Reconnect file" alternative.
3. The edit sheet has no reconnect capability at all.
4. The list item says "Tap to reconnect" but tapping just opens the same action sheet with no reconnect option.

## Solution

A three-part fix that adds reconnect capability at the data layer, action sheet, and edit sheet.

---

### Part 1: Extend `updateShortcut` to accept reconnect fields

In `src/hooks/useShortcuts.ts`, widen the `updates` type to also accept:
- `contentUri`
- `syncState`
- `mimeType`
- `fileSize`
- `thumbnailData`
- `originalPath`

This is the minimum set needed to transition a shortcut from dormant to active after the user picks a file.

---

### Part 2: Add "Reconnect file" action to the action sheet

In `src/components/ShortcutActionSheet.tsx`:

- When the shortcut is dormant, replace the hidden "Open" button with a prominent "Reconnect file" button (using a `Link2` or `FolderOpen` icon).
- Tapping it triggers a new `onReconnect` callback prop.
- The button uses calm language matching the dormant notice: same tone as "Tap to reconnect file."

---

### Part 3: Add reconnect section to the edit sheet

In `src/components/ShortcutEditSheet.tsx`:

- When editing a dormant shortcut, show a prominent reconnect banner at the top of the form (above the name field).
- The banner shows a file-type-aware message (e.g., "This PDF needs a local file") and a "Choose file" button.
- Tapping "Choose file" triggers the native file picker (using the existing `contentResolver` / `ShortcutPlugin.pickFile` mechanism).
- On successful file selection, the shortcut's `contentUri`, `mimeType`, `thumbnailData`, `fileSize` are updated and `syncState` is cleared (set to `undefined` / active).
- The save button then works as normal.

---

### Part 4: Wire up reconnect flow in MyShortcutsContent

In `src/components/MyShortcutsContent.tsx`:

- Add a `handleReconnect` callback that:
  1. Closes the action sheet
  2. Opens the file picker appropriate for the shortcut's `fileType` (image, video, pdf, document)
  3. On file selection, calls the extended `updateShortcut` with the new file data and `syncState: undefined`
  4. Shows a calm success toast
- Pass `onReconnect` to the `ShortcutActionSheet`.

---

### Part 5: Add translation keys

In `src/i18n/locales/en.json`, add:
- `shortcuts.reconnectFile` -- "Reconnect file"
- `shortcuts.reconnectBanner` -- "This {fileType} needs a local file to work."
- `shortcuts.reconnectChoose` -- "Choose file"
- `shortcuts.reconnected` -- "File reconnected"

---

## Technical Details

### Files changed

| File | Change |
|------|--------|
| `src/hooks/useShortcuts.ts` | Widen `updateShortcut` type to include `contentUri`, `syncState`, `mimeType`, `fileSize`, `thumbnailData`, `originalPath` |
| `src/components/ShortcutActionSheet.tsx` | Add `onReconnect` prop; show reconnect button for dormant shortcuts |
| `src/components/ShortcutEditSheet.tsx` | Add dormant reconnect banner with file picker trigger; on file pick, populate reconnect fields |
| `src/components/MyShortcutsContent.tsx` | Add `handleReconnect` handler using native file picker; pass to action sheet |
| `src/i18n/locales/en.json` | Add reconnect-related translation keys |

### UX Flow

```text
User taps dormant shortcut in list
  --> Action sheet opens
    --> "Reconnect file" button visible (replaces "Open")
      --> User taps it
        --> Native file picker opens (filtered by file type)
          --> User picks file
            --> updateShortcut called with new contentUri + syncState cleared
              --> Toast: "File reconnected"
              --> Shortcut is now active
```

Alternative path via Edit:
```text
User taps Edit on a dormant shortcut
  --> Edit sheet opens with reconnect banner at top
    --> User taps "Choose file"
      --> File picker opens
        --> File selected, fields populated in edit form
          --> User taps Save
            --> Shortcut saved as active
```

### What this does NOT change

- No new screens or navigation
- No changes to cloud sync logic
- No changes to deletion tracking
- No file uploads

