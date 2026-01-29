
# Plan: Direct Call Placement for Contact One Tap Access/Reminders

## Overview
When a user taps on a One Tap Access or One Tap Reminder for a call contact, the app currently opens the phone dialer with the number pre-filled. This requires an extra tap to actually place the call.

This change will make tapping directly place the call, removing the extra step and delivering the true "one tap" promise.

## Changes Required

### 1. Add CALL_PHONE Permission
**File:** `native/android/app/src/main/AndroidManifest.xml`

Add the `CALL_PHONE` permission which is required by Android to directly initiate phone calls:
```xml
<uses-permission android:name="android.permission.CALL_PHONE" />
```

### 2. Update Shortcut Intent Builder
**File:** `src/lib/shortcutManager.ts`

Change the intent action for contact shortcuts from `ACTION_DIAL` to `ACTION_CALL`:
- Current: `action: 'android.intent.action.DIAL'`
- New: `action: 'android.intent.action.CALL'`

### 3. Update Notification Click Handler
**File:** `native/android/app/src/main/java/app/onetap/shortcuts/NotificationClickActivity.java`

Update the `executeAction` method to use `ACTION_CALL` instead of `ACTION_DIAL` for contact destinations:
- Current: `Intent.ACTION_DIAL`
- New: `Intent.ACTION_CALL`

### 4. Update Notification Helper Intent Builder
**File:** `native/android/app/src/main/java/app/onetap/shortcuts/NotificationHelper.java`

Update the `buildActionIntent` method for contacts to use `ACTION_CALL`:
- Current: `Intent.ACTION_DIAL`
- New: `Intent.ACTION_CALL`

## Technical Details

### Android Intent Actions
- **`ACTION_DIAL`**: Opens the dialer app with the number pre-filled but does NOT place the call
- **`ACTION_CALL`**: Directly places the phone call without user confirmation

### Permission Requirement
The `CALL_PHONE` permission is a "dangerous" permission in Android, meaning:
- On Android 6.0+ (API 23+), runtime permission is required
- The user will be prompted to grant permission the first time a call shortcut is tapped
- This is a one-time prompt; once granted, all subsequent calls work seamlessly

### Web Fallback Behavior
The web fallback (`window.open('tel:...')` in `useMissedNotifications.ts` and `shortcutPluginWeb.ts`) will continue to work as-is. On mobile web browsers, `tel:` links typically open the dialer since web apps cannot directly place calls for security reasons. This is acceptable for the web fallback path.

## User Experience Flow

**Before (current):**
1. User taps contact One Tap Access shortcut
2. Dialer opens with number pre-filled
3. User taps call button to place call
4. Call is placed

**After (proposed):**
1. User taps contact One Tap Access shortcut
2. (First time only) User grants CALL_PHONE permission if not already granted
3. Call is placed directly

## Edge Cases Handled

- **Permission denied**: If user denies CALL_PHONE permission, the call intent will fail gracefully. The native side should handle `SecurityException` and potentially fall back to `ACTION_DIAL`.
- **Web fallback**: Web users will continue to see the dialer open (expected browser behavior)
- **Recurring reminders**: Work identically - tap notification, call is placed directly

## Files Changed Summary
| File | Change |
|------|--------|
| `AndroidManifest.xml` | Add `CALL_PHONE` permission |
| `shortcutManager.ts` | Change intent action to `ACTION_CALL` |
| `NotificationClickActivity.java` | Change intent to `ACTION_CALL` |
| `NotificationHelper.java` | Change intent to `ACTION_CALL` |
