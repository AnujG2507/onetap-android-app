

## Update Documentation for Image Preview and Startup Cleanup

### What Changed

Two recent features are not reflected in the documentation:

1. **Image preview in shortcut customizer** -- images now open in the built-in slideshow viewer (not an external app) via a temporary `__preview_image__` entry in `localStorage`
2. **Startup cleanup** -- `App.tsx` removes any stale `__preview_image__` entry from `quicklaunch_shortcuts` on mount, guarding against app-kill during preview

### Changes

**File: `APP_SUMMARY.md`**

1. In the **Local Storage Keys > UI State** section (~line 113), add a brief note about `__preview_image__` being a transient preview entry cleaned up on startup.

2. In the **Key Components** section (~line 304), add a note to `ShortcutCustomizer.tsx` mentioning image preview routes to the built-in slideshow viewer.

3. Update the "Last updated" line at the bottom to reflect today's date and these additions.

**File: `ARCHITECTURE.md`**

No changes needed -- the architecture doc covers structural concepts (layers, proxy activities, data flow) and the preview feature is a UI-level behavior that fits better in `APP_SUMMARY.md`.

### Technical Details

In `APP_SUMMARY.md`, the additions are:

- Under UI State keys, after `clipboard_shown_urls`:
  ```
  __preview_image__ (transient)  Temporary shortcut entry for image preview; auto-cleaned on app startup
  ```

- Under Key Components, after `ShortcutCustomizer.tsx`:
  ```
  - Image preview opens in the built-in slideshow viewer (`/slideshow/__preview_image__`); stale entries cleaned on app startup in `App.tsx`
  ```

- Updated last-updated line to: `February 22, 2026 -- reflects image preview via built-in slideshow viewer and startup cleanup for stale preview entries`

