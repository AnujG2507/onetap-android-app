
# Fix: ShortcutCustomizer Footer Hidden by Android Navigation Bar

## Root Cause

The layout chain from `Index.tsx` through `AccessFlow.tsx` to `ShortcutCustomizer.tsx` has a subtle height resolution bug:

```text
Index.tsx
  <div class="min-h-app-viewport flex flex-col">       ← height: --app-available-height
    <div class="flex-1 flex flex-col">                 ← Access tab wrapper (height from flex-1)
      <AccessFlow /> ← returns a <>Fragment</>
        ShortcutCustomizer                             ← direct flex child of Access tab wrapper
          <div class="flex flex-col h-full">           ← ❌ h-full resolves incorrectly here
```

**The problem with `h-full` on a flex child:**
`h-full` = `height: 100%`. For percentage height to resolve in CSS, the parent must have an **explicit height value** set — not merely a flex-allocated height. When `flex-1` gives a div its height via the flexbox algorithm (rather than an explicit `height` property), `h-full` on a child of that div can fail to resolve on some Android WebView versions, causing the child to size itself to its content rather than filling the flex space. This means `ShortcutCustomizer` grows taller than the viewport, pushing the footer button below the visible area and behind the Android navigation bar.

**Evidence:** `UrlInput` and all other sub-screens in `AccessFlow` that work correctly use `flex-1 flex flex-col` as their root — not `h-full`. `ShortcutCustomizer` is the only sub-screen using `h-full`, which explains why it alone has the reported issue.

**Comparison:**
- `UrlInput.tsx` line 145: `<div className="flex flex-col h-full">` — same issue, but UrlInput has a single short scrollable area so content doesn't overflow in practice
- `ShortcutCustomizer.tsx` line 192: `<div className="flex flex-col h-full">` — longer content, more likely to overflow

The correct pattern (used by `SlideshowCustomizer`, `ContactShortcutCustomizer` after the previous fix) is `flex-1 flex flex-col` as the root, which makes the component itself a flex item that grows to fill the parent without relying on percentage height resolution.

## Changes Required

### File 1: `src/components/ShortcutCustomizer.tsx`

**Line 192** — Change root class from `h-full` pattern to `flex-1`:

```tsx
// Before:
<div className="flex flex-col h-full">

// After:
<div className="flex-1 flex flex-col min-h-0">
```

`min-h-0` is needed because flex children have `min-height: auto` by default, which can prevent them from shrinking smaller than their content. Adding `min-h-0` allows the scroll container inside to work correctly.

**Line 203** — The scrollable body needs `min-h-0` to allow proper shrinking within the flex column:

```tsx
// Before:
<div className="flex-1 p-4 landscape:p-3 overflow-auto animate-fade-in">

// After:
<div className="flex-1 p-4 landscape:p-3 overflow-auto animate-fade-in min-h-0">
```

### File 2: `src/components/UrlInput.tsx`

`UrlInput` has the same `h-full` root pattern. While it hasn't been reported as broken (its content is short), it has the same structural issue and should be fixed for consistency:

**Find the root div** — Change `h-full` to `flex-1 min-h-0`:

```tsx
// Before:
<div className="flex flex-col h-full">

// After:
<div className="flex-1 flex flex-col min-h-0">
```

## Why `safe-bottom-action` Is Still Correct

Once the height chain is fixed, the footer div with `safe-bottom-action` will correctly sit at the bottom of the available space. Since `showBottomNav` is `false` during the customize step (confirmed in `Index.tsx` line 483: `const showBottomNav = accessStep === 'source' || activeTab !== 'access'`), there is no BottomNav rendered — so `safe-bottom-action` = `calc(var(--android-safe-bottom) + 16px)` is the right amount of clearance.

No change to the padding values is needed — only the root height class needs fixing.

## Summary Table

| File | Line | Change | Reason |
|------|------|--------|--------|
| `ShortcutCustomizer.tsx` | 192 | `flex flex-col h-full` → `flex-1 flex flex-col min-h-0` | Fix height resolution so footer stays in viewport |
| `ShortcutCustomizer.tsx` | 203 | Add `min-h-0` to scrollable body | Allow scroll area to shrink within flex column |
| `UrlInput.tsx` | 145 (approx) | `flex flex-col h-full` → `flex-1 flex flex-col min-h-0` | Same structural fix for consistency |
