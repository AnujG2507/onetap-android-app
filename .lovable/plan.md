
## Problem

The AppMenu `SheetContent` has a hard-coded `w-72` (288px) className that overrides the base sheet variant's `w-3/4` (75% of screen width). On a standard mobile screen this leaves content cramped and the truncation added in the previous round kicks in too eagerly, hiding labels that would otherwise be readable.

## Root Cause

In `src/components/AppMenu.tsx` line 149:
```tsx
<SheetContent
  side={menuSide as "left" | "right"}
  className="w-72 flex flex-col"   // ← w-72 = 288px, hard-coded, too narrow
  ...
>
```

The `sheetVariants` in `sheet.tsx` already sets a sensible responsive width of `w-3/4` (75%) with `sm:max-w-sm` (384px cap) for left/right sides. The `w-72` className passed from `AppMenu` overrides (wins over) the variant width because Tailwind className merging keeps the last/more-specific class.

## Fix

**One change, one file — `src/components/AppMenu.tsx`:**

Change the `SheetContent` className from `w-72` to `w-4/5` (80% of screen width). This gives:
- On a 390px device: ~312px (vs current 288px) — 24px more room
- On a 360px device: ~288px (same as before at minimum)
- Cap it with `max-w-xs` (320px) so it never dominates the screen on wider devices

The updated line:
```tsx
<SheetContent
  side={menuSide as "left" | "right"}
  className="w-4/5 max-w-xs flex flex-col"
  ...
>
```

This gives content like the Cloud Backup sign-in row, trash badge groups, and theme buttons noticeably more horizontal breathing room without the menu taking over the whole screen.

## Technical Details

- `w-4/5` = 80% of viewport width (fluid, device-agnostic)
- `max-w-xs` = 320px hard cap on larger screens (prevents the menu from being too wide on tablets)
- The `overflow-x-hidden` already on the `left`/`right` variants (from the previous fix) continues to provide the clip boundary
- All the `min-w-0` + `truncate` guards added previously remain in place as a safety net for extreme translations, but will trigger far less often now
- No changes needed to `sheet.tsx`, `CloudBackupSection.tsx`, or `index.css`

## Files Changed

| File | Change |
|---|---|
| `src/components/AppMenu.tsx` | `className="w-72 flex flex-col"` → `className="w-4/5 max-w-xs flex flex-col"` |
