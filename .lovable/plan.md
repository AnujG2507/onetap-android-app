
# Audit: Shortcut Customizer Journeys — Safe-Area Compliance

## Scope

The "shortcut customizer journeys" encompass every screen a user traverses after tapping a content type (Photo, Video, Audio, Document, Link, Contact, Slideshow) in the Access tab:

1. `AccessFlow` (source step) — the container shell
2. `UrlInput` — Enter Link step
3. `ShortcutCustomizer` — Set Up Access step (covers Photo, Video, Audio, Document, Link)
4. `SlideshowCustomizer` — Slideshow step (multiple photos)
5. `ContactShortcutCustomizer` — Contact (Call / WhatsApp) step
6. `SuccessScreen` — final confirmation

The container `Index.tsx` wraps `AccessFlow` in `flex-1 flex flex-col`, and `AccessFlow` itself uses `flex-1 flex flex-col` for each step — so all sub-screens inherit the available height between the status bar and the bottom of the display.

---

## Findings by Screen

### 1. `AccessFlow` — source step shell ✅ CORRECT

- Header: `pt-header-safe` ✅ — handles status bar
- Scrollable content area: `flex-1 min-h-0 overflow-hidden` ✅
- `ContentSourcePicker` inner scroller: `pb-6` (visual breathing room) ✅ — no BottomNav overlap concern because the BottomNav is rendered *outside* this flex chain in `Index.tsx`
- `MyShortcutsButton` fixed position: `bottom-[calc(3.5rem+var(--android-safe-bottom,0px)+0.75rem)]` ✅ — correctly accounts for BottomNav + safe bottom

**No issues.**

---

### 2. `UrlInput` ✅ CORRECT

- Root: `flex flex-col h-full` — inherits from AccessFlow container ✅
- Header: `pt-header-safe-compact` ✅
- Footer CTA: `safe-bottom-action` ✅ = `padding-bottom: calc(var(--android-safe-bottom, 16px) + 16px)` — correct for a full-screen sub-step with no BottomNav visible

**No issues.**

---

### 3. `ShortcutCustomizer` (Photo, Video, Audio, Document, Link) ⚠️ ONE ISSUE

- Root: `flex flex-col h-full` ✅
- Header: `pt-header-safe-compact` ✅
- Scrollable body: `flex-1 p-4 overflow-auto` ✅ (scrolls within the flex chain)
- Footer CTA: `p-4 safe-bottom-action space-y-3` ✅

**BUT:** The scrollable body `div` (line 203) uses `overflow-auto` — this is fine for the scroll, but the inner content has **no bottom padding of its own**. On short screens in portrait mode, when the keyboard is up (user editing the shortcut name), the content can be hidden behind the CTA footer. This is an ergonomics issue, not a system-bar overlap issue.

**System bar overlap verdict: ✅ CORRECT** — `safe-bottom-action` in the footer correctly pushes above the Android nav bar.

---

### 4. `SlideshowCustomizer` ❌ TWO ISSUES

**Issue A — Fixed bottom button bleeds edge-to-edge:**

```tsx
// Line 398
<div className="fixed bottom-0 left-0 right-0 p-5 safe-bottom-action bg-gradient-to-t from-background via-background to-transparent">
```

This uses `fixed bottom-0` — which means it is positioned relative to the viewport, **not** the flex chain. On a gesture-navigation device, `bottom-0` places the button flush against the bottom of the screen. The `safe-bottom-action` class adds `calc(var(--android-safe-bottom, 16px) + 16px)` as `padding-bottom` — this pushes the button text UP inside the fixed container, but the div itself still starts at `bottom: 0` and will overlap the gesture nav bar visually (the gradient bleeds into it). This is the same edge-to-edge pattern that was just fixed elsewhere.

**Issue B — Scrollable content area `pb-24` is not safe-area-aware:**

```tsx
// Line 233
<div className="flex-1 overflow-y-auto px-5 pb-24 space-y-6">
```

