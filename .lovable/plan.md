
## Audit Results: Hardcoded & Missing i18n Strings in the Text Feature

Every string used in the text shortcut and reminder feature has been traced across all six components and the en.json locale file. The findings fall into three categories:

### Category A — Keys used in code but completely absent from en.json (will fall back to hardcoded literals forever, and will silently break when other languages are enabled)

All nine `textEditor.*` keys called in `TextEditorStep.tsx` and `ShortcutEditSheet.tsx`:

| Key | Fallback shown today |
|-----|----------------------|
| `textEditor.title` | "Write your text" |
| `textEditor.noteMode` | "Note" |
| `textEditor.checklistMode` | "Checklist" |
| `textEditor.placeholder` | "Write anything — a note, a routine, a reminder..." |
| `textEditor.checklistPlaceholder` | "Item" |
| `textEditor.addItem` | "+ Add item" |
| `textEditor.namePlaceholder` | "e.g. Daily routine, Shopping list..." |
| `textEditor.creating` | "Adding..." |
| `textEditor.addToHomeScreen` | "Add to Home Screen" |
| `textEditor.editTitle` | "Edit text" |
| `textEditor.noContent` | "No content" |

Two `scheduledActions.*` keys called from `ScheduledActionCreator.tsx` but absent from `en.json`:

| Key | String |
|-----|--------|
| `scheduledActions.scheduling` | "Scheduling..." |
| `scheduledActions.scheduleAction` | "Schedule Action" |

### Category B — Strings hardcoded directly in JSX (not using t() at all)

In `ScheduledActionCreator.tsx` `handleCreate()` (lines 370–391), three toast messages bypass i18n entirely by using raw string literals:

```
'✓ Action scheduled'                          (success title)
repeats ${timing.recurrence}                  (success description suffix)
'Could not schedule'                          (error title — scheduledActions.couldNotSchedule key exists but is unused here)
'Something went wrong'                        (error title)
'Could not schedule this action.'             (error description)
```

In `getSuggestedName()` (line 158), two contact label strings are fully hardcoded:
```
`Message ${dest.contactName}`
`Call ${dest.contactName}`
```

### Category C — Missing type label for text shortcuts in ShortcutActionSheet

`getShortcutTypeLabel()` in `ShortcutActionSheet.tsx` has no branch for `shortcut.type === 'text'`, so text shortcuts display the generic "File" label in the action sheet header. The key `shortcutAction.typeText` is missing from `en.json`.

---

## Files to Change

### 1. `src/i18n/locales/en.json`

Add a new `textEditor` block and extend two existing blocks:

```json
// New top-level block to add:
"textEditor": {
  "title": "Write your text",
  "noteMode": "Note",
  "checklistMode": "Checklist",
  "placeholder": "Write anything — a note, a routine, a reminder...",
  "checklistPlaceholder": "Item",
  "addItem": "Add item",
  "namePlaceholder": "e.g. Daily routine, Shopping list...",
  "creating": "Adding...",
  "addToHomeScreen": "Add to Home Screen",
  "editTitle": "Edit text",
  "noContent": "No content"
}

// Add to "shortcutAction":
"typeText": "Text"

// Add to "scheduledActions":
"scheduling": "Scheduling...",
"scheduleAction": "Schedule Action",
"scheduledTitle": "Action scheduled",
"couldNotScheduleDesc": "Could not schedule this action.",
"messageName": "Message {{name}}",
"callName_reminder": "Call {{name}}"
```

Note: `scheduledActions.couldNotSchedule` already exists — the error title for the first catch block can reuse it. `errors.somethingWentWrong` and `scheduledActions.tryAgain` also already exist and can be reused in the second catch block.

### 2. `src/components/TextEditorStep.tsx`

Remove all inline fallback strings from every `t()` call — they are no longer needed once the keys are in `en.json`. No logic changes, only the second argument of each `t()` call is removed.

