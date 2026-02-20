
## End-to-End Test: Text Tile Flow — Findings & Fix Plan

### What Was Tested

A complete code trace of the two text tile paths:
1. Access tab → Text tile → "One Tap Access" → shortcut creation
2. Access tab → Text tile → "Reminder" → reminder creation
3. Notifications tab → "+" → Text tile → reminder creation

---

### Critical Bug Found: Text Tile Is Wired Broken in AccessFlow

Two bugs exist in `src/components/AccessFlow.tsx` that completely break the text shortcut creation path:

**Bug 1 — `onSelectText` prop is never passed to `ContentSourcePicker`**

`AccessFlow` defines `handleSelectText` (line 392) but the `ContentSourcePicker` instantiation (lines 596–605) does not include `onSelectText={handleSelectText}`. The Text tile renders because `ContentSourcePicker` shows it unconditionally, but tapping either "One Tap Access" or "Reminder" in the action picker dropdown does nothing — the callback is `undefined` and `handleActionSelect` silently returns without routing.

**Bug 2 — The `text-editor` step is never rendered**

`AccessFlow` sets `step = 'text-editor'` inside `handleSelectText` (line 398), and registers a back handler for it (line 170), but there is no corresponding render branch in the JSX. The file renders: `source`, `url`, `customize`, `slideshow-customize`, `contact`, `success` — but `text-editor` is completely absent. Tapping "Text" with `onSelectText` wired would set the step but show a blank screen.

The Notifications tab path (`ScheduledActionCreator`) is **working correctly** — the text sub-step, `TextEditorStep` sub-flow, and destination wiring are all present and correct.

---

### What Is Working Correctly (Do Not Change)

- `ContentSourcePicker.tsx` — Text tile renders in correct 4+3 portrait grid, action picker dropdown works, `onSelectText?.('shortcut')` and `onSelectText?.('reminder')` calls are correct.
- `TextEditorStep.tsx` — Note/Checklist editor, Markdown toolbar, name field, icon picker, all props work correctly.
- `ScheduledActionCreator.tsx` — Text tile flow for reminders is fully functional: `textSubStep === 'editor'` renders `TextEditorStep`, back handler resets state, `handleDestinationSelect` wires the text destination.
- `useShortcuts.createTextShortcut` — Correctly creates a `ShortcutData` with `type: 'text'`, `textContent`, `isChecklist`.
- `shortcutManager.buildContentIntent` — Correctly builds the `app.onetap.OPEN_TEXT` intent with `text_content` and `is_checklist` extras.
- `MyShortcutsContent.tsx` — Correctly renders the 📝 emoji for text shortcuts, shows "Text" type label, supports the `'text'` filter chip.
- `types/shortcut.ts` — `ShortcutType` includes `'text'`, `textContent?` and `isChecklist?` fields are present.
- `types/scheduledAction.ts` — `TextDestination` interface is complete and correct.

---

### Fix Plan: Two Changes to `src/components/AccessFlow.tsx`

**Change 1 — Pass `onSelectText` to `ContentSourcePicker` (lines 596–605)**

Add `onSelectText={handleSelectText}` to the `ContentSourcePicker` props:

```diff
  <ContentSourcePicker
    onSelectFile={handleSelectFile}
    onSelectContact={handleSelectContact}
    onSelectFromLibrary={handleSelectFromLibrary}
    onEnterUrl={handleEnterUrl}
+   onSelectText={handleSelectText}
    onPickerOpenChange={(isOpen) => {
      setIsInlinePickerOpen(isOpen);
      onPickerOpenChange?.(isOpen);
    }}
  />
```

**Change 2 — Add the missing `text-editor` render branch (after the `contact` step block)**

Insert a render branch between the `contact` step and `success` step blocks:

```diff
+ {step === 'text-editor' && (
+   <TextEditorStep
+     showIconPicker={pendingActionMode !== 'reminder'}
+     isReminder={pendingActionMode === 'reminder'}
+     onBack={handleGoBack}
+     onConfirm={handleTextConfirm}
+   />
+ )}

  {step === 'success' && (
    <SuccessScreen
      shortcutName={lastCreatedName}
      onDone={handleReset}
    />
  )}
```

