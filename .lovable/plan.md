

# Shared File Action Sheet -- Auto-Dismiss Pop-Up for Incoming Files

## Overview

Create a `SharedFileActionSheet` component that mirrors the existing `SharedUrlActionSheet` pattern. When a file is shared via Android Share Sheet, instead of silently routing to AccessFlow, show a brief pop-up with action options -- consistent with how shared URLs are handled today.

## What the User Sees

When a file is shared to the app, a bottom sheet appears showing:

- **File preview card**: File icon (based on MIME type), file name, and file type label
- **Two action buttons**:
  - **One Tap Access** (primary) -- creates a home screen shortcut for the file
  - **Remind Later** (secondary) -- creates a reminder for the file
- Swipe-down-to-close gesture and X button to dismiss

This is intentionally simpler than the URL action sheet (no "Quick Save" or "Edit & Save" since files don't go to the bookmark library).

## Technical Details

### 1. New Component: `src/components/SharedFileActionSheet.tsx`

Modeled directly on `SharedUrlActionSheet.tsx` but adapted for files:

- **Props**: `file: ContentSource`, `onCreateShortcut()`, `onCreateReminder()`, `onDismiss()`
- **Preview card**: Shows a file type icon (Image/Video/PDF/Document/Audio icon from lucide), the file name (from `file.name` or fallback to MIME type label), and MIME type subtitle
- **Action buttons**: 2-button layout (not 2x2 grid) -- "One Tap Access" with Smartphone icon, "Remind Later" with Bell icon
- **Swipe-to-close**: Same 80px threshold with haptic feedback
- **Back button**: Registers with `useSheetBackHandler`
- **Animations**: Same slide-in-from-bottom / fade-out pattern

### 2. Modify `src/pages/Index.tsx`

Replace the current direct-to-AccessFlow routing for shared files with the new action sheet:

**Current flow (lines 246-254)**:
```
if (sharedContent.type === 'file') {
  setInitialFileSource(sharedContent);
  setActiveTab('access');
  clearSharedContent();
}
```

**New flow**:
```
if (sharedContent.type === 'file') {
  setPendingSharedFile(sharedContent);  // new state
  clearSharedContent();
}
```

Add new state and handlers:
- `pendingSharedFile: ContentSource | null` -- holds the file while the action sheet is open
- `handleCreateSharedFileShortcut()` -- routes to AccessFlow with `initialFileSource`
- `handleCreateSharedFileReminder()` -- routes to Reminders tab with file destination
- `handleDismissSharedFile()` -- clears the pending file

Render `SharedFileActionSheet` when `pendingSharedFile` is set (alongside the existing `SharedUrlActionSheet` render block).

### 3. Multi-File (Slideshow) Shares -- Same Pattern

For multiple images shared, also show the action sheet before routing to slideshow creation:

**Current flow (lines 262-271)**:
```
if (sharedMultiFiles) {
  setInitialSlideshowSource(sharedMultiFiles);
  setActiveTab('access');
  clearSharedContent();
}
```

**New flow**:
```
if (sharedMultiFiles) {
  setPendingSharedFile(multiFilesToContentSource(sharedMultiFiles));  // convert to display format
  setPendingSharedMultiFiles(sharedMultiFiles);  // keep original for routing
  clearSharedContent();
}
```

The action sheet will show "X images" as the file description. "One Tap Access" routes to slideshow creation, "Remind Later" is hidden for slideshows (reminders don't support multi-file destinations).

Actually, to keep it simpler and more consistent:
- Single files: show action sheet with "One Tap Access" + "Remind Later"
- Multiple images: show action sheet with "One Tap Access" only (since reminders don't support slideshow destinations)

### 4. File Icon Selection Logic

Use lucide icons based on MIME type prefix:
- `image/*` -- ImageIcon
- `video/*` -- Video
- `audio/*` -- Music
- `application/pdf` -- FileText
- Everything else -- File

### 5. No New Translation Keys

Toast messages and action labels will reuse existing keys where possible (`sharedUrl.shortcut`, `sharedUrl.remindLater`) or use hardcoded English strings consistent with the existing pattern.

## File Change Summary

| File | Change |
|------|--------|
| `src/components/SharedFileActionSheet.tsx` | **New** -- Action sheet for shared files |
| `src/pages/Index.tsx` | Route shared files/slideshow through action sheet instead of directly to AccessFlow |

## Flow Summary

```text
File shared via Share Sheet
    |
    +-- Single file --> SharedFileActionSheet
    |                       |
    |                       +-- "One Tap Access" --> AccessFlow customize step
    |                       +-- "Remind Later"   --> Reminders tab with file destination
    |                       +-- Dismiss/Swipe    --> Exit, no action
    |
    +-- Multiple images --> SharedFileActionSheet (slideshow variant)
    |                       |
    |                       +-- "One Tap Access" --> AccessFlow slideshow-customize step
    |                       +-- Dismiss/Swipe    --> Exit, no action
    |
    +-- Mixed/multi non-image --> Toast + Exit (unchanged)
```
