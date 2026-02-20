
## Fix: Checklist Check/Uncheck in TextViewer (Web Path)

### Root Cause

The `TextViewer.tsx` web rendering path has a double-toggle bug in its checklist implementation. There are two layers that both respond to the same user interaction:

1. The `<label>` element has `onClick={() => toggleItem(i)}` directly attached.
2. The `<Checkbox>` inside that label also has `onCheckedChange={() => toggleItem(i)}`.

Because the `<Checkbox>` is a child of the `<label>`, a single tap on either the checkbox OR the label text fires **both** handlers — the item checks then immediately unchecks, making it appear completely broken.

There is also a structural issue: the `<label>` element is used as the interactive row container but has its own `onClick`, which conflicts with the native click propagation from the checkbox through the label.

The native Android path (`TextProxyActivity.java`) uses raw `<input type="checkbox">` with `onchange` and is unaffected — it works correctly.

### Fix

**File: `src/pages/TextViewer.tsx`**

Restructure each checklist row so that only **one** interaction path fires `toggleItem`:

- Remove `onClick` from the `<label>` wrapper entirely.
- Remove `onCheckedChange` from the `<Checkbox>` entirely.
- Instead, use the `<label>`'s natural `htmlFor` + the Radix `<Checkbox>` `id` prop so that clicking anywhere on the row (label text or checkbox) only triggers the checkbox's `checked` state change via `onCheckedChange` on the Checkbox — with no duplicated outer handler.

The cleanest approach that avoids all double-fire is:

```tsx
// Each row becomes:
<div
  key={i}
  className="flex items-start gap-3 cursor-pointer"
  onClick={() => toggleItem(i)}   // ← single handler on wrapper div
>
  <Checkbox
    id={`item-${i}`}
    checked={item.checked}
    onClick={(e) => e.stopPropagation()} // ← prevent bubbling up to div
    onCheckedChange={() => toggleItem(i)}
    className="mt-0.5 shrink-0"
  />
  <label
    htmlFor={`item-${i}`}
    className={cn(
      'text-base leading-relaxed select-none cursor-pointer flex-1',
      item.checked && 'line-through text-muted-foreground'
    )}
    onClick={(e) => e.stopPropagation()} // ← label click handled by checkbox via htmlFor
  >
    {item.text}
  </label>
</div>
```

Wait — this creates the same problem. The cleanest, zero-double-fire pattern is:

- **Remove the outer click handler entirely.**
- Let the `<label htmlFor>` + `<Checkbox id>` pairing handle all interaction natively. The Radix checkbox receives the click through the label's `for` association and fires `onCheckedChange` exactly once.
- The `<label>` must NOT have its own `onClick`.

Final clean structure per row:
```tsx
<div key={i} className="flex items-start gap-3 py-0.5">
  <Checkbox
    id={`chk-${i}`}
    checked={item.checked}
    onCheckedChange={() => toggleItem(i)}
    className="mt-0.5 shrink-0"
  />
  <label
    htmlFor={`chk-${i}`}
    className={cn(
      'text-base leading-relaxed select-none cursor-pointer flex-1',
      item.checked && 'line-through text-muted-foreground'
    )}
  >
    {item.text}
  </label>
</div>
```

This is the correct HTML pattern: clicking the label text sends the click event to the associated checkbox input (via `for`/`id`), which fires `onCheckedChange` exactly once. No double-fire.

### Additional Improvements in the Same Change

1. **Touch target size** — wrap items in a slightly larger touch area (`py-2`) so the row is easy to tap on mobile without needing pixel-perfect aim on the checkbox.

2. **Checked item visual** — already present (`line-through text-muted-foreground`), keep as-is.

3. **Checklist persistence** — `toggleItem` already writes to `localStorage` with the correct `STORAGE_KEY` pattern. No change needed there.

4. **Empty state** — if `items` is empty (all lines were blank after filtering), show a graceful "No items" message rather than a blank scroll area.

### Technical Summary

| What | Before | After |
|---|---|---|
| Click handler | `<label onClick>` + `<Checkbox onCheckedChange>` (double fire) | `<Checkbox onCheckedChange>` only, triggered via `<label htmlFor>` |
| Touch target | Entire label row | Entire label row (same, but via correct `for`/`id` wiring) |
| State persistence | `localStorage` via `toggleItem` | Unchanged |
| Double-toggle bug | Present — item always bounces back | Fixed — exactly one state change per tap |

### File Changed

- `src/pages/TextViewer.tsx` — restructure checklist row rendering to eliminate double-toggle
