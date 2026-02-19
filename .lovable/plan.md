

# Fix: Missed Notifications Gaps, Text Overflow, and Toggle Bug

## Issues Found

### Issue 1: Toggle double-fires, appearing broken (CRITICAL)
**File:** `src/components/ScheduledActionItem.tsx`, lines 391-408

The switch wrapper `div` has **both** an `onClick` handler (line 394, calls `onToggle`) **and** an `onTouchEnd` handler (lines 396-400, also calls `onToggle`). On touch devices, a tap fires both events sequentially, so `onToggle()` is called twice -- toggling the switch ON then immediately OFF. The user sees no change, and tapping the switch area also doesn't prevent the parent from registering it as a tap (opening the action sheet) on some edge cases.

**Fix:** Remove the duplicate `onToggle()` call from the `onTouchEnd` handler. Keep `onTouchEnd` only for `e.stopPropagation()` to prevent the parent's touch handler from interpreting it as a tap. The `onClick` handler alone will correctly toggle the switch.

### Issue 2: Text overflow in MissedNotificationsBanner timing row
**File:** `src/components/MissedNotificationsBanner.tsx`, lines 173-179

The timing row uses a `flex` layout with `gap-1.5` but has no overflow protection. The `formatTriggerTime()` output (e.g. "Wednesday at 10:30 AM") plus the "Missed" label can overflow on narrow screens. The flex container doesn't wrap or truncate.

**Fix:**
- Add `min-w-0` to the timing `div` so flex truncation works
- Add `truncate` to the `formatTriggerTime` span so long time strings are cut off gracefully
- Wrap the flex row with `flex-wrap` as a fallback

### Issue 3: Missed notifications detection gap -- disabled actions
**File:** `src/hooks/useMissedNotifications.ts`, line 107

The `isPastDue` function requires `action.enabled === true`. This means:
- If the user disables an action, then the trigger time passes, then the user re-enables it, the action suddenly appears as "missed" even though the user intentionally disabled it during that period. This is more of a false-positive than a gap.
- Conversely, if the system or a bug disables an action, it will never appear as missed.

This behavior is actually correct for the use case (disabled = user doesn't want it). No change needed.

### Issue 4: Recurring actions not auto-advanced when app was closed
**File:** `src/hooks/useMissedNotifications.ts`, lines 131-159

When the app opens after being closed for a while, recurring actions may have a `triggerTime` far in the past. The hook correctly identifies them as missed, but the `executeAction` and `rescheduleAction` callbacks only advance by one cycle (via `advanceToNextTrigger`). If multiple cycles were missed, the action advances to the next occurrence after the original missed time, which may still be in the past. The user would need to dismiss or execute it again.

**Fix:** In `rescheduleAction`, call `advanceToNextTrigger` in a loop until `triggerTime` is in the future, ensuring recurring actions jump to the actual next future occurrence.

---

## Changes

### File 1: `src/components/ScheduledActionItem.tsx`

**Lines 391-408** -- Fix the toggle wrapper to stop double-firing:

Remove `onToggle()` from the `onTouchEnd` handler, keeping only `e.stopPropagation()` to prevent the parent touch handler from treating the touch as a card tap.

```tsx
{!isSelectionMode && (
  <div 
    className="flex items-center shrink-0 relative z-10 pt-2 ms-2" 
    onClick={handleToggleSwitch}
    onTouchStart={(e) => e.stopPropagation()}
    onTouchEnd={(e) => {
      e.stopPropagation();
    }}
  >
    <Switch
      checked={action.enabled}
      onCheckedChange={() => {}}
      className="data-[state=checked]:bg-primary pointer-events-none"
    />
  </div>
)}
```

### File 2: `src/components/MissedNotificationsBanner.tsx`

**Lines 173-179** -- Add overflow protection to the timing row:

```tsx
<div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 flex-wrap">
  <Clock className="h-3 w-3 shrink-0" />
  <span className="truncate">{formatTriggerTime(action.triggerTime)}</span>
  <span className="text-warning-foreground shrink-0">
    • {t('missedNotifications.missed')}
  </span>
</div>
```

### File 3: `src/hooks/useMissedNotifications.ts`

**Lines 256-267** -- Fix `rescheduleAction` to advance to the actual next future occurrence:

```tsx
const rescheduleAction = useCallback(async (id: string) => {
  const action = missedActions.find(a => a.id === id);
  if (!action) return;
  
  if (action.recurrence !== 'once' && action.recurrenceAnchor) {
    // Advance until the trigger time is in the future
    let maxIterations = 365; // Safety cap
    let current = getScheduledActions().find(a => a.id === id);
    while (current && current.triggerTime < Date.now() && maxIterations > 0) {
      advanceToNextTrigger(id);
      current = getScheduledActions().find(a => a.id === id);
      maxIterations--;
    }
  }
  
  dismissAction(id);
}, [missedActions, dismissAction]);
```

Similarly update `executeAction` (lines 246-248) for recurring actions:

```tsx
if (action.recurrence !== 'once') {
  // Advance until trigger is in the future
  let maxIterations = 365;
  let current = getScheduledActions().find(a => a.id === action.id);
  while (current && current.triggerTime < Date.now() && maxIterations > 0) {
    advanceToNextTrigger(action.id);
    current = getScheduledActions().find(a => a.id === action.id);
    maxIterations--;
  }
}
```

---

## Summary

| Issue | File | Fix |
|-------|------|-----|
| Toggle double-fires (appears broken) | ScheduledActionItem.tsx | Remove duplicate `onToggle()` from `onTouchEnd` |
| Timing text overflow in banner | MissedNotificationsBanner.tsx | Add `min-w-0`, `truncate`, `flex-wrap`, `shrink-0` |
| Recurring actions stuck in past | useMissedNotifications.ts | Loop `advanceToNextTrigger` until future |

Three files, focused surgical fixes.

