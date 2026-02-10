

# Extend Android Share Sheet to Accept Files (Single + Multi)

## Overview

Add `ACTION_SEND_MULTIPLE` support to the Android Share Sheet and implement routing rules so that shared files integrate seamlessly with existing creation flows -- no new UI concepts, no new data models.

## Current State

- **Native side**: `getSharedContent()` only handles `ACTION_SEND` (single item). No `ACTION_SEND_MULTIPLE` handling exists.
- **TS side**: `useSharedContent` processes single URLs and single files. Single files route to AccessFlow. Videos auto-play natively.
- **Index.tsx**: Consumes `sharedContent` from the hook. URLs show the SharedUrlActionSheet. Files switch to Access tab.
- **AccessFlow**: Accepts files via `ContentSource` (single) or `MultiFileSource` (slideshow). All creation flows (image, video, PDF, document, contact) already exist.
- **Manifest**: Already declares intent filters for `ACTION_SEND` with `text/*`, `image/*`, `video/*`, `application/*`. No `ACTION_SEND_MULTIPLE` filters exist.

## Changes Required

### 1. AndroidManifest.xml -- Add `ACTION_SEND_MULTIPLE` Intent Filters

Add two new intent filters to `MainActivity` for multi-file sharing:

```text
<!-- Share Sheet: Handle multiple shared images (slideshow) -->
<intent-filter>
    <action android:name="android.intent.action.SEND_MULTIPLE" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="image/*" />
</intent-filter>

<!-- Share Sheet: Handle multiple shared files (for rejection routing) -->
<intent-filter>
    <action android:name="android.intent.action.SEND_MULTIPLE" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="*/*" />
</intent-filter>
```

### 2. ShortcutPlugin.java -- Extend `getSharedContent()` for `ACTION_SEND_MULTIPLE`

Add a new branch in `getSharedContent()` to handle `ACTION_SEND_MULTIPLE`:

- Extract `EXTRA_STREAM` as `ArrayList<Uri>`
- Resolve each URI's MIME type via `ContentResolver.getType()`
- Classify: all images vs all non-images vs mixed
- Return a new JSON shape with:
  - `"action": "android.intent.action.SEND_MULTIPLE"`
  - `"multipleFiles": true`
  - `"fileCount": N`
  - `"allImages": boolean`
  - `"mixed": boolean`
  - `"files": [{ "uri": "...", "mimeType": "...", "name": "..." }, ...]` (only when `allImages` is true)
- When NOT all-images, still return the classification flags but omit the `files` array (the TS side will reject and toast)

Also, for each image URI, take a persistable read permission so the URIs survive across activity restarts.

### 3. ShortcutPlugin.ts -- Extend `getSharedContent` Return Type

Update the TypeScript interface to include new optional fields:

```typescript
getSharedContent(): Promise<{
  action?: string;
  type?: string;
  data?: string;
  text?: string;
  shortcutId?: string;
  resume?: boolean | string;
  // Multi-file share fields (ACTION_SEND_MULTIPLE)
  multipleFiles?: boolean;
  fileCount?: number;
  allImages?: boolean;
  mixed?: boolean;
  files?: Array<{ uri: string; mimeType?: string; name?: string }>;
} | null>;
```

### 4. useSharedContent.ts -- Handle Multi-File Shares

Add routing logic after the existing single-file handling:

```text
if (shared.multipleFiles) {
  if (shared.allImages && shared.files?.length > 1) {
    // Case B: Multiple images -> slideshow
    setSharedContent as MultiFileSource-shaped data
  } else if (shared.mixed) {
    // Case D: Mixed types -> toast + exit
    toast("Please share only one file type at a time.")
    clearSharedContent
  } else {
    // Case C: Multiple non-image files -> toast + exit
    toast("Multiple non-image files are not supported.")
    clearSharedContent
  }
  return;
}
```

Introduce a new state field: `sharedMultiFiles: MultiFileSource | null` alongside existing `sharedContent`.

### 5. Index.tsx -- Route Multi-File Shares to Slideshow

Add a new `useEffect` (or extend the existing shared content effect) to handle `sharedMultiFiles`:

- When `sharedMultiFiles` is set and has images:
  - Switch to Access tab
  - Pass the multi-file source directly into `AccessFlow` as a new prop `initialSlideshowSource`
  - Clear the shared state

### 6. AccessFlow.tsx -- Accept Initial Slideshow Source from Share

Add an `initialSlideshowSource?: MultiFileSource | null` prop:

- When set, skip the source picker and jump directly to the `slideshow-customize` step
- Set `slideshowSource` state from the prop
- Call `onInitialSlideshowConsumed?.()` callback to clear the prop in Index

### 7. Single-File Routing Improvement (Current Gap)

Currently, single shared files just switch to Access tab without pre-routing to the correct flow. Improve this:

- When `sharedContent.type === 'file'`, detect the MIME type
- Set it as `contentSource` in AccessFlow and jump directly to the `customize` step
- This requires passing a new prop `initialFileSource?: ContentSource | null` to AccessFlow (or reusing the existing pattern from `initialUrlForShortcut`)

This ensures a shared single PDF goes straight to PDF customization, a shared image goes straight to image customization, etc. -- zero extra taps.

### 8. Translation Keys

No new translation keys are needed. Toast messages will use hardcoded English strings consistent with the existing rejection pattern (the app already uses untranslated toasts in error paths).

### 9. Documentation

No documentation files currently describe Share Sheet behavior in detail. No updates required per the spec.

## File Change Summary

| File | Change |
|------|--------|
| `native/android/app/src/main/AndroidManifest.xml` | Add `ACTION_SEND_MULTIPLE` intent filters |
| `native/.../plugins/ShortcutPlugin.java` | Extend `getSharedContent()` for multi-file intents |
| `src/plugins/ShortcutPlugin.ts` | Extend return type with multi-file fields |
| `src/hooks/useSharedContent.ts` | Add multi-file routing logic, new `sharedMultiFiles` state |
| `src/pages/Index.tsx` | Consume `sharedMultiFiles`, pass `initialSlideshowSource` and `initialFileSource` to AccessFlow |
| `src/components/AccessFlow.tsx` | Accept `initialSlideshowSource` and `initialFileSource` props, auto-navigate to correct step |

## Routing Summary

```text
Share Intent
    |
    +-- ACTION_SEND (single)
    |       |
    |       +-- URL text  --> SharedUrlActionSheet (existing)
    |       +-- File URI  --> Detect MIME -> Jump to customize step (improved)
    |
    +-- ACTION_SEND_MULTIPLE
            |
            +-- All images (2+)           --> Slideshow customize step
            +-- All non-images            --> Toast: "Multiple non-image files are not supported." -> Exit
            +-- Mixed types               --> Toast: "Please share only one file type at a time." -> Exit
```

## Edge Cases

- **Single image via SEND_MULTIPLE**: Treated as single file, routes to image customize (not slideshow)
- **20+ images**: Capped by existing `MAX_SLIDESHOW_IMAGES` constant (20) in the slideshow flow
- **Permission persistence**: `takePersistableUriPermission` called for each image URI to survive cold starts
- **App already open (onNewIntent)**: Existing resume listener in `useSharedContent` already rechecks via `appStateChange` -- multi-file path will work identically