---

### Complete Expected Flow After Fix

```text
ACCESS TAB — SHORTCUT PATH
─────────────────────────────────────────────────────────────────────
1. Tap "Text" tile → ActionModePicker expands
2. Tap "One Tap Access"
   → handleSelectText('shortcut') called
   → pendingActionMode = 'shortcut', step = 'text-editor'
3. TextEditorStep renders (showIconPicker=true, isReminder=false)
4. Write markdown note or checklist, set name, choose icon → "Add to Home Screen"
   → handleTextConfirm() called
   → createTextShortcut() → ShortcutData{type:'text', textContent, isChecklist}
   → createHomeScreenShortcut() → intent app.onetap.OPEN_TEXT → ShortcutPlugin
   → step = 'success' → SuccessScreen renders
5. Shortcut appears in My Access Points with 📝 icon (or chosen emoji)
6. Tapping home screen icon → TextProxyActivity renders Markdown or Checklist

ACCESS TAB — REMINDER PATH
─────────────────────────────────────────────────────────────────────
1. Tap "Text" tile → ActionModePicker expands
2. Tap "Reminder"
   → handleSelectText('reminder') called
   → pendingActionMode = 'reminder', step = 'text-editor'
3. TextEditorStep renders (showIconPicker=false, isReminder=true, button says "Continue")
4. Write content, set name → "Continue"
   → handleTextConfirm() called → pendingActionMode is 'reminder'
   → TextDestination created → onCreateReminder(destination)
   → tab switches to Notifications, ScheduledActionCreator opens pre-filled
5. User sets time and recurrence → scheduled action created with text destination

NOTIFICATIONS TAB — REMINDER PATH (already working)
─────────────────────────────────────────────────────────────────────
1. Tap "+" → ScheduledActionCreator opens at destination step
2. Tap "Text" tile → ActionModePicker expands → tap "Reminder"
   → textSubStep = 'editor'
3. TextEditorStep renders (showIconPicker=false, isReminder=true)
4. Write content, set name → "Continue"
   → TextDestination created → handleDestinationSelect() → step = 'timing'
5. Set time → step = 'confirm' → handleCreate() → scheduled action saved
```

---

### Technical Implementation Details

**File:** `src/components/AccessFlow.tsx`

- **Line 596–605**: Add `onSelectText={handleSelectText}` to `ContentSourcePicker` props. This is a one-line addition.

- **After line 671** (after the `{step === 'contact' && ...}` block closes): Insert the `text-editor` step render branch using `TextEditorStep` with `showIconPicker={pendingActionMode !== 'reminder'}` and `isReminder={pendingActionMode === 'reminder'}`.

**No other files need changes.** The bug is entirely contained in `AccessFlow.tsx`.

---

### Post-Fix Manual Test Checklist (Physical Android Device Required)

- [ ] Text tile visible in second row of Access tab, fills full width equally with Contact and Link tiles
- [ ] Tapping Text tile shows "One Tap Access" and "Reminder" action buttons
- [ ] **Shortcut path**: Tap "One Tap Access" → TextEditorStep opens with icon picker visible → write markdown → tap "Add to Home Screen" → SuccessScreen appears → shortcut appears in My Access Points with chosen icon → tapping home screen icon opens TextProxyActivity → Markdown renders correctly
- [ ] **Checklist path**: Same as above but switch to Checklist mode → create items → add to home screen → tap home screen icon → checkboxes appear → toggle checkbox → close and reopen → state persists (localStorage + SharedPreferences)
- [ ] **Back navigation from note editor**: Back button returns to source screen without creating shortcut
- [ ] **Reminder path from Access tab**: Tap Text → "Reminder" → editor shows "Continue" (no icon picker) → Continue → Notifications tab opens with timing picker pre-filled with text destination
- [ ] **Reminder path from Notifications tab**: "+" → Text tile → Reminder → editor → Continue → timing → confirm → reminder appears in list with 📝 icon and text content preview
- [ ] Text filter chip in My Access Points correctly shows only text shortcuts
- [ ] Text shortcuts are never marked dormant (no cloud-off badge)
