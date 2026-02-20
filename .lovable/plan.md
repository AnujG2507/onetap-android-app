
# Fix: Three Issues in ShortcutCustomizer Video Journey

## Issue 1: Redundant "Video File" Info Card

### Root Cause
`ShortcutCustomizer.tsx` lines 210–223 render a dedicated card for video files:

```tsx
{isVideo && fileSizeMB && (
  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/50">
    <span className="text-lg">🎬</span>
    <div className="flex-1">
      <p className="text-sm font-medium text-foreground">
        {t('shortcutCustomizer.videoFile')}       // ← missing translation key
      </p>
      <p className="text-xs text-muted-foreground">
        {fileSizeMB} MB {Number(fileSizeMB) > 50 ? `• ${t('shortcutCustomizer.largeFileWarning')}` : ''}
                                                   // ← missing translation key
      </p>
    </div>
  </div>
)}
```

This card appears directly below `<ContentPreview source={source} />`. But `ContentPreview` already displays the file name (e.g. `myvideo.mp4`) as its label, and `Video • 24.3 MB` as its sublabel — using `formatContentInfo()` in `contentResolver.ts` which returns `{ label: source.name, sublabel: 'Video • X MB' }`.

Additionally, the translation keys `shortcutCustomizer.videoFile` and `shortcutCustomizer.largeFileWarning` do not exist in `en.json`, so they render as raw translation key strings (e.g. "shortcutCustomizer.videoFile"), making the card look broken and doubly redundant.

**Fix:** Remove the entire video info card block (lines 210–223). The file size and type information is already provided by `ContentPreview`.

---

## Issue 2: Header Hidden Under the Status Bar

### Root Cause

This is a **double safe-top padding** bug. Here is the full height chain:

```text
index.css:
  --app-available-height = calc(100dvh - --android-safe-top - --android-safe-bottom)
  min-h-app-viewport     = min-height: var(--app-available-height)

Index.tsx (line 554):
  <div className="min-h-app-viewport bg-background flex flex-col overflow-hidden">

The content renders starting at the very TOP of 100dvh,
but the --app-available-height only starts AFTER safe-top.
```

Wait — `min-h-app-viewport` = `min-height: calc(100dvh - safe-top - safe-bottom)`. The container starts at `top: 0` (the very top of the screen including the status bar area). But its min-height is the viewport minus both system bars. This means the **bottom** of the container sits at `100dvh - safe-bottom`, which is correct. But **the top of the container is still at `top: 0`**, so content rendered at the top of the container (without top padding) appears behind the status bar.

The `body::before` pseudo-element paints a tinted strip over the status bar area (`height: var(--android-safe-top)`, `z-index: 9999`, `pointer-events: none`) so users see the colored bar. But the app content behind it is hidden.

`pt-header-safe-compact` = `calc(var(--android-safe-top, 0px) + 0.75rem)` — this adds the safe top inset plus 0.75rem of visual padding. This is the **correct** class for sub-screens that need to push their header below the status bar. So the class itself is correct.

