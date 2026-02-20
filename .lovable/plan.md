
## Problem

When the shortcut creation flow moves from the source picker step to the customizer steps (`ShortcutCustomizer`, `ContactShortcutCustomizer`, `SlideshowCustomizer`, `UrlInput`), the header looks cramped compared to the My Access Points (MyShortcuts) page. Specifically:

- **Horizontal padding**: Customizer headers use `p-4` which gives 16px side padding. MyShortcuts uses `ps-5 pe-5` = 20px.
- **Top breathing room**: Customizer headers use `pt-header-safe-compact` = `calc(var(--android-safe-top) + 0.75rem)`. MyShortcuts uses `pt-header-safe` = `calc(var(--android-safe-top) + 1rem)`.

Both use `var(--android-safe-top)` so the status bar is not clipped in either — but the visual breathing room and side insets differ, making the customizer screens look tighter and inconsistent.

## Files to Change

| File | What Changes |
|------|-------------|
| `src/components/ShortcutCustomizer.tsx` | Header: `p-4 pt-header-safe-compact` → `px-5 pt-header-safe pb-4` (portrait); landscape keeps compact |
| `src/components/ContactShortcutCustomizer.tsx` | Header: `px-5 pt-header-safe-compact pb-4` → `px-5 pt-header-safe pb-4` (portrait); landscape keeps compact |
| `src/components/UrlInput.tsx` | Header: `p-4 pt-header-safe-compact` → `px-5 pt-header-safe pb-4` (portrait); landscape keeps compact |
| `src/components/SlideshowCustomizer.tsx` | Verify/align header padding to match |

## Exact Changes

### `ShortcutCustomizer.tsx` — line 197

```
// Before
<header className="flex items-center gap-3 p-4 pt-header-safe-compact landscape:p-3 border-b">

// After
<header className="flex items-center gap-3 px-5 pt-header-safe pb-4 landscape:px-4 landscape:pt-2 landscape:pb-2 border-b">
```

### `ContactShortcutCustomizer.tsx` — line 171

```
// Before
<header className="px-5 pt-header-safe-compact pb-4 landscape:px-4 landscape:pt-2 landscape:pb-2 flex items-center gap-4">

// After
<header className="px-5 pt-header-safe pb-4 landscape:px-4 landscape:pt-2 landscape:pb-2 flex items-center gap-4">
```

### `UrlInput.tsx` — line 146

```
// Before
<header className="flex items-center gap-3 p-4 pt-header-safe-compact landscape:p-3 landscape:pt-2 border-b">

// After
<header className="flex items-center gap-3 px-5 pt-header-safe pb-4 landscape:px-4 landscape:pt-2 landscape:pb-2 border-b">
```

### `SlideshowCustomizer.tsx`

Will verify and align header padding to use `px-5 pt-header-safe pb-4` in portrait (landscape stays compact) if it differs.

## Why This Is Safe

- `var(--android-safe-top)` is already present in both `pt-header-safe` and `pt-header-safe-compact` — no status bar clipping risk.
- The landscape overrides (`landscape:pt-2`) keep compact padding in landscape mode where vertical space is precious, exactly as other screens do.
- All other customizer internals (scroll area, confirm button, etc.) are unaffected.
