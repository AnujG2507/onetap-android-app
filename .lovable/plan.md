

# Fix CALL_PHONE Permission Not Triggering on Samsung Galaxy

## Problem

On Samsung Galaxy devices, the CALL_PHONE permission prompt never appears when creating a contact shortcut. This happens because:

1. **Permanently denied state**: Samsung One UI aggressively remembers permission denials. After denying once (or selecting "Don't ask again"), `requestPermissions()` silently does nothing -- no dialog appears, no callback fires, and the Capacitor PluginCall hangs indefinitely.

2. **No fallback for permanently denied**: The current code only has two paths: "already granted" and "request it". There's no handling for the third state: "permanently denied, system won't show the prompt."

3. **Late request timing**: The permission is requested deep inside `createHomeScreenShortcut()`, after multiple async operations. While this isn't a web API gesture issue, it means any failure here blocks the entire shortcut creation flow.

## Solution

### 1. Native: Add permanent-denial detection in `ShortcutPlugin.java`

In `requestCallPermission`, before calling `requestPermissionForAlias`, check `shouldShowRequestPermissionRationale`:
- If permission is NOT granted AND rationale is `false`, the user has permanently denied it
- In this case, return `{ granted: false, permanentlyDenied: true }` so JS can handle it
- If rationale is `true` (or first time asking), proceed with the normal system dialog

### 2. Native: Update `checkCallPermission` to include denial state

Return an additional `permanentlyDenied` field so the JS layer knows whether to show the system prompt or redirect to app settings.

### 3. JS: Handle permanently denied state in `shortcutManager.ts`

When `permanentlyDenied: true` is returned:
- Show a toast explaining the user needs to grant permission in Settings
- Open the app's Settings page using Capacitor's `App` plugin (or an intent)
- Continue creating the shortcut regardless (ContactProxyActivity will fall back to dialer)

### 4. JS: Add app settings opener

Add a new method `openAppSettings` to ShortcutPlugin that opens the Android app info/permissions screen, so the user can manually enable CALL_PHONE.

## Files Changed

| File | Change |
|------|--------|
| `native/.../plugins/ShortcutPlugin.java` (~line 3411) | Update `requestCallPermission` to detect permanently denied state using `shouldShowRequestPermissionRationale`; update `checkCallPermission` to return `permanentlyDenied` field; add `openAppSettings` method |
| `src/plugins/ShortcutPlugin.ts` | Update `checkCallPermission` and `requestCallPermission` return types to include `permanentlyDenied`; add `openAppSettings` method signature |
| `src/plugins/shortcutPluginWeb.ts` | Add web stubs for updated signatures and `openAppSettings` |
| `src/lib/shortcutManager.ts` (~line 189) | Handle `permanentlyDenied` response: show informational toast and open app settings; continue shortcut creation regardless |

## Technical Detail

```text
Current flow:
  checkCallPermission() -> not granted
  requestCallPermission() -> Samsung silently ignores -> hangs forever

Fixed flow:
  checkCallPermission() -> { granted: false, permanentlyDenied: true/false }
  If permanentlyDenied:
    -> Toast "Please enable Call permission in Settings"
    -> openAppSettings() (opens Android app info screen)
    -> Continue creating shortcut (dialer fallback)
  If not permanentlyDenied:
    -> requestCallPermission() -> system dialog appears
    -> Continue creating shortcut
```

The key Android API used is `shouldShowRequestPermissionRationale(activity, permission)`:
- Returns `true` if user denied once but didn't check "Don't ask again" (system will show dialog)
- Returns `false` if user never asked OR permanently denied (need to distinguish via current grant state)

