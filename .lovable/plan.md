
## Horizontal Overflow Audit: AppMenu Sheet

### Full Component Tree

```text
<SheetContent side="left|right" className="w-72 flex flex-col p-6">
  ├─ <SheetHeader className="pb-4">
  │    └─ <SheetTitle>Menu</SheetTitle>
  │
  └─ <ScrollArea className="flex-1 min-h-0" viewportClassName="!overflow-x-hidden">
       └─ <ScrollAreaPrimitive.Viewport>  ← Radix injects inline style: overflow: scroll
            └─ <div className="flex flex-col min-h-full">
                 ├─ <div className="flex flex-col gap-1">
                 │    ├─ [Button] My Shortcuts   h-12 ps-3 pe-3
                 │    │    ├─ <div flex items-center gap-3 flex-1>
                 │    │    │    ├─ Icon square (h-9 w-9 flex-shrink-0) ✅
                 │    │    │    └─ <span>{t('menu.shortcuts')}</span>   ← NO min-w-0
                 │    │    └─ Badge span (conditionally shown)
                 │    │
                 │    ├─ [Button] Trash           h-12 ps-3 pe-3
                 │    │    ├─ <div flex items-center gap-3 flex-1>
                 │    │    │    ├─ Icon square (h-9 w-9 flex-shrink-0) ✅
                 │    │    │    └─ <span>{t('menu.trash')}</span>       ← NO min-w-0
                 │    │    └─ Badge group (warning + count)
                 │    │
                 │    ├─ [Button] Settings        h-12 ps-3 pe-3
                 │    │    ├─ <div flex items-center gap-3 flex-1>
                 │    │    │    ├─ Icon square (h-9 w-9 flex-shrink-0) ✅
                 │    │    │    └─ <span>{t('settings.title')}</span>   ← NO min-w-0
                 │    │    └─ <ChevronRight />
                 │    │
                 │    └─ <CloudBackupSection />
                 │         ├─ [NOT signed in]: Button "Sign in with Google"
                 │         │    └─ <div flex-1>
                 │         │         ├─ Icon square ✅
                 │         │         └─ <div text-left>
                 │         │              ├─ <span block>{t('cloudBackup.signInWithGoogle')}</span>  ← NO truncate
                 │         │              └─ <span text-xs text-muted>{t('cloudBackup.syncDescription')}</span>  ← NO truncate
                 │         └─ [Signed in]:
                 │              ├─ <div px-3 py-2>
                 │              │    └─ <div flex items-center gap-2>
                 │              │         ├─ Avatar (h-7 w-7 flex-shrink-0) ✅
                 │              │         ├─ <p truncate flex-1 min-w-0>name/email</p> ✅
                 │              │         └─ Sync button (h-8 w-8 flex-shrink-0) ✅
                 │              └─ Sign Out button (w-full justify-start)
                 │
                 ├─ <div flex-1 /> (spacer)
                 │
                 └─ <div className="pt-4 safe-bottom">
                      ├─ <Separator />
                      ├─ <p ps-3>{t('settings.appearance')}</p>
                      └─ <div ps-3 pe-3 mb-2>
                           └─ <div flex gap-1>
                                └─ × 3 <Button flex-1 gap-1.5>
                                         ├─ Icon ✅
                                         └─ <span text-xs>{option.label}</span>  ← NO truncate / NO overflow-hidden
```

### Problems Identified

**Problem 1 — Radix ScrollArea Viewport has `overflow: scroll` injected inline**
Radix sets `overflow: scroll` (both axes) on the `[data-radix-scroll-area-viewport]` element via an injected `<style>` tag. The `!overflow-x-hidden` class on `viewportClassName` is applied to a wrapper div *inside* the viewport, not the viewport element itself — so the Radix inline style wins and horizontal scrolling is still possible.

**Fix**: Target the Radix viewport element itself using the CSS attribute selector in `index.css` (or the `scrollbar-hide` approach), or apply `overflow-x: hidden !important` via a custom class on the Radix Root. The cleanest fix is to add `overflow-x: hidden` via a CSS rule targeting `[data-radix-scroll-area-viewport]` on the Root element, or pass `style={{ overflowX: 'hidden' }}` directly on the Viewport via a modified ScrollArea component.