**However**, the session replay shows the header is still hidden. The actual problem is that on sub-screens within `AccessFlow`, the parent `AccessFlow` renders inside a `flex-1 flex flex-col` div that is itself a flex child of `min-h-app-viewport`. In some Android WebViews, when `min-h-app-viewport` does not create a definite height (it's `min-height`, not `height`), the flex children cannot correctly `flex-1` to fill the space — which is the same root cause as Issue 3.

When the layout overflows (Issue 3), the header naturally ends up partially below its expected top position as the content column grows taller than the viewport and the browser scrolls or clips it unpredictably.

**Fix:** Change `min-h-app-viewport` to `h-app-viewport` on the Index.tsx root container. `h-app-viewport` = `height: var(--app-available-height)` creates a **definite height**, which:
1. Allows `flex-1` children to correctly fill exactly the available space
2. Ensures the flex column never overflows the safe-area-bounded viewport
3. Resolves both the header and button overflow issues together

This is the correct fix for the root cause. The `pt-header-safe-compact` class on the header is correct and should be kept.

---

## Issue 3: Add to Home Screen Button Cut Off by Navigation Bar

### Root Cause

This is the same root cause as Issue 2 — `min-h-app-viewport` on the Index root does not create a **definite height**. In the CSS flex model:

- `min-height` tells the browser "this box must be at least this tall" but does **not** give children a resolved height to compute `flex-1` against
- `height` tells the browser "this box is exactly this tall" and gives children a definite height to compute `flex-1` against

The chain is:
```
Index root: min-h-app-viewport (min-height only) ← problem
  └── flex-1 flex flex-col (Access tab wrapper)
        └── flex-1 flex flex-col min-h-0 (ShortcutCustomizer)
              ├── header
              ├── flex-1 overflow-auto min-h-0 (scroll body)
              └── p-4 safe-bottom-action (footer with button)
```

With `min-height` on the root, the flex children cannot correctly resolve their heights. The root container grows to fit its content (the full ShortcutCustomizer) rather than being constrained to the safe-area viewport height. The footer button ends up below the visible area and behind the Android navigation bar.

**Fix (same as Issue 2):** Change `min-h-app-viewport` to `h-app-viewport` on the Index root in `Index.tsx` line 554. Also add `overflow-hidden` to ensure the height constraint is enforced (this is already present but important to keep).

---

## Summary of All Changes

| File | Line | Change | Reason |
|------|------|--------|--------|
| `src/components/ShortcutCustomizer.tsx` | 210–223 | Remove the entire `isVideo && fileSizeMB` card block | Redundant with ContentPreview; uses missing translation keys |
| `src/pages/Index.tsx` | 554 | Change `min-h-app-viewport` → `h-app-viewport` | Creates definite height for flex children to resolve correctly in Android WebView |

### File 1: `src/components/ShortcutCustomizer.tsx`

Remove lines 210–223 — the redundant "video file" info card. The content preview above it already shows all this information.

```tsx
// REMOVE this entire block (lines 210-223):
{isVideo && fileSizeMB && (
  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/50">
    <span className="text-lg">🎬</span>
    <div className="flex-1">
      <p className="text-sm font-medium text-foreground">
        {t('shortcutCustomizer.videoFile')}
      </p>
      <p className="text-xs text-muted-foreground">
        {fileSizeMB} MB {Number(fileSizeMB) > 50 ? `• ${t('shortcutCustomizer.largeFileWarning')}` : ''}
      </p>
    </div>
  </div>
)}
```

### File 2: `src/pages/Index.tsx`

Line 554 — change `min-h-app-viewport` to `h-app-viewport`:

```tsx
// Before:
<div className="min-h-app-viewport bg-background flex flex-col overflow-hidden">

// After:
<div className="h-app-viewport bg-background flex flex-col overflow-hidden">
```

The `h-app-viewport` utility class is already defined in `src/index.css` line 262:
```css
.h-app-viewport {
  height: var(--app-available-height, 100vh);
}
```

This gives the root container a definite height (`height:`, not `min-height:`) equal to the safe-area-bounded viewport. All `flex-1` children can now resolve their heights correctly, which:
- Keeps the header fully below the status bar
- Keeps the footer button fully above the navigation bar
- Prevents any content from rendering behind system bars

## No Other Files Need Changes

- `pt-header-safe-compact` on the header — **correct**, no change needed
- `safe-bottom-action` on the footer — **correct**, no change needed  
- `flex-1 flex flex-col min-h-0` on ShortcutCustomizer root — **correct**, no change needed
- `flex-1 overflow-auto min-h-0` on scroll body — **correct**, no change needed

All layout classes are already correct. The single root fix in `Index.tsx` resolves both the header and footer safe-area issues throughout the entire app (all tabs and sub-screens benefit).