`pb-24` (96px) is meant to create clearance for the fixed bottom button. But because the button is `fixed bottom-0` with `safe-bottom-action` padding inside it, the effective button height is `safe-bottom-action height + button height`. On a device with 24px gesture nav: `(24px + 16px) + 48px = 88px` — so `pb-24` (96px) is barely enough and not dynamically calculated.

**Fix for both:** Replace the `fixed` bottom button pattern with a proper `flex flex-col` footer — identical to how `ShortcutCustomizer`, `UrlInput`, and `ContactShortcutCustomizer` handle it. The scrollable area becomes `flex-1 overflow-y-auto` (no `pb-24`), and the button goes in a `<div className="p-5 safe-bottom-action">` footer as part of the normal flex flow.

---

### 5. `ContactShortcutCustomizer` ✅ CORRECT (after previous fix)

- Root: `flex-1 flex flex-col animate-fade-in` ✅ (fixed in the previous session)
- Header: `pt-header-safe-compact` ✅
- Scrollable body: `flex-1 px-5 pb-6 ... overflow-y-auto safe-bottom-action` ✅

The scrollable body itself carries `safe-bottom-action`. This means the last item (the Confirm button) has the safe-bottom padding as part of the scroll content — so it never sits behind the Android nav bar, even when scrolled to the bottom.

**No issues.**

---

### 6. `SuccessScreen` ✅ CORRECT

- Root: `flex flex-col items-center justify-center h-full p-8 text-center` — fills the inherited height from AccessFlow's flex chain ✅
- No fixed positioning
- Content is vertically centered — can never be clipped by system bars since it respects the flex chain's bounding

**No issues.**

---

## Summary Table

| Screen | Journey | Header safe-top | Footer safe-bottom | Status |
|---|---|---|---|---|
| AccessFlow (source) | All | `pt-header-safe` ✅ | N/A (no footer CTA) | ✅ |
| UrlInput | Link | `pt-header-safe-compact` ✅ | `safe-bottom-action` ✅ | ✅ |
| ShortcutCustomizer | Photo/Video/Audio/Document/Link | `pt-header-safe-compact` ✅ | `safe-bottom-action` ✅ | ✅ |
| SlideshowCustomizer | Photo (multi) | `pt-header-safe` ✅ | `fixed bottom-0` ❌ | ❌ |
| ContactShortcutCustomizer | Contact (Call/WhatsApp) | `pt-header-safe-compact` ✅ | `safe-bottom-action` in scroll ✅ | ✅ |
| SuccessScreen | All | N/A (centered) | N/A (centered) | ✅ |

---

## Change Required

**One file:** `src/components/SlideshowCustomizer.tsx`

### Current (broken):
```tsx
// Scrollable area — pb-24 to clear fixed button
<div className="flex-1 overflow-y-auto px-5 pb-24 space-y-6">
  {/* ... content ... */}
</div>

{/* Fixed bottom button — positioned relative to viewport */}
<div className="fixed bottom-0 left-0 right-0 p-5 safe-bottom-action bg-gradient-to-t from-background via-background to-transparent">
  <Button ...>Add to Home Screen</Button>
</div>
```

### Fixed (matches pattern used by ShortcutCustomizer, UrlInput):
```tsx
// Scrollable area — no fixed pb needed, footer is in flex flow
<div className="flex-1 overflow-y-auto px-5 pb-6 space-y-6">
  {/* ... content ... */}
</div>

{/* Footer CTA — in flex flow, not fixed */}
<div className="p-5 safe-bottom-action">
  <Button ...>Add to Home Screen</Button>
</div>
```

The `bg-gradient-to-t` gradient on the original fixed button was a visual affordance to fade content behind it — this is unnecessary when the button is in the flex flow (content stops above it naturally). It can be removed.

The `SlideshowCustomizer` root is already `flex-1 flex flex-col min-h-0` (line 216), so adding a non-fixed footer div will slot in correctly between the scrollable area and the bottom of the container.
