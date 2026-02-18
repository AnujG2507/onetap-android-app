
# Bulletproof Preview & Thumbnail Experience

## Summary

Six targeted changes to eliminate blank preview states, add reminder parity for slideshow shares, and make every fallback feel designed.

---

## Change 1: Enable Reminders for Slideshow Shares

**File:** `src/pages/Index.tsx`

Remove the `hideReminder` flag for multi-image shares. Currently line 687 sets `hideReminder={!!pendingSharedMultiFiles}`, which blocks reminder creation for slideshows.

- Remove `hideReminder` prop (or set to `false`)
- The existing `handleCreateSharedFileReminder` callback already handles file-based reminders correctly -- it will use the first file's URI and name

---

## Change 2: Add Image Preview to SharedFileActionSheet

**File:** `src/components/SharedFileActionSheet.tsx`

Replace the generic `FileIcon` in the preview card with an actual thumbnail when the file is an image.

- Import `ImageWithFallback` and `buildImageSources` from existing utilities
- When `file.mimeType` starts with `image/`, attempt to render the thumbnail using `ImageWithFallback` with the file's `thumbnailData` and `uri`
- Fall back to the existing `FileIcon` component if no image sources are valid or loading fails
- For multi-image shares (when `displayName` like "3 images" is passed), show a stacked-images visual: a small `Layers` icon on a colored background instead of a single generic icon

---

## Change 3: Fix All "display:none" onError Handlers

Three locations where `onError` hides an image and leaves an empty container.

**File:** `src/components/SharedUrlActionSheet.tsx`
- **Video thumbnail (line ~232):** Replace `e.currentTarget.style.display = 'none'` with a state flag that switches to showing the platform badge or a `Play` icon on the muted background -- never an empty box
- **Favicon (line ~272):** Replace `display: none` with showing a `Globe` icon fallback (like how `ShortcutCustomizer` falls back to emoji)

**File:** `src/components/MyShortcutsContent.tsx`
- **Favicon icon type (line ~130):** Replace `display: none` with showing a `Globe` icon fallback inside the same container

---

## Change 4: Use ContentPreview in SharedFileActionSheet

**File:** `src/components/SharedFileActionSheet.tsx`

Replace the hand-rolled preview card (icon + fileName + fileSubtitle) with the existing `ContentPreview` component, which already handles:
- Platform detection for URLs
- Image thumbnails with `ImageWithFallback`
- File type emoji fallbacks
- Consistent styling

This eliminates duplicate preview logic. The `displayName` and `displaySubtitle` overrides will still work by wrapping `ContentPreview` with the override text when provided.

---

## Change 5: Improve SlideshowCustomizer Missing-Thumbnail State

**File:** `src/components/SlideshowCustomizer.tsx`

In `SortableImage`, when no thumbnail is available (line 78-83), replace the bare `Image` icon with a more intentional placeholder:
- Use a numbered badge overlay on a subtle gradient background
- Show the image index number prominently so the user knows which slot it represents
- This makes it clear the placeholder is deliberate, not broken

---

## Change 6: Harden Video Thumbnail in SharedUrlActionSheet

**File:** `src/components/SharedUrlActionSheet.tsx`

The video thumbnail section (lines 220-257) uses a raw `<img>` tag. Replace with `ImageWithFallback` so that:
- Failed video thumbnails gracefully fall back to the platform badge on a muted background with a play icon
- No empty `aspect-video` boxes are ever visible
- Loading state shows a skeleton (already handled by `ImageWithFallback`)

---

## Technical Details

### Files Modified
1. `src/pages/Index.tsx` -- 1 line change (remove `hideReminder`)
2. `src/components/SharedFileActionSheet.tsx` -- Replace preview card with `ContentPreview`, add image thumbnail support
3. `src/components/SharedUrlActionSheet.tsx` -- Fix 2 onError handlers, replace video thumbnail `<img>` with `ImageWithFallback`
4. `src/components/MyShortcutsContent.tsx` -- Fix 1 onError handler for favicon
5. `src/components/SlideshowCustomizer.tsx` -- Improve missing-thumbnail placeholder

### No New Files
All changes use existing components (`ContentPreview`, `ImageWithFallback`, `buildImageSources`) and utilities (`imageUtils`).

### No New Dependencies
Everything needed is already in the codebase.

### Testing Checklist
- Share a single image from gallery -- preview shows thumbnail in action sheet
- Share multiple images -- preview shows "N images" with Layers icon, reminder button is visible
- Share a URL with broken favicon -- Globe icon shown, not blank
- Share a YouTube link -- if thumbnail fails, play icon on muted background shown
- Open My Shortcuts with a favicon-based shortcut where favicon URL is broken -- Globe icon shown
- Create slideshow where one image has no thumbnail -- numbered placeholder shown
