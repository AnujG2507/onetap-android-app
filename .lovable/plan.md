
## Root Cause Analysis: "Add to Home Screen" Fails on Some Devices

This is a multi-root-cause failure. Six distinct bugs are identified, each affecting a different class of device or scenario. They are ordered from most impactful to least impactful.

---

### How the Pinning Flow Works (Reference)

```text
User taps "Add to Home Screen" in ShortcutCustomizer
  → handleConfirm() → createHomeScreenShortcut() [JS]
    → ShortcutPlugin.createPinnedShortcut() [JS → Native bridge]
      → Background thread: file I/O, icon creation
        → Main thread: shortcutManager.requestPinShortcut(info, null)
          → Android shows native pin dialog (drag-to-screen or "Add")
            → User taps "Add" → OS auto-places on home screen
              → If requested==true: registerShortcutCreation() + addDynamicShortcuts()
                → JS receives { success: true }
```

The failure occurs at step `requestPinShortcut` returning `false` silently, at the icon creation step crashing quietly, or at a PendingIntent issue specific to certain launchers.

---

### Bug 1 — CRITICAL: `requestPinShortcut` Called with `null` PendingIntent (All Launchers)

**Location:** `ShortcutPlugin.java` line 329 (text shortcuts) and line 547 (all other types)

**The call:**
```java
boolean requested = shortcutManager.requestPinShortcut(finalShortcutInfo, null);
```

**What Android does with `null`:**
The second parameter of `requestPinShortcut(ShortcutInfo, IntentSender)` is the callback `IntentSender`. When it is `null`, the OS shows the dialog but **does NOT call back into the app** after the user taps "Add". This is fine for dialog display. However, on some OEM launchers (Samsung One UI 5+, Huawei EMUI, Xiaomi MIUI, Realme UI, ColorOS), `null` here causes the launcher to silently reject the pin request entirely — `requestPinShortcut` returns `false` immediately without ever showing the dialog. These launchers expect a valid `PendingIntent` as a signal that the app is genuinely requesting the pin (anti-abuse heuristic).

**Fix:** Provide a no-op `PendingIntent` callback so the launcher receives a valid callback target:

```java
// Create a no-op broadcast PendingIntent as the callback
PendingIntent successCallback = null;
try {
    Intent callbackIntent = new Intent("app.onetap.SHORTCUT_PINNED");
    callbackIntent.setPackage(context.getPackageName());
    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        flags |= PendingIntent.FLAG_IMMUTABLE;
    }
    successCallback = PendingIntent.getBroadcast(context, 0, callbackIntent, flags);
} catch (Exception e) {
    android.util.Log.w("ShortcutPlugin", "Could not create callback PendingIntent: " + e.getMessage());
}

boolean requested = shortcutManager.requestPinShortcut(
    finalShortcutInfo, 
    successCallback != null ? successCallback.getIntentSender() : null
);
```

This needs to be applied in **two places**: the text-shortcut fast path (line 329) and the general background-thread path (line 547).

---

### Bug 2 — CRITICAL: Icon Too Large Causes Silent OOM / Crash Before `requestPinShortcut` is Reached

**Location:** `createBitmapIcon()`, `createFaviconIcon()`, `createPlatformIcon()`

All icon-creating methods produce a **216×216px bitmap** using `Icon.createWithAdaptiveBitmap()`. This is correct and compliant with Android's spec. However, when the **input thumbnail is very large** (e.g., the JS layer sends a full-resolution base64 image instead of a properly-sized 256px thumbnail), `BitmapFactory.decodeByteArray` decodes the full image into memory first before scaling it down. On low-memory devices (2–3 GB RAM), this decode step causes an `OutOfMemoryError` in the background thread, which is caught by the outer `catch (Exception e)` at line 586 and silently returns `{ success: false }` to JS. The user sees no dialog at all.

**Evidence in code:** `createBitmapIcon` (line 2520) decodes the full base64 to bitmap first, THEN scales:
```java
byte[] decoded = Base64.decode(base64Data, Base64.DEFAULT);
Bitmap bitmap = BitmapFactory.decodeByteArray(decoded, 0, decoded.length);
// ← OOM can happen here if base64Data is large
Bitmap scaled = Bitmap.createScaledBitmap(bitmap, contentSize, contentSize, true);
```

**Fix:** Use `BitmapFactory.Options.inSampleSize` to subsample the bitmap during decode, the same approach already used correctly in `generateImageThumbnailBase64()`:

