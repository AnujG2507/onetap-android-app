
## Goal
Eliminate *all* horizontal overflow inside the **My Shortcuts** bottom sheet (portrait + landscape), including:
- List items (title + “Type · Target” + taps badge + chevron)
- Filter chip row (currently visibly clipped on the right in your screenshot, indicating horizontal scroll is not functioning)
- Any other sheet sections (header, search row, sort row)

## What I found (from code + your screenshot)
1. **The filter-chip row is clipped**
   - In your screenshot, the rightmost chip (“WhatsApp”) is cut off.
   - This strongly suggests the horizontal scroll behavior is currently being blocked (not just “layout overflow”).
2. **Our ScrollArea wrapper now forces `overflow-x-hidden` on the Viewport**
   - File: `src/components/ui/scroll-area.tsx`
   - Current: `ScrollAreaPrimitive.Viewport ... overflow-x-hidden`
   - This prevents horizontal scrolling anywhere `ScrollArea` is used for horizontal content (like the chips row).
3. **The shortcut list item still has a likely “weak” shrink/truncate pattern on the metadata text**
   - File: `src/components/ShortcutsList.tsx`
   - Current metadata span: `truncate min-w-0 flex-shrink`
   - In practice, `flex-shrink` alone is not always enough to reliably force truncation under all conditions; the most reliable pattern is `flex-1 min-w-0 truncate` with a `shrink-0` badge.

## Root cause hypothesis (why overflow still exists)
- We “fixed” vertical list overflow by globally hiding X overflow inside **all** ScrollAreas. That unintentionally broke horizontal scrolling for the chip row and can produce clipped content that looks like overflow.
- The list item metadata row likely still has edge cases where the “Type · Target” doesn’t yield width predictably (especially with long unbroken domains), because the span isn’t a true `flex-1` item.

## Implementation approach (safe + systematic)
We’ll do two things:
1) **Make ScrollArea configurable** so horizontal ScrollAreas can scroll horizontally again, while vertical lists can still clamp X overflow.
2) **Re-harden the shortcut list item layout** using the strict, proven “flex-1 min-w-0 truncate + shrink-0 badge” pattern and add a final safety clamp.

---

## Planned changes

### A) Fix ScrollArea so it doesn’t globally kill horizontal scrolling
**File:** `src/components/ui/scroll-area.tsx`

**Change:**
- Remove the unconditional `overflow-x-hidden` from the Viewport.
- Add an optional prop like `viewportClassName` (or `disableXOverflow` / `lockX`) so we can selectively apply `overflow-x-hidden` only where we want it (vertical lists).

**Why:**
- The chip row needs horizontal scrolling, and this should not be blocked at the component-library level.

**Outcome:**
- Horizontal ScrollAreas (chips) can scroll.
- Vertical ScrollAreas (lists) can still opt into “no x overflow”.

---

### B) Restore correct horizontal chip scrolling and stop chip clipping
**File:** `src/components/ShortcutsList.tsx`

**Changes in the “Type Filter Chips” section:**
- Ensure the inner chip container uses `w-max` (or equivalent) so it can exceed viewport width and scroll smoothly.
- Ensure the ScrollArea instance used for chips has a viewport that allows `overflow-x-auto` (or at least not `overflow-x-hidden`).
- Add right padding (e.g., `pe-3` / `pe-4`) inside the scrolling content so the last chip isn’t clipped under rounded edges/scrollbar.

**Why:**
- The screenshot shows the final chip is cut off: that’s a “horizontal scroll disabled or clipped content” symptom.

---

### C) Re-harden `ShortcutListItem` to guarantee no overflow for any item
**File:** `src/components/ShortcutsList.tsx`

**Changes inside `ShortcutListItem`:**
1. Add a final clamp on the outer button:
   - add `overflow-hidden` (and keep `w-full max-w-full box-border`).
2. Title line:
   - keep `TruncatedText` for consistent truncation (no tap-to-expand).
3. Metadata row:
   - change the metadata span from `... flex-shrink` to:
     - `className="text-xs text-muted-foreground flex-1 min-w-0 truncate"`
   - keep the badge as:
     - `className="shrink-0 whitespace-nowrap ml-auto ..."`
4. Keep icon + chevron as `shrink-0`.

**Why:**
- `flex-1 min-w-0 truncate` is the most reliable way to force truncation in flex rows across devices/orientations.
- `overflow-hidden` on the button provides a final “nothing can bleed out” safety net.

---

### D) Verify other sheet areas can’t overflow
**File:** `src/components/ShortcutsList.tsx`

We’ll quickly sanity-harden these container layers:
- `SheetContent`: ensure it has `overflow-hidden` and `max-w-full`
- The vertical list `ScrollArea`: ensure we opt into “lock X overflow” via the new `viewportClassName` (e.g., `overflow-x-hidden`)
- Inner list wrapper `div`: keep `w-full max-w-full overflow-hidden`

---

## QA / Verification checklist (what I will test after implementation)
1. **Portrait:** Open “My Shortcuts”
   - Chips row: can horizontally scroll; last chip fully reachable; no clipping.
   - List items: long domains and long titles do not create horizontal scroll; badge + chevron always remain visible.
2. **Landscape:** Repeat all checks.
3. **Stress test:** Add or simulate:
   - Very long unbroken domain (S3 URLs like in screenshot)
   - Very long shortcut name with no spaces
4. **Interaction sanity:** Tapping list item still opens the action sheet (no interference from text expansion, since we removed tap-to-extend globally already).

---

## Files to change (summary)
- `src/components/ui/scroll-area.tsx`
  - Remove global `overflow-x-hidden`
  - Add `viewportClassName` (or similar) to selectively clamp X overflow
- `src/components/ShortcutsList.tsx`
  - Fix chip row to scroll horizontally (no clipping)
  - Tighten `ShortcutListItem` metadata row (`flex-1 min-w-0 truncate`)
  - Add final `overflow-hidden` clamp on list item button
  - Ensure vertical list ScrollArea explicitly clamps x overflow via the new viewport prop

---

## Notes on scope
- This plan focuses on the **My Shortcuts** sheet overflow you’re still seeing (and the visible chip clipping).
- We already ensured action sheets wrap content instead of truncating; these changes won’t reintroduce truncation in action sheets.
