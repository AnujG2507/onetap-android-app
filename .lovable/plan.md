

# Fix: Text Overflow in Scheduled Reminders Journey

## Issues Found

### 1. Creator Confirm Step - Preview Card URL (CRITICAL - reported issue)
**File:** `src/components/ScheduledActionCreator.tsx`, lines 817-820

The URL destination text in the confirmation preview card has NO overflow handling:
```tsx
<p className="text-xs text-muted-foreground mt-0.5">
  {destination.type === 'url' && destination.uri}
</p>
```
Long URLs will overflow the card and extend beyond the screen edge. Needs `break-all` and `line-clamp-2` (or `truncate`).

### 2. Creator Confirm Step - Preview Card Title
**File:** `src/components/ScheduledActionCreator.tsx`, line 814

The title uses `truncate` which is fine, but the file name line (818) also has no overflow control for long file names.

### 3. Creator Confirm Step - Timing Text
**File:** `src/components/ScheduledActionCreator.tsx`, lines 822-832

The timing + recurrence line could overflow on narrow screens with long locale strings. Needs wrapping protection.

### 4. ScheduledActionItem - Trigger Time Line
**File:** `src/components/ScheduledActionItem.tsx`, lines 282-286

Has `truncate` -- OK, but the "Expired" prefix concatenation could push content. Already has `truncate`, so this is fine.

### 5. Action Sheet - Destination Name (Already handled)
**File:** `src/components/ScheduledActionActionSheet.tsx`, line 194

Already uses `break-all` -- correctly handled.

### 6. Editor Main View - Destination Label (Already handled)
**File:** `src/components/ScheduledActionEditor.tsx`, line 622

Already uses `truncate` -- correctly handled.

---

## Changes Required

### File: `src/components/ScheduledActionCreator.tsx`

**Fix the confirm step preview card** (lines 813-833):

Change the destination detail `<p>` tag (line 817) from:
```tsx
<p className="text-xs text-muted-foreground mt-0.5">
```
To:
```tsx
<p className="text-xs text-muted-foreground mt-0.5 break-all line-clamp-2">
```

This adds:
- `break-all`: Forces long URLs to wrap at any character boundary instead of overflowing
- `line-clamp-2`: Limits to 2 lines max with ellipsis, preventing tall cards

Change the timing `<p>` tag (line 822) from:
```tsx
<p className="text-xs text-primary mt-1.5">
```
To:
```tsx
<p className="text-xs text-primary mt-1.5 break-words">
```

This ensures locale-formatted date strings wrap properly on narrow viewports.

Two lines changed, single file.

