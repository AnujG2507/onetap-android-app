
## Landscape Navigation Bar Safe Area — Full Fix

### Root Cause

Android places the navigation bar on the **right side** when the device is rotated 90° anti-clockwise (landscape), and on the **left side** for 90° clockwise. The current implementation has two gaps:

1. **`MainActivity.java` only reads vertical insets.** The `setupNavBarInsetInjection` method only reads `navigationBars().bottom` and `statusBars().top`. The horizontal insets (`navigationBars().left` and `navigationBars().right`) are never read and never injected into the WebView. This means `--android-safe-left` and `--android-safe-right` CSS variables do not exist.

2. **No horizontal safe area CSS is defined.** The design system has `safe-top`, `safe-bottom`, `safe-bottom-with-nav`, etc., but nothing for `safe-left` / `safe-right`. Every fixed element that spans the full width (BottomNav, fixed overlays) or is anchored to a horizontal edge (header buttons) is unprotected.

### Affected Elements

| Element | Problem |
|---|---|
| `BottomNav` (`inset-x-0`) | Right edge extends under right-side nav bar; Profile tab button hidden |
| `AccessFlow` header (`pe-5`) | Menu (AppMenu) button at right edge hidden under right-side nav bar |
| `AccessFlow` offline banner (`ps-5 pe-5`) | Clipped at both edges depending on rotation |
| `AccessFlow` header (`ps-5`) | Logo/title clipped at left edge in 90° clockwise rotation |
| `SheetContent side="left"` / `side="right"` (AppMenu) | Slides in from the side that may have a nav bar — content width does not account for nav bar thickness |
| Fixed `MyShortcutsButton` (`left-0 right-0`) | Same as BottomNav — right edge clips under nav bar |
| `SharedUrlActionSheet` / `SharedFileActionSheet` (custom overlays with `p-4`) | Inner card not horizontally padded away from nav bar side |

### Solution Overview

Three layers of change are needed:

1. **Java (native):** Expand inset injection to include left and right nav bar insets as `--android-safe-left` and `--android-safe-right`.
2. **CSS (`index.css`):** Add `--android-safe-left` / `--android-safe-right` CSS variables and utility classes `safe-left`, `safe-right`, `safe-x` (both sides).
3. **Components:** Apply safe-area horizontal padding/margin to all affected elements.

---

### File-by-File Changes

#### 1. `native/android/app/src/main/java/app/onetap/access/MainActivity.java`

Expand `setupNavBarInsetInjection` to also read left/right nav bar insets and expand `injectInsetsIntoWebView` to inject `--android-safe-left` and `--android-safe-right`:

```java
// In setupNavBarInsetInjection — also read left/right:
int navLeft = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).left;
int navRight = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).right;
lastSafeLeft = navLeft / density;
lastSafeRight = navRight / density;

// In injectInsetsIntoWebView — append the new vars:
+ "document.documentElement.style.setProperty('--android-safe-left', '" + lastSafeLeft + "px');"
+ "document.documentElement.style.setProperty('--android-safe-right', '" + lastSafeRight + "px');"
```

Two new fields are added: `private float lastSafeLeft = 0f;` and `private float lastSafeRight = 0f;`.

#### 2. `src/index.css`

Add CSS variables with `env()` fallbacks (works in browser preview even without native injection) and utility classes:

```css
/* In :root — add alongside existing safe top/bottom vars */
--android-safe-left: env(safe-area-inset-left, 0px);
--android-safe-right: env(safe-area-inset-right, 0px);

/* Utility classes — added alongside safe-top / safe-bottom */
.safe-left {
  padding-inline-start: var(--android-safe-left, 0px);
}
.safe-right {
  padding-inline-end: var(--android-safe-right, 0px);
}
.safe-x {
  padding-inline-start: var(--android-safe-left, 0px);
  padding-inline-end: var(--android-safe-right, 0px);
}
```

Also update `--app-available-height` is fine (it measures between status bar top and nav bottom — on landscape Android the height is the full screen height minus nothing on left/right, so no change needed there).

#### 3. `src/components/BottomNav.tsx`

The `<nav>` currently uses `inset-x-0` which pins it hard against both screen edges. In landscape with a right-side nav bar, the nav bar sits on top of the rightmost portion. Fix: add horizontal padding that equals the safe area on each side.

```tsx
// Before:
<nav className="fixed bottom-0 inset-x-0 bg-background border-t border-border safe-bottom z-50">

// After:
<nav className="fixed bottom-0 inset-x-0 bg-background border-t border-border safe-bottom z-50 safe-x">
```

