

## Fix Tutorial Bugs

### Bug 1: Missing `tutorial-settings-button` ID

The profile tutorial step 2 targets `tutorial-settings-button`, but no element has this ID. The Settings button lives inside the AppMenu sheet (which is closed), so pointing at it is impossible. 

**Fix:** Change the target in `useTutorial.ts` from `tutorial-settings-button` to the AppMenu trigger button, and add `id="tutorial-settings-button"` to the `AppMenu` trigger `<Button>` in `AppMenu.tsx`. This way the coach mark points at the menu button, saying "open the menu to customize settings." Update the description key text accordingly.

**Files:**
- `src/components/AppMenu.tsx` -- add `id="tutorial-settings-button"` to the trigger Button
- `src/i18n/locales/en.json` -- update `tutorial.profile.step2Desc` to mention opening the menu

### Bug 2: Missing `tutorial.tapToDismiss` translation

The `CoachMark.tsx` renders `t('tutorial.tapToDismiss')` but this key is missing from `en.json`.

**Fix:** Add `"tapToDismiss": "Tap anywhere to dismiss"` to the `tutorial` section in `en.json`.

**Files:**
- `src/i18n/locales/en.json`

### Bug 3: Double-event firing on mobile

`TutorialCoachMarks.tsx` listens to both `click` and `touchstart`, causing `onDismiss` to fire twice on touch devices.

**Fix:** Remove the `touchstart` listener entirely. The `click` event already fires on both desktop and mobile. This is the simplest and most reliable fix.

**Files:**
- `src/components/TutorialCoachMarks.tsx` -- remove the `touchstart` addEventListener/removeEventListener lines

### Bug 4: Tutorial activation gated on data availability

In `NotificationsPage.tsx` (line 1085) and `BookmarkLibrary.tsx` (line 1287), the tutorial only renders when `actions.length > 0` / `links.length > 0`. This means a new user with no data "burns" their tutorial visit count without ever seeing the tips.

**Fix:** In `useTutorial.ts`, add a `gate` mechanism: accept an optional `ready` parameter. Only increment visit count and start timers when `ready` is true. If not ready, do nothing (don't burn the visit). Then pass `ready` from the consuming components:
- `NotificationsPage`: `useTutorial('reminders', { ready: actions.length > 0 })`
- `BookmarkLibrary`: `useTutorial('library', { ready: links.length > 0 })`
- `AccessFlow` and `ProfilePage`: no change needed (always ready)

**Files:**
- `src/hooks/useTutorial.ts` -- add optional `ready` param (default `true`), gate the visit tracking and timer logic on it
- `src/components/NotificationsPage.tsx` -- pass ready option
- `src/components/BookmarkLibrary.tsx` -- pass ready option

### Summary of all file changes

| File | Changes |
|------|---------|
| `src/hooks/useTutorial.ts` | Add `ready` option to gate tutorial activation |
| `src/components/TutorialCoachMarks.tsx` | Remove `touchstart` listener |
| `src/components/AppMenu.tsx` | Add `id="tutorial-settings-button"` to trigger button |
| `src/i18n/locales/en.json` | Add `tapToDismiss` key, update profile step 2 description |
| `src/components/NotificationsPage.tsx` | Pass `{ ready: actions.length > 0 }` to `useTutorial` |
| `src/components/BookmarkLibrary.tsx` | Pass `{ ready: links.length > 0 }` to `useTutorial` |

