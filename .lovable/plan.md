
# Fix: Page Title Not Used for Recognized Platform URLs

## Root Cause

There are two connected issues:

1. **ShortcutCustomizer skips metadata fetch for recognized platforms**: Line 60-61 only fetches metadata when `!detectedPlatform` (for favicon purposes). For Netflix, YouTube, etc., metadata is never fetched, so the title auto-fill effect (lines 104-109) never fires.

2. **SharedUrlActionSheet doesn't pass title through**: The `onCreateShortcut` callback is `() => void` -- the already-fetched title from the action sheet is discarded when routing to the shortcut creation flow.

This means the name stays as `getContentName()` which returns `"Netflix Link"` (from `parseDeepLink` at line 141 of contentResolver.ts).

## Fix

### 1. `ShortcutCustomizer.tsx` -- Always fetch metadata for URL sources

Change `useUrlMetadata` to always run for URL sources (not just unrecognized ones). The favicon logic can stay conditional, but the title needs metadata regardless.

- Add a separate `shouldFetchMetadata` flag: `isUrlSource` (always true for URLs)
- Use `shouldFetchMetadata` for the `useUrlMetadata` call
- Keep `shouldFetchFavicon` only for the favicon icon update effect

### 2. Pass title from SharedUrlActionSheet through the flow

Update the chain so the already-fetched title from `SharedUrlActionSheet` is forwarded:

- **SharedUrlActionSheet.tsx**: Change `onCreateShortcut` from `() => void` to `(title?: string) => void`. Pass `metadata?.title` when calling it.
- **Index.tsx** (`handleCreateSharedShortcut`): Accept the title parameter and store it alongside the URL (add a `shortcutTitleFromShare` state or pass as a tuple).
- **AccessFlow.tsx**: Accept an optional `initialTitleForShortcut` prop and pass it into the `ContentSource` name field so `ShortcutCustomizer` starts with the correct title immediately (no re-fetch needed).

### 3. `getContentName` improvement

Update the `"${platform} Link"` fallback in `getContentName()` to apply `smartTruncate` and prefer `source.name` (which it already does at line 134, but callers need to set it).

## File Changes

| File | Change |
|------|--------|
| `src/components/ShortcutCustomizer.tsx` | Fetch metadata for ALL URL sources, not just unrecognized ones |
| `src/components/SharedUrlActionSheet.tsx` | Pass `metadata?.title` in `onCreateShortcut` callback |
| `src/pages/Index.tsx` | Store and forward the shared title to AccessFlow |
| `src/components/AccessFlow.tsx` | Accept and use `initialTitleForShortcut` prop |

## Result

- Netflix shared URL: name will show the page title (e.g., "Stranger Things - Netflix") instead of "Netflix Link"
- Works for all recognized platforms (YouTube, Spotify, etc.)
- Title appears immediately when coming from SharedUrlActionSheet (no re-fetch)
- Falls back to fetching if no title was pre-provided
- Hostname fallback still works if fetch fails