```java
private Icon createBitmapIcon(String base64Data) {
    try {
        byte[] decoded = Base64.decode(base64Data, Base64.DEFAULT);
        
        // First pass: measure dimensions without allocating
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(decoded, 0, decoded.length, opts);
        
        // Calculate sample size to bring it close to 256px before decode
        int sampleSize = 1;
        while (opts.outWidth / sampleSize > 512 || opts.outHeight / sampleSize > 512) {
            sampleSize *= 2;
        }
        
        // Second pass: decode with subsampling
        opts = new BitmapFactory.Options();
        opts.inSampleSize = sampleSize;
        Bitmap bitmap = BitmapFactory.decodeByteArray(decoded, 0, decoded.length, opts);
        // ... rest unchanged
    }
}
```

---

### Bug 3 — HIGH: `FLAG_ACTIVITY_NEW_TASK` on Shortcut Intents Causes "Blocked" Behavior on Some Launchers

**Location:** Every intent built in `createPinnedShortcut` (lines 432, 446, 459, 471, 482, 493, 504, 513, 527)

All proxy-activity intents include `intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)`. This flag is **required when starting an Activity from a non-Activity context** (e.g., a BroadcastReceiver or Service). However, for shortcut intents embedded in `ShortcutInfo`, the OS itself manages the launch context. On some launchers (particularly Pixel Launcher on Android 14, and some Xiaomi variants), having `FLAG_ACTIVITY_NEW_TASK` combined with certain `launchMode` settings on the target activity causes the intent to be rerouted incorrectly or blocked.

The specific failure mode: the shortcut icon appears on the home screen (pinning succeeded) but tapping it launches **MainActivity** instead of the proxy activity — or worse, nothing launches at all.

**Fix:** Remove `FLAG_ACTIVITY_NEW_TASK` from shortcut intents where the target activity is a proxy (not `MainActivity`). The OS will supply the correct launch flags when the shortcut is tapped from the home screen:

```java
// For pinned shortcuts, do NOT add FLAG_ACTIVITY_NEW_TASK
// The OS controls launch flags for shortcuts
// intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);  // ← REMOVE from shortcut intents
```

Keep `FLAG_ACTIVITY_NEW_TASK` only on the `openTextShortcut` plugin method (line in the added openTextShortcut method), where the intent is being started directly from the Capacitor plugin context (non-Activity context).

---

### Bug 4 — HIGH: `isRequestPinShortcutSupported()` Returns `false` on Custom Launchers (Nova, Action, Microsoft Launcher, etc.)

**Location:** `createPinnedShortcut()` lines 230–237

```java
if (!shortcutManager.isRequestPinShortcutSupported()) {
    JSObject result = new JSObject();
    result.put("success", false);
    result.put("error", "Launcher does not support pinned shortcuts");
    call.resolve(result);
    return;
}
```

**Problem:** Third-party launchers like Nova Launcher, Action Launcher, and Microsoft Launcher support pinned shortcuts via the `com.android.launcher.permission.INSTALL_SHORTCUT` broadcast (the legacy API). However, `isRequestPinShortcutSupported()` only checks the `ShortcutManager` API (Android 8+), which requires the launcher to explicitly implement `ACTION_CREATE_SHORTCUT` handling. If the user's default launcher doesn't implement this but DOES support the legacy broadcast, the entire flow is blocked at the guard and returns `false` without attempting any fallback.

**Fix:** When `isRequestPinShortcutSupported()` returns `false`, fall back to the legacy `ACTION_INSTALL_SHORTCUT` broadcast for launchers that declare the `INSTALL_SHORTCUT` permission:

```java
if (!shortcutManager.isRequestPinShortcutSupported()) {
    // Fallback: legacy shortcut broadcast (supported by Nova, Action, etc.)
    boolean legacyFallbackAttempted = tryLegacyShortcutInstall(context, finalShortcutInfo);
    JSObject result = new JSObject();
    result.put("success", legacyFallbackAttempted);
    result.put("error", legacyFallbackAttempted ? null : "Launcher does not support pinned shortcuts");
    call.resolve(result);
    return;
}
```

The legacy method broadcasts an `Intent("com.android.launcher.action.INSTALL_SHORTCUT")` with the shortcut info serialized. The `com.android.launcher.permission.INSTALL_SHORTCUT` permission is already declared in `AndroidManifest.xml` (line 17).

