

## Fix: Reliable pin verification using Android's confirmation callback

### Problem

The current 3-second fixed timer starts immediately when the "Add to Home Screen" button is tapped in the app. But the native Android pin dialog may still be open at that point -- the user might be deciding whether to tap "Add", drag the shortcut, or press Back. The timer fires while the dialog is still visible, causing false negatives (removing shortcuts that the user is about to confirm).

### How Android's pin dialog works

When `requestPinShortcut()` is called with a `PendingIntent` callback:
- **User taps "Add"**: The callback PendingIntent fires immediately, shortcut appears on home screen
- **User drags to home screen**: App goes to background during the drag. Callback fires when drop completes. User then returns to app
- **User presses Back/dismisses**: The callback NEVER fires. App stays in foreground (or returns from background)

The app already creates a PendingIntent with action `app.onetap.SHORTCUT_PINNED`, but no BroadcastReceiver listens for it -- it's effectively a no-op.

### Solution: Positive confirmation model

Instead of guessing with a timer, use the PendingIntent callback that Android already provides to positively confirm pins. Then verify on app resume.

### Technical Details

**1. New file: `ShortcutPinConfirmReceiver.java`**

A BroadcastReceiver that:
- Listens for `app.onetap.SHORTCUT_PINNED` broadcasts
- Extracts the shortcut ID from the intent extra
- Saves it to SharedPreferences (`pin_confirmations`) with the current timestamp
- Logs the confirmation for debugging

**2. Update `AndroidManifest.xml`**

Register the new receiver:
```xml
<receiver
    android:name=".ShortcutPinConfirmReceiver"
    android:exported="false">
    <intent-filter>
        <action android:name="app.onetap.SHORTCUT_PINNED" />
    </intent-filter>
</receiver>
```

**3. Update `ShortcutPlugin.java` -- PendingIntent creation**

Both places where the `app.onetap.SHORTCUT_PINNED` callback PendingIntent is created (text shortcuts ~line 339, general shortcuts ~line 566) need to:
- Include the shortcut ID as an intent extra (`shortcut_id`)
- Use a unique request code per shortcut (e.g., `id.hashCode()`) so multiple pending pin requests don't overwrite each other's PendingIntents

**4. New plugin method: `checkPinConfirmed`**

Add a `@PluginMethod` to ShortcutPlugin:
- Accepts a shortcut ID
- Checks SharedPreferences for a confirmation entry
- Returns `{ confirmed: boolean }`
- Clears the confirmation entry after reading (consume-once)

**5. Update `ShortcutPlugin.ts` -- TypeScript interface**

Add the new method signature:
```typescript
checkPinConfirmed(options: { id: string }): Promise<{ confirmed: boolean }>;
```

**6. Update `useShortcuts.ts` -- `verifyShortcutPinned` logic**

Replace the fixed 3-second timer with an event-driven approach:

```text
verifyShortcutPinned(id):
  if not native: return

  // Phase 1: Wait for app resume (dialog closed)
  // The pin dialog either keeps app in foreground (Add/Back)
  // or sends it to background (drag). Either way, we wait for
  // the next appStateChange to active, OR a short initial delay
  // if the app never went to background (Add/Back case).
  
  wait for first of:
    - appStateChange to active (drag-and-drop case)
    - 1.5 seconds (Add button / Back button case -- app stays foreground)
  
  // Phase 2: Small grace period for the BroadcastReceiver to fire
  wait 1 second
  
  // Phase 3: Check positive confirmation
  result = checkPinConfirmed(id)
  if result.confirmed:
    log "Pin confirmed by callback"
    return  // shortcut is good
  
  // Phase 4: Fallback -- also check OS-reported pinned IDs
  // (some OEM launchers may not fire the callback reliably)
  pinnedResult = getPinnedShortcutIds()
  if pinnedResult.error: return  // don't delete on API failure
  if id in pinnedResult.ids:
    log "Pin confirmed by OS query"
    return  // shortcut is good
  
  // Phase 5: Not confirmed by either method -- remove
  remove from localStorage
  show toast "Shortcut was not added to home screen"
  cleanupRegistry
```

The key improvement: instead of a blind 3-second timer, we use a two-phase wait:
1. Wait for the dialog to close (detected via app resume or a short timeout for the in-foreground case)
2. Then check for positive confirmation from the Android callback

This handles all three user flows:
- **"Add" button**: App stays in foreground. 1.5s timeout triggers. Callback has already fired. Confirmed.
- **Drag-and-drop**: App goes to background during drag. App resume triggers when user returns. Callback has fired. Confirmed.
- **Back/dismiss**: App stays in foreground. 1.5s timeout triggers. No callback. Not confirmed. Cleanup.

### Files to create

| File | Purpose |
|------|---------|
| `native/.../ShortcutPinConfirmReceiver.java` | BroadcastReceiver for pin confirmation callback |

### Files to modify

| File | Change |
|------|--------|
| `native/.../AndroidManifest.xml` | Register the new receiver |
| `native/.../plugins/ShortcutPlugin.java` | Add shortcut ID to PendingIntent extras + unique request codes + `checkPinConfirmed` method |
| `src/plugins/ShortcutPlugin.ts` | Add `checkPinConfirmed` to TypeScript interface |
| `src/hooks/useShortcuts.ts` | Rewrite `verifyShortcutPinned` with event-driven confirmation logic |