Lines to update:
- Line 226: `t('textEditor.title', 'Write your text')` → `t('textEditor.title')`
- Line 244: both `t('textEditor.noteMode', 'Note')` and `t('textEditor.checklistMode', 'Checklist')` → no fallback
- Line 275: `t('textEditor.placeholder', 'Write anything...')` → `t('textEditor.placeholder')`
- Line 303: `t('textEditor.checklistPlaceholder', 'Item')` → `t('textEditor.checklistPlaceholder')`
- Line 328: `t('textEditor.addItem', '+ Add item')` → `t('textEditor.addItem')`
- Line 346: `t('textEditor.namePlaceholder', 'e.g. Daily routine...')` → `t('textEditor.namePlaceholder')`
- Line 371: `t('textEditor.creating', 'Adding...')` → `t('textEditor.creating')`
- Line 374: `t('textEditor.addToHomeScreen', 'Add to Home Screen')` → `t('textEditor.addToHomeScreen')`

### 3. `src/components/ShortcutEditSheet.tsx`

Three `t()` calls need fallbacks removed and one needs the correct key used:

- Line 413: `t('textEditor.editTitle', 'Edit text')` → `t('textEditor.editTitle')`
- Line 426: `t('textEditor.placeholder', 'No content')` — the fallback here means "empty state" while the same key in `TextEditorStep` means "placeholder hint". Split these: use `t('textEditor.noContent')` here instead.
- Line 431: `t('textEditor.checklistMode', 'Checklist')` → `t('textEditor.checklistMode')`

### 4. `src/components/ShortcutActionSheet.tsx`

Add a `text` type branch to `getShortcutTypeLabel()` before the `switch` on `fileType`:

```diff
  if (shortcut.type === 'link') return t('shortcutAction.typeLink');
+ if (shortcut.type === 'text') return t('shortcutAction.typeText');
  
  switch (shortcut.fileType) {
```

### 5. `src/components/ScheduledActionCreator.tsx`

Five changes:

**A — Fix `handleCreate` success toast (lines 369–373):**
```diff
- title: '✓ Action scheduled',
- description: `${name} — ${timeStr}${timing.recurrence !== 'once' ? ` (repeats ${timing.recurrence})` : ''}`,
+ title: t('scheduledActions.actionScheduled'),
+ description: `${name} — ${timeStr}`,
```

**B — Fix `handleCreate` first error toast (lines 376–381):**
The key `scheduledActions.couldNotSchedule` already exists. Use it:
```diff
- title: 'Could not schedule',
- description: 'Please try again.',
+ title: t('scheduledActions.couldNotSchedule'),
+ description: t('scheduledActions.tryAgain'),
```

**C — Fix `handleCreate` second error toast (lines 386–391):**
```diff
- title: 'Something went wrong',
- description: 'Could not schedule this action.',
+ title: t('errors.somethingWentWrong'),
+ description: t('scheduledActions.couldNotScheduleDesc'),
```

**D — Fix `getSuggestedName` contact strings (lines 157–158):**
```diff
- case 'contact':
-   return dest.isWhatsApp ? `Message ${dest.contactName}` : `Call ${dest.contactName}`;
+ case 'contact':
+   return dest.isWhatsApp
+     ? t('scheduledActions.messageName', { name: dest.contactName })
+     : t('scheduledActions.callName_reminder', { name: dest.contactName });
```

**E — Remove inline fallbacks from `t()` calls already using keys (lines 771–772):**
```diff
- label={t('scheduledActions.textTitle', 'Text note')}
- description={t('scheduledActions.textDesc', 'A note, checklist, or message to display')}
+ label={t('scheduledActions.textTitle')}
+ description={t('scheduledActions.textDesc')}
```
(Both keys already exist in `en.json`.)

---

## Summary Table

| File | Change type | Count |
|------|-------------|-------|
| `en.json` | Add missing keys | 14 new keys |
| `TextEditorStep.tsx` | Remove fallback strings from t() | 8 lines |
| `ShortcutEditSheet.tsx` | Fix key reference + remove fallbacks | 3 lines |
| `ShortcutActionSheet.tsx` | Add missing `text` type label branch | 1 line |
| `ScheduledActionCreator.tsx` | Replace hardcoded strings + fix t() calls | 5 changes |

No changes are needed to: `ContentSourcePicker.tsx` (all strings correct), `ScheduledActionEditor.tsx` (all strings correct), `MyShortcutsContent.tsx` (uses `shortcuts.filterText` which exists), `AccessFlow.tsx` (no user-facing strings for text flow).
