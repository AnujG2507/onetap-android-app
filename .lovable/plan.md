

## Fix Preview Content Button — PDF Opens App Selector, Video Does Nothing

### Root Causes Found

**1. Video — Missing `@PluginMethod` annotation (line 1053)**

The `openNativeVideoPlayer` method in `ShortcutPlugin.java` is missing the `@PluginMethod` annotation. Capacitor requires this annotation to expose Java methods to the JavaScript bridge. Without it, the call silently fails — no error, no action.

**2. PDF — No route to native PDF viewer**

The current code calls `ShortcutPlugin.openWithExternalApp()` for PDFs, which uses `Intent.createChooser()` — this always shows the system app selector. There is no method to directly open the built-in `NativePdfViewerV2Activity` for preview purposes.

### Fix Plan

**File 1: `native/android/app/src/main/java/app/onetap/access/plugins/ShortcutPlugin.java`**

- Add `@PluginMethod` annotation before `openNativeVideoPlayer` (line 1052)
- Add a new `openNativePdfViewer` method that launches `NativePdfViewerV2Activity` directly (similar pattern to `openNativeVideoPlayer` — parse URI, set ACTION_VIEW, grant URI permission, start activity)

**File 2: `src/plugins/ShortcutPlugin.ts`**

- Add `openNativePdfViewer` to the `ShortcutPluginInterface` type definition

**File 3: `src/plugins/shortcutPluginWeb.ts`**

- Add web fallback for `openNativePdfViewer` (open in new tab)

**File 4: `src/components/ShortcutCustomizer.tsx`**

- Update `handlePreviewContent` to call `ShortcutPlugin.openNativePdfViewer()` for PDF files instead of `openWithExternalApp()`

### Technical Detail

```text
Before (line 1052-1053 of ShortcutPlugin.java):

    public void openNativeVideoPlayer(PluginCall call) {

After:

    @PluginMethod
    public void openNativeVideoPlayer(PluginCall call) {
```

The new `openNativePdfViewer` method will follow the same pattern as `openNativeVideoPlayer` but target `NativePdfViewerV2Activity` instead.

The preview routing in `handlePreviewContent` will become:

```text
Content Type    Action
URL/share       openInAppBrowser (unchanged)
PDF (native)    ShortcutPlugin.openNativePdfViewer (NEW)
Video (native)  ShortcutPlugin.openNativeVideoPlayer (now works with annotation fix)
Other (native)  ShortcutPlugin.openWithExternalApp (unchanged)
Web fallback    window.open (unchanged)
```

