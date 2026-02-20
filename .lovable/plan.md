
# Fix: Bottom Sheets Hidden Behind BottomNav on Native Button Navigation

## Root Cause Analysis

The BottomNav component is `fixed bottom-0 z-50` with a portrait height of `h-14` (56px) and landscape height of `h-10` (40px). It also uses `safe-bottom` which adds `padding-bottom: var(--android-safe-bottom)`.

All bottom `SheetContent` panels are also `fixed bottom-0 z-50` and use the `safe-bottom` class. This `safe-bottom` utility is defined as:

```css
.safe-bottom {
  padding-bottom: var(--android-safe-bottom, 16px);
}
```

`--android-safe-bottom` is the Android system navigation bar height (injected from `MainActivity.java` via `WindowInsetsCompat`). In **gesture navigation mode** this is ~0px. In **native button navigation mode** it is ~48dp.

The problem is that `safe-bottom` only accounts for the system nav bar — not the BottomNav component itself. So when the sheet renders `fixed bottom-0`, it sits flush with the system nav bar bottom edge, and the BottomNav (56px tall in portrait) overlaps the top of the sheet, hiding action buttons behind it.

The `SharedUrlActionSheet` uses a custom `fixed inset-0 flex items-end pb-8` wrapper — `pb-8` (32px) is a hardcoded guess that doesn't account for either the BottomNav height or the system nav bar in button navigation mode.

## Correct Fix

Add a new CSS utility `safe-bottom-with-nav` to `src/index.css` that accounts for **both** the Android system nav bar and the BottomNav component height:

- Portrait BottomNav height: `3.5rem` (= `h-14` = 56px)
- Landscape BottomNav height: `2.5rem` (= `h-10` = 40px)
- System nav bar: `var(--android-safe-bottom, 0px)`

```css
/* Portrait: system nav bar + 56px BottomNav */
.safe-bottom-with-nav {
  padding-bottom: calc(var(--android-safe-bottom, 0px) + 3.5rem);
}

/* Landscape: system nav bar + 40px BottomNav */
@media (orientation: landscape) {
  .safe-bottom-with-nav {
    padding-bottom: calc(var(--android-safe-bottom, 0px) + 2.5rem);
  }
}
```

Then apply this utility in two places:

### 1. `src/components/ui/sheet.tsx` — `side="bottom"` variant

The `sheetVariants` CVA for `side: bottom` currently includes `safe-bottom`. Replace it with `safe-bottom-with-nav`:

```ts
// Before
bottom: "inset-x-0 bottom-0 border-t w-full max-w-full overflow-x-hidden safe-bottom ..."

// After
bottom: "inset-x-0 bottom-0 border-t w-full max-w-full overflow-x-hidden safe-bottom-with-nav ..."
```

This fixes all Sheet-based bottom panels at once:
- `BookmarkActionSheet`
- `ScheduledActionActionSheet`
- `ScheduledActionEditor`
- `TrashSheet`
- `BatteryOptimizationHelp`
- `SavedLinksSheet`
- `MessageChooserSheet`
- `LanguagePicker`
- `SettingsPage` language sheet

### 2. `src/components/SharedUrlActionSheet.tsx` — custom fixed panel

This component uses a custom fixed overlay instead of `Sheet`. Its outer wrapper has `pb-8` hardcoded. Replace with an inline style using `calc`:

```tsx
// Before
<div className="fixed inset-0 z-50 flex items-end justify-center p-4 pb-8 bg-black/50 ...">

// After
<div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50 safe-bottom-with-nav ...">
```

## Files Changed

| File | Change |
|------|--------|
| `src/index.css` | Add `.safe-bottom-with-nav` utility with portrait and landscape variants |
| `src/components/ui/sheet.tsx` | Replace `safe-bottom` with `safe-bottom-with-nav` in the bottom sheet variant |
| `src/components/SharedUrlActionSheet.tsx` | Replace `pb-8` with `safe-bottom-with-nav` on the outer wrapper |

## Why Not Just Increase `pb-*` on Each Sheet?

Each Sheet already has its own bottom `pb-6` / `pb-4` for content padding (e.g. `pb-6 landscape:pb-4`). That padding is for the content's visual breathing room. The positioning issue is structural — the sheet itself is anchored to `bottom: 0`, so the entire sheet must be pushed up by the BottomNav height. This is most cleanly solved with a dedicated utility that can be applied at the CVA level.

## Visual Before/After

```text
BEFORE (button navigation mode):
┌─────────────────────────────────┐  ← top of sheet
│  Swipe handle                   │
│  "Open in browser"              │
│  "Create shortcut"              │
│  "Create reminder"              │
│  "Edit"        ← partially vis. │
├═════════════════════════════════╡  ← BottomNav top (overlaps sheet)
│ [Access] [Remind] [Books] [Prof]│  ← BottomNav (56px + safe-bottom)
└─────────────────────────────────┘  ← bottom of screen

AFTER (button navigation mode):
┌─────────────────────────────────┐  ← top of sheet (higher up)
│  Swipe handle                   │
│  "Open in browser"              │
│  "Create shortcut"              │
│  "Create reminder"              │
│  "Edit"        ← fully visible  │
│  "Move to Trash"                │
│  [safe-bottom-with-nav padding] │  ← 56px gap = BottomNav height
├═════════════════════════════════╡  ← BottomNav top
│ [Access] [Remind] [Books] [Prof]│
└─────────────────────────────────┘
```
