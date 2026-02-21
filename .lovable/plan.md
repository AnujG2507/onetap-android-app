

## Reminders Feature: UI/UX Evaluation

### Overall Assessment

The reminders feature is well-architected with a polished, Material Design-inspired UI. The multi-step creation flow, timing picker with quick presets, and item management are thoughtfully designed. However, there are several UI/UX gaps that affect visibility, color consistency, and user experience clarity.

---

### Gap 1: Hardcoded Notification Text Strings (Not Localized)

**Severity: Medium**

The native Android notification UI contains several hardcoded English strings that bypass the i18n system:

- `NotificationHelper.java` line 155: `"Snooze " + duration + " min"` -- hardcoded
- `NotificationHelper.java` line 294-304: `"Tap to open"`, `"Tap to call or message"`, `"Tap to open file"`, `"Tap to execute"` -- all hardcoded
- `NotificationHelper.java` line 358-359: `"Snoozed"`, `"Tap to execute now"` -- hardcoded
- `NotificationHelper.java` line 381: `"Snoozed: "` prefix -- hardcoded
- `NotificationHelper.java` line 394-395: `"Snooze again"`, `"Cancel"` -- hardcoded

**Impact**: Non-English users see a mix of their language (from the app) and English (from notifications). This breaks the premium experience.

**Fix**: Move all notification strings to `res/values/strings.xml` and create localized variants in `res/values-{locale}/strings.xml`.

---

### Gap 2: Expired Reminder State Has Weak Visual Differentiation

**Severity: Medium**

In `ScheduledActionItem.tsx`, expired reminders show:
- A subtle `border-destructive/30` border (30% opacity -- barely visible)
- The time text changes to destructive color
- But the overall card looks nearly identical to an active one

In `ScheduledActionActionSheet.tsx` line 196, expired actions show the time as `text-muted-foreground` instead of destructive, which is inconsistent with the item card.

**Impact**: Users can easily miss that a one-time reminder has expired and is no longer functional. The inconsistency between the list item and action sheet creates confusion.

**Fix**: 
- Add a visible "Expired" badge or stronger background tint (e.g., `bg-destructive/5`) to expired items
- Make the action sheet use `text-destructive` for expired time, consistent with the list item
- Consider auto-disabling expired one-time reminders to reduce visual noise

---

### Gap 3: Permission Status Uses Raw Green/Red Instead of Design Tokens

**Severity: Low-Medium**

In `NotificationsPage.tsx` lines 643-653, the permission status indicators use hardcoded `text-green-600` instead of a semantic token. The design system defines `--destructive` for red states but has no explicit "success" token. Using raw color values:
- Breaks dark mode contrast (green-600 on dark background is not optimal)
- Inconsistent with the rest of the app's token-based approach

**Fix**: Use the existing `text-primary` for granted state (blue checkmark matches the app's accent) rather than green, keeping the semantic destructive red for denied state. This maintains the design system's consistency.

---

### Gap 4: Missing "Text" Destination Type in Action Sheet and Missed Banner

**Severity: Medium**

The `ScheduledActionActionSheet.tsx` `getDestinationIcon` function (lines 126-141) handles `file`, `url`, and `contact` but has **no case for `text`** type. A text reminder opened in the action sheet will render no icon.

Similarly, `MissedNotificationsBanner.tsx` `getDestinationIcon` (lines 68-89) handles `url`, `contact`, and `file` but not `text`. The `getDestinationLabel` function also misses `text`.

**Impact**: Text reminders appear broken in the action sheet and missed notifications banner -- no icon, no label.

**Fix**: Add `case 'text': return <AlignLeft />` (or the memo emoji used elsewhere) to both components' icon functions, and add the text label handler.

---

### Gap 5: Disabled Reminder Opacity Creates Readability Issues

**Severity: Low-Medium**

Disabled reminders use `opacity-50` on the entire card (line 293 of `ScheduledActionItem.tsx`). This dims everything including the toggle switch, making it hard to see that the switch is in the "off" position. The low contrast makes the card look like a loading skeleton rather than a deliberate disabled state.

**Fix**: Instead of blanket `opacity-50`, use targeted dimming:
- Dim the icon and text (`text-muted-foreground`)
- Keep the toggle switch at full opacity so users can clearly see and interact with it
- Use `bg-muted/50` background instead of opacity reduction

---

### Gap 6: Snooze Countdown Notification Layout Has Dark-Only Text Colors

**Severity: Medium**

In `notification_snooze_countdown.xml`, all text colors are hardcoded:
- Timer: `#FF333333` (dark gray)
- Action name: `#FF333333` (dark gray)
- Subtitle: `#FF666666` (medium gray)

On Android devices with dark notification themes (common on Android 12+), dark text on dark backgrounds becomes invisible.

**Fix**: Use Android system theme attributes instead of hardcoded colors:
- Timer/title: `?android:attr/textColorPrimary`
- Subtitle: `?android:attr/textColorSecondary`

This ensures automatic light/dark adaptation.

---

### Gap 7: No Visual Feedback During Snooze State in the App

**Severity: Low-Medium**

When a reminder is snoozed (via the notification), the user returns to the app and sees the reminder in its normal state. There is no visual indication in the Reminders tab that an action is currently snoozed. The snooze state is tracked natively in `SharedPreferences` but never surfaced to the React layer.

**Impact**: Users can't see which reminders are currently snoozed when they open the app. If they edit or delete a snoozed reminder, the snooze alarm still exists as an orphan (partially mitigated by the recent gap fixes, but not fully).

**Fix (future consideration)**: Surface snooze state via a plugin method and show a subtle "Snoozed" badge on the item. This is a larger change and can be deferred.

---

### Gap 8: Confirm Step Preview Card Missing Text Destination Display

**Severity: Low**

In `ScheduledActionCreator.tsx` lines 873-877, the confirm step preview card shows destination details for file (name), url (uri), and contact (contactName), but has no case for `text` type. Text reminders show nothing in the preview.

**Fix**: Add `{destination.type === 'text' && destination.name}` to the preview.

---

### Summary of Recommended Fixes

| Priority | Gap | Issue | Effort |
|----------|-----|-------|--------|
| Medium | 4 | Missing text destination type in action sheet and missed banner | Small |
| Medium | 6 | Hardcoded dark text colors in snooze countdown notification | Small |
| Medium | 1 | Hardcoded English strings in native notifications | Medium |
| Medium | 2 | Weak expired state differentiation + inconsistency | Small |
| Low-Med | 3 | Raw green color instead of design tokens | Trivial |
| Low-Med | 5 | Blanket opacity-50 on disabled cards | Small |
| Low | 8 | Missing text destination in confirm preview | Trivial |
| Low-Med | 7 | No snooze state visibility in app | Medium (defer) |

### Immediate Fixes (Gaps 2, 3, 4, 6, 8)

These are small, high-impact fixes that improve visual consistency and prevent broken states for text reminders:

1. **ScheduledActionActionSheet.tsx** and **MissedNotificationsBanner.tsx**: Add `text` destination type handling
2. **ScheduledActionItem.tsx**: Strengthen expired state visuals
3. **NotificationsPage.tsx**: Replace `text-green-600` with `text-primary`
4. **notification_snooze_countdown.xml**: Use theme-aware text colors
5. **ScheduledActionCreator.tsx**: Add text destination to confirm preview
6. **ScheduledActionActionSheet.tsx**: Fix expired time color inconsistency