**Problem 2 — Button inner `flex-1` spans have no `min-w-0` or `truncate`**
The three menu item buttons (My Shortcuts, Trash, Settings) all have the pattern:
```tsx
<div className="flex items-center gap-3 flex-1">
  <IconBox />  
  <span className="font-medium">{label}</span>  {/* ← no min-w-0, no truncate */}
</div>
```
If the translated label is long (e.g., Arabic, German), the `<span>` can push the outer flex container wider than the sheet, causing horizontal overflow past the 288px (`w-72`) boundary.

**Problem 3 — CloudBackupSection "Sign In" button subtitle text has no truncation**
The unauthenticated state renders:
```tsx
<span className="text-xs text-muted-foreground">{t('cloudBackup.syncDescription')}</span>
```
This has no `truncate`, no `overflow-hidden`, no `max-w`. On narrow sheets or long translations, it can overflow.

**Problem 4 — Theme button labels have no truncation**
The three theme toggle buttons (Light / Dark / System) use `flex-1` and a `<span className="text-xs">` with no overflow guard. Long translations could overflow the `gap-1` flex row.

**Problem 5 — SheetContent has no `overflow-x-hidden`**
The `sheetVariants` for `left` and `right` sides do NOT include `overflow-x-hidden` — unlike the `bottom` variant which explicitly adds `overflow-x-hidden`. This means the Sheet panel itself has no horizontal clip boundary from its own CSS.

---

### Fix Plan

#### `src/components/ui/sheet.tsx`
Add `overflow-x-hidden` to the `left` and `right` side variants in `sheetVariants`:
```ts
left: "inset-y-0 left-0 h-full w-3/4 border-r safe-top safe-bottom overflow-x-hidden ...",
right: "inset-y-0 right-0 h-full w-3/4 border-l safe-top safe-bottom overflow-x-hidden ...",
```
This gives a hard clip boundary for the entire sheet panel regardless of what's inside.

#### `src/components/ui/scroll-area.tsx`
The Radix `<ScrollAreaPrimitive.Viewport>` has `overflow: scroll` set via an injected `<style>` tag that cannot be overridden by a Tailwind class on a child wrapper div. Fix: pass `style` prop directly on the Viewport to enforce `overflowX: 'hidden'` at the element level, which is higher specificity than Tailwind but lower than the Radix injected style. The correct approach is to add an additional CSS rule in `index.css`:
```css
[data-radix-scroll-area-viewport] {
  overflow-x: hidden !important;
}
```
This targets the actual viewport element where Radix injects its inline `overflow: scroll` style. The `!important` overrides Radix's injected style specifically for the x-axis.

#### `src/components/AppMenu.tsx`
Add `min-w-0 truncate` to each button label span and `min-w-0` to the `flex-1` wrapper divs:

**My Shortcuts button:**
```tsx
<div className="flex items-center gap-3 flex-1 min-w-0">
  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
    <Zap className="h-4 w-4 text-primary" />
  </div>
  <span className="font-medium truncate">{t('menu.shortcuts')}</span>
</div>
```

**Trash button:** same pattern — `flex-1 min-w-0` on wrapper, `truncate` on span.

**Settings button:** same pattern — `flex-1 min-w-0` on wrapper, `truncate` on span, and `flex-shrink-0` on ChevronRight wrapper.

**Theme buttons:** Add `truncate` on `<span className="text-xs truncate">` and `overflow-hidden` on each Button to prevent label overflow.

#### `src/components/CloudBackupSection.tsx`
**Sign-in button subtitle:**
```tsx
<span className="text-xs text-muted-foreground truncate">{t('cloudBackup.syncDescription')}</span>
```
Add `min-w-0` to the inner `<div className="text-left min-w-0">` wrapper to allow truncation to work inside flexbox.

**Sign-in title (primary label):** Also add `truncate` in case of long translations:
```tsx
<span className="font-medium block truncate">{t('cloudBackup.signInWithGoogle')}</span>
```

---

### Summary of All Files Changed

| File | Changes |
|---|---|
| `src/components/ui/sheet.tsx` | Add `overflow-x-hidden` to `left` and `right` side variants |
| `src/index.css` | Add `[data-radix-scroll-area-viewport] { overflow-x: hidden !important; }` to base layer |
| `src/components/AppMenu.tsx` | Add `min-w-0` to flex-1 wrappers, `truncate` to label spans, `flex-shrink-0` to trailing icons/badges |
| `src/components/CloudBackupSection.tsx` | Add `min-w-0` to text wrapper div, `truncate` to both title and subtitle spans |

No new dependencies. No backend changes. All fixes are purely CSS/Tailwind class additions.
