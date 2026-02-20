
## Bottom Sheet Safe Area Compliance — Android Navigation Bar

### Problem Statement

Bottom sheets and modal drawers that slide up from the bottom of the screen can overlap the Android gesture navigation bar or three-button navigation bar. The `--android-safe-bottom` CSS variable is already established in the design system as the single source of truth for this inset. The problem is inconsistent application across the three distinct bottom sheet patterns used in the app.

---

### Three Bottom Sheet Patterns Identified

The app has three architecturally distinct patterns for bottom content:

```text
Pattern A — Radix Sheet (side="bottom")     → src/components/ui/sheet.tsx
Pattern B — Vaul Drawer                     → src/components/ui/drawer.tsx
Pattern C — Custom overlay (fixed inset-0)  → SharedUrlActionSheet, SharedFileActionSheet
```

---

### Current State Audit

#### Pattern A — Radix `SheetContent` (side="bottom")

The `sheetVariants` in `sheet.tsx` already applies `safe-bottom-with-nav` to the `bottom` variant:

```
bottom: "... safe-bottom-with-nav ..."
```

`safe-bottom-with-nav` = `calc(var(--android-safe-bottom, 0px) + 3.5rem)`

This includes both the Android nav inset **and** the app's BottomNav height (3.5rem). This is correct when the BottomNav is visible beneath the sheet. However, several sheets appear as full-screen flows where the BottomNav is hidden — in those cases the 3.5rem offset is excessive padding but not harmful. The rule is consistently applied via the base component so all sheets using `<SheetContent side="bottom">` inherit it automatically.

**Consumers verified as safe (inherit safe-bottom-with-nav from SheetContent):**
- `BookmarkActionSheet` — `<SheetContent side="bottom" className="rounded-t-3xl...">` ✅
- `ScheduledActionActionSheet` — `<SheetContent side="bottom" className="rounded-t-3xl px-0 pb-6...">` ⚠️ has explicit `pb-6` overriding the safe area
- `MessageChooserSheet` — `<SheetContent side="bottom" className="max-h-[80vh]...">` ✅
- `BatteryOptimizationHelp` — `<SheetContent side="bottom" className="h-[85vh]...">` ✅
- `LanguagePicker` — `<SheetContent side="bottom" ...>` ✅
- `SettingsPage` language sheet — `<SheetContent side="bottom" ...>` ✅
- `ScheduledActionEditor` — `<SheetContent side="bottom" ...>` ✅
- `TrashSheet` — `<SheetContent side="bottom" ...>` ✅
- `SavedLinksSheet` — `<SheetContent side="bottom" ...>` ✅
- `AppMenu` — `<SheetContent side="left">` / `side="right"` — not a bottom sheet, left/right use `safe-bottom` ✅

**Issue found in `ScheduledActionActionSheet`:**
```tsx
<SheetContent side="bottom" className="rounded-t-3xl px-0 pb-6 landscape:pb-4 ...">
```
The explicit `pb-6` / `landscape:pb-4` classes do **not** override `safe-bottom-with-nav` because `safe-bottom-with-nav` sets `padding-bottom` via CSS class. However since Tailwind applies classes in source order, the `pb-6` class (which also sets `padding-bottom`) will be overridden by `safe-bottom-with-nav` only if it appears later in the stylesheet. In practice, utility classes like `pb-6` resolve before the custom `safe-bottom-with-nav` class, meaning `safe-bottom-with-nav` wins — **safe in practice**, but the explicit `pb-6` is redundant and confusing.

#### Pattern B — Vaul `DrawerContent`

`DrawerContent` in `drawer.tsx` sits at `bottom-0` with no safe area padding at all:

```tsx
"fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background"
```

No `safe-bottom`, no `safe-bottom-with-nav` is present. Vaul's own `shouldScaleBackground` prop does not add safe-area padding. The Drawer content itself — and the content inside it — must handle the bottom inset.

**Consumers affected:**
- `ShortcutActionSheet` — `<DrawerContent className="max-h-[80vh]...">` — its inner `<div className="px-4 pb-4...">` has `pb-4` only, **no safe-area padding** ❌
- `ShortcutEditSheet` — `<DrawerContent className="max-h-[90vh]">` with a `DrawerFooter` — `<div className="px-5 py-4...">` inside footer, **no safe-area padding** ❌
- `CountryCodePicker` — `<DrawerContent className="max-h-[85vh]">` with `<ScrollArea>` — list terminates at the bottom with no inset ❌

The fix is to add `pb-safe-bottom` (a new utility class) to `DrawerContent`'s base className, so all Drawer-based sheets automatically gain the system nav bar clearance. Since Drawers do not coexist with the BottomNav (the BottomNav is always visible below the Drawer overlay but the Drawer content is scrollable above it), the correct padding is just `--android-safe-bottom`, not `safe-bottom-with-nav`.

#### Pattern C — Custom `fixed inset-0` overlays

