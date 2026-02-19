

# Fix: Display Actual File Names for Shared Files

## Problem

When a file is shared to the app via Android share sheet, the file name is not extracted or displayed. The dialog shows a generic "File" label, and the shortcut creation starts with no meaningful name. This contrasts with shared URLs, which correctly show the page title or platform name.

## Root Cause

Two gaps in the single-file share flow:

1. **Native layer** (`ShortcutPlugin.java`): The `ACTION_SEND` handler for single files (line 2710-2716) only extracts the URI and MIME type. It never queries `ContentResolver` for the file's display name. The multi-file `ACTION_SEND_MULTIPLE` handler already does this correctly using `OpenableColumns.DISPLAY_NAME`.

2. **JS layer** (`useSharedContent.ts`): Even if the native side provided a `name` field, the hook does not read `shared.name` when constructing the `ContentSource` for file shares. It only reads `shared.data` (URI) and `shared.type` (MIME type).

## Changes

### File 1: `native/android/app/src/main/java/app/onetap/access/plugins/ShortcutPlugin.java`

In the `getSharedContent` method, inside the `ACTION_SEND` block for non-text types (around line 2710), add a `ContentResolver` query for `OpenableColumns.DISPLAY_NAME` -- the exact same pattern already used in the `ACTION_SEND_MULTIPLE` block.

```java
// Current code (line 2710-2716):
} else {
    Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
    if (uri != null) {
        result.put("data", uri.toString());
    }
}

// Updated:
} else {
    Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
    if (uri != null) {
        result.put("data", uri.toString());

        // Query display name from ContentResolver
        try {
            Cursor cursor = getContext().getContentResolver().query(
                uri,
                new String[]{OpenableColumns.DISPLAY_NAME},
                null, null, null
            );
            if (cursor != null) {
                if (cursor.moveToFirst()) {
                    String name = cursor.getString(0);
                    if (name != null) {
                        result.put("name", name);
                    }
                }
                cursor.close();
            }
        } catch (Exception e) {
            android.util.Log.w("ShortcutPlugin",
                "Could not get display name for shared file: " + e.getMessage());
        }
    }
}
```

This requires adding the `OpenableColumns` import if not already present:
```java
import android.provider.OpenableColumns;
```

### File 2: `src/hooks/useSharedContent.ts`

In the file share branch (around line 117), pass `shared.name` into the `ContentSource`:

```typescript
// Current (line 117-121):
setSharedContent({
  type: 'file',
  uri: data,
  mimeType: shared.type,
});

// Updated:
setSharedContent({
  type: 'file',
  uri: data,
  mimeType: shared.type,
  name: shared.name || undefined,
});
```

## How It Works End-to-End

1. User shares a file (e.g., "Vacation_Photo.jpg") to the app
2. **Native** `getSharedContent` queries `DISPLAY_NAME` from the content provider and returns `{ data: "content://...", type: "image/jpeg", name: "Vacation_Photo.jpg" }`
3. **JS** `useSharedContent` passes `name: "Vacation_Photo.jpg"` into the `ContentSource`
4. `SharedFileActionSheet` displays `file.name` via `formatContentInfo` which returns `{ label: "Vacation_Photo.jpg", ... }` instead of generic "File"
5. `ShortcutCustomizer` receives the `ContentSource` with the correct name, pre-populating the shortcut name field

No changes needed to `SharedFileActionSheet`, `formatContentInfo`, or `ShortcutCustomizer` -- they already use `source.name` when available.

