

# Smart Page Title Auto-Fill for URL-Based Shortcuts and Reminders

## Overview

When users create One Tap Access shortcuts or Reminders from URLs, the name field currently defaults to just the hostname (e.g., "medium.com"). This change makes it smarter by using the fetched page title (truncated to 50 characters) as the default name wherever a URL is involved.

## What Changes for the User

- **Creating a shortcut from a URL**: The name input pre-fills with the page title (e.g., "How to Build a Great Product") instead of "medium.com"
- **Creating a reminder from a URL**: The name field pre-fills with the page title
- **Selecting a saved bookmark**: The bookmark's saved title is passed through and used as the default name
- **Shared URL / Clipboard URL flows**: The fetched title is carried forward into the shortcut or reminder name
- If the title is longer than 50 characters, it's truncated with an ellipsis
- If fetching fails or the user is offline, the hostname is used as before (graceful fallback)

## Technical Details

### 1. Helper: `smartTruncate()` in `src/lib/contentResolver.ts`

Add a utility function that truncates a string to a max length (default 50), breaking at the last word boundary:

```ts
export function smartTruncate(text: string, maxLen = 50): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.6 ? truncated.slice(0, lastSpace) : truncated) + '...';
}
```

### 2. `ShortcutCustomizer.tsx` -- Update name when page title loads

Currently (line 30): `useState(() => getContentName(source))` initializes name to hostname.

Add an effect that updates the name when `urlMetadata?.title` becomes available **if the user hasn't manually edited it**:

- Track whether the user has manually typed in the name field
- When metadata title loads and the current name is still the auto-generated hostname, replace it with the truncated page title
- Increase `maxLength` from 30 to 50 on the input

### 3. `ScheduledActionCreator.tsx` -- Use `useUrlMetadata` for URL destinations

Currently `getSuggestedName` returns `dest.name` which is always the hostname. Changes:

- Import and call `useUrlMetadata(destination?.type === 'url' ? destination.uri : null)` in the component
- When metadata loads and name is still the auto-suggested hostname, update `name` state with the truncated page title
- This applies to both manual URL entry and bookmark selection flows

### 4. `SavedLinksSheet.tsx` -- Pass bookmark title alongside URL

Change the `onSelectLink` callback signature from `(url: string)` to `(url: string, title?: string)` so the saved bookmark title is forwarded to the consumer.

Update the `handleSelect` function to pass `link.title` as the second argument.

### 5. Update all `onSelectLink` / `handleBookmarkSelect` consumers

**AccessFlow.tsx** (`handleBookmarkSelected`):
- Accept the title parameter
- When creating a shortcut: title will be picked up automatically by ShortcutCustomizer via metadata (no change needed)
- When creating a reminder: pass `name: title || hostname` in the destination

**ScheduledActionCreator.tsx** (`handleBookmarkSelect`):
- Accept the title parameter
- Use `name: title || hostname` in the destination so `getSuggestedName` returns the real title

### 6. Shared URL and Clipboard flows -- forward fetched title

**Index.tsx** -- When SharedUrlActionSheet triggers "Create Shortcut" or "Create Reminder", the fetched `metadata.title` is already available. Update:

- `handleSharedUrlCreateShortcut`: No change needed (ShortcutCustomizer fetches metadata itself)
- `handleSharedUrlCreateReminder`: Pass the fetched title into the `ScheduledActionDestination.name` field
- `handleClipboardCreateReminder` in AccessFlow: Same pattern -- the metadata is fetched by ClipboardSuggestion, but currently the destination name is hostname. The ClipboardSuggestion already has metadata; pass its title through.

### 7. `ClipboardSuggestion.tsx` -- forward title in reminder callback

Update `onCreateReminder` calls to pass the fetched metadata title alongside the URL so AccessFlow can use it for the destination name.

## Character Limit Strategy

- Input `maxLength` on ShortcutCustomizer: increase from 30 to 50
- `smartTruncate` default: 50 characters
- This allows descriptive names while fitting on Android home screen labels (which typically show 12-14 chars but the full name appears in app info)

## File Change Summary

| File | Change |
|------|--------|
| `src/lib/contentResolver.ts` | Add `smartTruncate()` helper |
| `src/components/ShortcutCustomizer.tsx` | Auto-update name when metadata title loads; increase maxLength to 50 |
| `src/components/ScheduledActionCreator.tsx` | Add `useUrlMetadata` hook; update name when title loads; accept title from bookmark picker |
| `src/components/SavedLinksSheet.tsx` | Change `onSelectLink` signature to include title |
| `src/components/AccessFlow.tsx` | Pass bookmark title through; forward metadata title to reminder destinations |
| `src/components/ClipboardSuggestion.tsx` | Forward fetched title in reminder callback |
| `src/pages/Index.tsx` | Forward metadata title when creating reminders from shared URLs |