**`SharedUrlActionSheet`:**
```tsx
<div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50 safe-bottom-with-nav ...">
```
`safe-bottom-with-nav` is already applied to the container, so the inner card is pushed up by the system nav height. ✅

**`SharedFileActionSheet`:**
```tsx
<div className="fixed inset-0 z-50 flex items-end justify-center p-4 pb-8 bg-black/50 animate-in ...">
```
`pb-8` is a hardcoded `32px` fallback — this is **not** safe-area aware. On devices with a tall gesture bar (e.g. 48px) the card will overlap it. The class `safe-bottom-with-nav` is missing here. ❌

---

### Files to Change

| File | Change | Reason |
|---|---|---|
| `src/components/ui/drawer.tsx` | Add `safe-bottom` to `DrawerContent` base class | All Vaul Drawer sheets gain system nav clearance |
| `src/components/SharedFileActionSheet.tsx` | Replace `pb-8` with `safe-bottom-with-nav` on the outer container div | Matches SharedUrlActionSheet's correct pattern |
| `src/components/ScheduledActionActionSheet.tsx` | Remove explicit `pb-6 landscape:pb-4` from `SheetContent` | Redundant; lets `safe-bottom-with-nav` from sheet.tsx be the only padding authority |
| `src/index.css` | Add a new `safe-bottom-sheet` utility | Provides just the system nav clearance (no BottomNav offset) for Drawers that float above the nav |

---

### Detailed Changes

#### 1. `src/index.css` — New utility class

Add after the existing `.safe-bottom-with-nav` block:

```css
/* Safe area for Drawers/overlays that float above the BottomNav.
   Clears only the system nav bar, not the app BottomNav. */
.safe-bottom-sheet {
  padding-bottom: max(var(--android-safe-bottom, 0px), 16px);
}
```

The `max()` ensures there is always at least 16px of visual breathing room at the bottom even on devices without a system nav bar (where `--android-safe-bottom` is `0px`).

#### 2. `src/components/ui/drawer.tsx` — DrawerContent base class

Add `safe-bottom-sheet` to the `DrawerContent` base className:

```tsx
// Before
"fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background"

// After
"fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background safe-bottom-sheet"
```

This propagates safe area clearance to all three Drawer consumers simultaneously:
- `ShortcutActionSheet` (its inner `pb-4` becomes additive visual spacing on top of the safe inset)
- `ShortcutEditSheet` (its footer will clear the nav bar)
- `CountryCodePicker` (list bottom cleared)

#### 3. `src/components/SharedFileActionSheet.tsx` — outer container

```tsx
// Before
<div className="fixed inset-0 z-50 flex items-end justify-center p-4 pb-8 bg-black/50 animate-in fade-in duration-200">

// After
<div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50 safe-bottom-with-nav animate-in fade-in duration-200">
```

This aligns `SharedFileActionSheet` with `SharedUrlActionSheet` which already uses `safe-bottom-with-nav`.

#### 4. `src/components/ScheduledActionActionSheet.tsx` — remove redundant pb

```tsx
// Before
<SheetContent side="bottom" className="rounded-t-3xl px-0 pb-6 landscape:pb-4 landscape:max-h-[95vh]">

// After
<SheetContent side="bottom" className="rounded-t-3xl px-0 landscape:max-h-[95vh]">
```

The `safe-bottom-with-nav` from `SheetContent`'s base class then becomes the sole padding-bottom authority.

---

### Why `safe-bottom-with-nav` for Sheets but `safe-bottom-sheet` for Drawers?

- **Sheets** (`SheetContent side="bottom"`) are full-width panels that slide over the entire screen including the BottomNav area. They need padding for both the system nav bar AND the app BottomNav.
- **Drawers** (Vaul) are partial-height panels. The BottomNav is hidden behind the dark overlay below the drawer. The drawer content only needs to clear the system nav bar itself.
- **Custom overlays** (`SharedUrl/FileActionSheet`) also live above the BottomNav overlay so they use `safe-bottom-with-nav` to position the card above both bars.

---

### Impact Summary

| Component | Pattern | Before | After |
|---|---|---|---|
| `ShortcutActionSheet` | Drawer | No safe area | Clears system nav via `safe-bottom-sheet` in DrawerContent |
| `ShortcutEditSheet` | Drawer | No safe area on footer | Clears system nav via `safe-bottom-sheet` in DrawerContent |
| `CountryCodePicker` | Drawer | No safe area | Clears system nav via `safe-bottom-sheet` in DrawerContent |
| `SharedFileActionSheet` | Custom overlay | Hardcoded `pb-8` | Dynamic `safe-bottom-with-nav` |
| `ScheduledActionActionSheet` | Sheet | Redundant `pb-6` (safe-bottom-with-nav still wins) | Clean; only `safe-bottom-with-nav` applies |
| All other `SheetContent side="bottom"` | Sheet | Already correct via sheet.tsx | Unchanged |