`safe-x` adds `padding-inline-start: var(--android-safe-left)` and `padding-inline-end: var(--android-safe-right)`. The tab buttons inside already use `flex-1` so they rebalance to fill the remaining space naturally.

#### 4. `src/components/AccessFlow.tsx`

The header row at line 582 uses `ps-5 pe-5`. In landscape with a right-side nav bar, the AppMenu button (rightmost element) is hidden. Fix: replace the fixed `ps-5 pe-5` with `safe-x` padding combined with a reduced fallback, so that when a horizontal nav bar inset is present it adds to the base padding.

The cleanest approach: keep `ps-5 pe-5` as a base and add `safe-x` to the header element. Since `safe-x` sets `padding-inline-start/end` using CSS variables that default to `0px`, they stack additively when using `padding-inline` (they don't conflict with Tailwind's `ps-5/pe-5` which use the same logical properties). 

Actually, `ps-5` and `safe-x` both set `padding-inline-start` — the latter wins. Better approach: use CSS `calc()` directly in a style prop, or add a wrapper that adds the horizontal safe inset as `margin`.

The simplest correct approach: add `safe-x` to the **root container div** of the `source` step screen (the full-screen flex column), not to the header alone. This way the entire step is inset from the nav bar side, which is correct — all content (header, source picker, etc.) is safely inset.

The source step root is:
```tsx
// Line 561 area — the wrapping div when step === 'source'
<div className="flex flex-col h-full ...">
```

Read AccessFlow more carefully: the full source step has a wrapping element that we add `safe-x` to. This shifts all content inward on both sides, which is the correct approach — on the right-nav-bar rotation side, all content clears the nav bar.

#### 5. `src/components/ui/sheet.tsx`

The `left` and `right` side variants don't account for horizontal insets. When the menu sheet is on the right side and the nav bar is also on the right, the sheet's content needs start-side padding. Fix:

```tsx
left:  "... safe-top safe-bottom safe-right ...",
right: "... safe-top safe-bottom safe-left  ...",
```

Wait — `safe-right` on a `left`-side sheet makes sense because the nav bar on the right (far edge of a left sheet) doesn't affect a left sheet's content. Actually for side sheets, what matters is:
- `left` sheet: content abuts the left edge of the screen — in 90° clockwise, nav bar is on the left, so the sheet needs `safe-left` (padding-inline-start from left nav bar)
- `right` sheet: content abuts the right edge of the screen — in 90° anti-clockwise, nav bar is on the right, so the sheet needs `safe-right` (padding-inline-end from right nav bar)

Since the sheet already starts at `inset-y-0 left-0` (left sheet) or `inset-y-0 right-0` (right sheet), we just need to add the appropriate padding:

```tsx
left:  "inset-y-0 left-0 h-full w-3/4 border-r safe-top safe-bottom safe-left overflow-x-hidden ...",
right: "inset-y-0 right-0 h-full w-3/4 border-l safe-top safe-bottom safe-right overflow-x-hidden ...",
```

#### 6. `src/components/SharedFileActionSheet.tsx` and `src/components/SharedUrlActionSheet.tsx`

These fixed overlays have `p-4` padding on the card wrapper. In landscape with a horizontal nav bar, the card is pushed against the nav bar side. Fix: add `safe-x` to the outer container div (which already uses `flex items-end justify-center`). The `safe-x` padding on a flex column container that `justify-center`s an inner card will push the card inward from the nav bar side.

---

### Summary of All Changes

| File | Change |
|---|---|
| `MainActivity.java` | Read `navLeft`/`navRight` insets; add `lastSafeLeft`/`lastSafeRight` fields; inject `--android-safe-left` and `--android-safe-right` CSS vars |
| `src/index.css` | Add `--android-safe-left`/`--android-safe-right` CSS variables (with `env()` fallbacks) and `.safe-left`, `.safe-right`, `.safe-x` utility classes |
| `src/components/BottomNav.tsx` | Add `safe-x` to the `<nav>` element |
| `src/components/AccessFlow.tsx` | Add `safe-x` to the source step root container so header (AppMenu), offline banner, and all content are inset from the nav bar |
| `src/components/ui/sheet.tsx` | Add `safe-left` to `left` variant and `safe-right` to `right` variant |
| `src/components/SharedFileActionSheet.tsx` | Add `safe-x` to the outer container div |
| `src/components/SharedUrlActionSheet.tsx` | Add `safe-x` to the outer container div |

These 7 targeted changes establish a complete, zero-hardcoded-pixel landscape horizontal safe area system, identical in philosophy to the existing vertical safe area approach.