---

### Bug 5 — MEDIUM: Icon Creation Blocks the Background Thread for Favicon Fetches, Causing Timeout

**Location:** `createFaviconIcon()` lines 1924–1971

The favicon fetch is a **synchronous network call** on a background thread:
```java
java.net.HttpURLConnection connection = (java.net.HttpURLConnection) url.openConnection();
connection.setConnectTimeout(5000);
connection.setReadTimeout(5000);
```

The icon creation is called inside the background thread at line 533. If the favicon URL is unreachable (corporate proxy, captive portal, DNS failure), the call blocks for 5 seconds before falling through to the emoji fallback. On some devices this is enough to cause a `TransactionTooLargeException` or an ANR-adjacent timeout in the Binder call to `ShortcutManager`, causing `requestPinShortcut` to throw an exception. The outer catch at line 578 returns `{ success: false }`.

**Fix:** Reduce timeouts and add a quick reachability pre-check:
```java
connection.setConnectTimeout(2000); // was 5000
connection.setReadTimeout(2000);    // was 5000
```

---

### Bug 6 — MEDIUM: Icon Bitmap Too Large for Binder Transaction (Samsung Devices with High-DPI)

**Location:** `createBitmapIcon()`, `createFaviconIcon()`, `createPlatformIcon()`

All methods return `Icon.createWithAdaptiveBitmap(bitmap)` where `bitmap` is 216×216px ARGB_8888. This is `216 * 216 * 4 = 186,624 bytes` (~186 KB). This is well within the 1MB Binder transaction limit for most devices.

**However**, if `createBitmapIcon` receives an oversized base64 and OOM does NOT occur (device has enough RAM), the resulting `scaledBitmap` may still be wrong if `createScaledBitmap` returns the original when no scaling is needed (when input is already 144px). The issue: `scaled.recycle()` at line 2549 recycles the same object as `bitmap` in the edge case where `scaled == bitmap` (Android documentation states `createScaledBitmap` returns the same object when dimensions match). The code has a null-check but uses `if (scaled != bitmap)` only for the original; it then calls `scaled.recycle()` unconditionally, which would recycle the very bitmap the `Icon` object references internally.

**Fix:** 
```java
if (scaled != bitmap) {
    bitmap.recycle();
    // ← Don't recycle 'scaled' — the Icon holds a reference to it
}
// Remove: scaled.recycle();
```

---

### Summary of All Files to Change

| File | Bug Fixed | Change |
|---|---|---|
| `ShortcutPlugin.java` (text fast path, line ~329) | Bug 1 | Add `PendingIntent` callback to `requestPinShortcut` |
| `ShortcutPlugin.java` (main path, line ~547) | Bug 1 | Add `PendingIntent` callback to `requestPinShortcut` |
| `ShortcutPlugin.java` — `createBitmapIcon()` | Bug 2, 6 | Add `inJustDecodeBounds` pre-pass + `inSampleSize`; fix `scaled.recycle()` |
| `ShortcutPlugin.java` — `isRequestPinShortcutSupported` guard | Bug 4 | Add legacy `INSTALL_SHORTCUT` broadcast fallback |
| `ShortcutPlugin.java` — every intent in `createPinnedShortcut` | Bug 3 | Remove `FLAG_ACTIVITY_NEW_TASK` from shortcut intents (keep only on plugin-started intents) |
| `ShortcutPlugin.java` — `createFaviconIcon()` | Bug 5 | Reduce timeouts from 5000ms to 2000ms |

No JS, TypeScript, manifest, or Gradle changes are needed. All six bugs are purely in the native Java plugin.

### Priority Implementation Order

1. **Bug 1** (PendingIntent) — broadest impact, fixes the "no dialog appears" failure on Samsung/Xiaomi/OPPO
2. **Bug 2** (OOM in icon decode) — fixes silent failures on low-RAM devices for any shortcut type
3. **Bug 4** (legacy launcher fallback) — fixes Nova/Action/Microsoft Launcher users seeing `success: false`
4. **Bug 3** (FLAG_ACTIVITY_NEW_TASK on shortcut intents) — fixes tap-after-pin failures on Pixel Android 14+
5. **Bug 6** (scaled.recycle() crash) — fixes intermittent crash on same-size thumbnails
6. **Bug 5** (favicon timeout) — reduces failure window for network-unreachable favicon scenarios
