

# Plan: Enable Shortcut Editing via Alternative Methods

## The Problem

Android does **NOT** support custom context menu actions (like "Edit") when long-pressing a pinned shortcut on the home screen. This is a platform limitation:

- Long-pressing a **pinned shortcut** only shows "Remove" (controlled by the launcher)
- Long-pressing the **app icon** shows static/dynamic shortcuts from the app
- There is no API to add custom actions to individual pinned shortcuts

The existing `ShortcutEditProxyActivity` was built anticipating a feature that doesn't exist in standard Android.

## Current State

| Component | Status |
|-----------|--------|
| `ShortcutEditProxyActivity` | Exists but never invoked |
| `getPendingEditShortcut()` plugin method | Exists but unused |
| "My Shortcuts" list with edit functionality | Already working |

## Recommended Solution

Since Android doesn't support custom actions on pinned shortcuts, we should leverage the **existing "My Shortcuts" list** as the primary edit mechanism, and optionally add a **static shortcut** for quick access.

### Option A: Rely on Existing "My Shortcuts" (No Changes)

The "My Shortcuts" feature already allows editing:
1. Open app menu
2. Tap "My Shortcuts"
3. Tap any shortcut
4. Select "Edit" from action sheet

This is the most straightforward approach and works today.

### Option B: Add Static "Edit Shortcuts" App Shortcut

Add a static shortcut that appears when long-pressing the **app icon** on the launcher. This provides quick access to the shortcuts list.

**Implementation:**

1. **Create `res/xml/shortcuts.xml`**
```xml
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
  <shortcut
    android:shortcutId="manage_shortcuts"
    android:enabled="true"
    android:icon="@drawable/ic_shortcut_edit"
    android:shortcutShortLabel="@string/shortcut_manage_label"
    android:shortcutLongLabel="@string/shortcut_manage_long_label">
    <intent
      android:action="android.intent.action.VIEW"
      android:targetPackage="app.onetap.shortcuts"
      android:targetClass="app.onetap.shortcuts.MainActivity"
      android:data="onetap://manage-shortcuts" />
  </shortcut>
</shortcuts>
```

2. **Update `AndroidManifest.xml`** - Add meta-data to MainActivity:
```xml
<meta-data android:name="android.app.shortcuts"
           android:resource="@xml/shortcuts" />
```

3. **Handle Deep Link in App** - Open "My Shortcuts" sheet when app receives `onetap://manage-shortcuts`

4. **Add icon drawable** - Create `ic_shortcut_edit.xml` vector drawable

### Option C: Remove Unused Edit Proxy Code

Since the `ShortcutEditProxyActivity` cannot be triggered by Android, consider removing it to clean up the codebase:
- Delete `ShortcutEditProxyActivity.java`
- Remove from `AndroidManifest.xml`
- Remove related plugin methods

## Recommendation

**Proceed with Option B** - Adding a static "Manage Shortcuts" app shortcut provides a discoverable entry point for users who want to edit their shortcuts, while working within Android's constraints.

## Files to Modify

| File | Change |
|------|--------|
| `native/android/app/src/main/res/xml/shortcuts.xml` | Create new file with static shortcut |
| `native/android/app/src/main/res/drawable/ic_shortcut_edit.xml` | Create edit icon drawable |
| `native/android/app/src/main/res/values/strings.xml` | Add shortcut labels |
| `native/android/app/src/main/AndroidManifest.xml` | Add shortcuts meta-data |
| `src/App.tsx` or deep link handler | Handle `onetap://manage-shortcuts` deep link |

## User Experience After Implementation

1. User long-presses **app icon** on launcher
2. Menu appears with "Manage Shortcuts" option
3. User taps it
4. App opens directly to "My Shortcuts" list
5. User can tap any shortcut to edit it

This is the proper Android-native way to provide quick access to shortcut management.

