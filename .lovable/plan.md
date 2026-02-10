
# Add Catch-All Single File Share Support

## Problem

The Android manifest currently declares `ACTION_SEND` intent filters for `text/*`, `image/*`, `video/*`, and `application/*` — but is missing `audio/*` and any other MIME types (e.g., `font/*`, custom types). This means the app won't appear in the Android Share Sheet when sharing audio files or uncommon file types.

## Solution

Add a single `*/*` catch-all intent filter for `ACTION_SEND` to `AndroidManifest.xml`. This ensures OneTap appears in the Share Sheet for **every** single-file share, regardless of MIME type.

The existing specific filters (`text/*`, `image/*`, etc.) can remain for clarity, but the catch-all guarantees complete coverage.

## Change

**File: `native/android/app/src/main/AndroidManifest.xml`**

Add one new intent filter after the existing `ACTION_SEND` filters (after line 116):

```xml
<!-- Share Sheet: Handle any single shared file (catch-all) -->
<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="*/*" />
</intent-filter>
```

No other files need changes — the native Java code already handles any MIME type in `getSharedContent()`, and the TypeScript routing in `useSharedContent.ts` already processes file URIs regardless of type.
