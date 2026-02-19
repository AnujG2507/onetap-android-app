

# Fix: CSS Inset Variables Lost After App Resume

## Root Cause

The `setupNavBarInsetInjection()` method in `MainActivity.java` sets up a `ViewCompat.setOnApplyWindowInsetsListener` and calls `requestApplyInsets()` once during `onCreate`. This works on first launch because:

1. `onCreate` runs
2. The listener is registered
3. `requestApplyInsets()` triggers the listener
4. CSS variables are injected into the DOM

On subsequent app opens (resume from background, or WebView reload after memory pressure):

- `onCreate` is NOT called (only `onResume`)
- The listener exists but doesn't re-fire (insets haven't changed)
- The WebView may have reloaded its page, wiping the CSS variables
- Result: `--android-safe-top` and `--android-safe-bottom` are both `0px` (the CSS fallback defaults)

## Solution

Two changes to `MainActivity.java`:

1. **Store the last known inset values** as instance fields so they can be re-injected at any time
2. **Override `onResume()`** to re-inject the stored values into the WebView every time the app comes to the foreground

This covers all scenarios:
- First launch: listener fires, values stored and injected
- Resume from background: `onResume` re-injects stored values
- WebView reload (memory pressure): `onResume` re-injects after the page reloads
- Configuration change: listener fires again with new values

## Changes

### File: `native/android/app/src/main/java/app/onetap/access/MainActivity.java`

**Add instance fields** to store last known inset values (after the existing `pendingSlideshowId` field):

```java
// Last known inset values (in dp) for re-injection on resume
private float lastSafeTop = 0f;
private float lastSafeBottom = 0f;
```

**Update `setupNavBarInsetInjection()`** to store values when the listener fires:

```java
private void setupNavBarInsetInjection() {
    getBridge().getWebView().post(() -> {
        WebView webView = getBridge().getWebView();
        float density = getResources().getDisplayMetrics().density;

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
            int navBottom = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
            int statusTop = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top;

            lastSafeBottom = navBottom / density;
            lastSafeTop = statusTop / density;

            injectInsetsIntoWebView(webView);

            return ViewCompat.onApplyWindowInsets(view, insets);
        });

        webView.requestApplyInsets();
    });
}
```

**Add a helper method** to inject the stored values:

```java
private void injectInsetsIntoWebView(WebView webView) {
    String js = "document.documentElement.style.setProperty('--android-safe-bottom', '"
        + lastSafeBottom + "px');"
        + "document.documentElement.style.setProperty('--android-safe-top', '"
        + lastSafeTop + "px');";

    webView.evaluateJavascript(js, null);
    Log.d(TAG, "Insets injected -- bottom: " + lastSafeBottom + "px, top: " + lastSafeTop + "px");
}
```

**Add `onResume()` override** to re-inject on every foreground transition:

```java
@Override
protected void onResume() {
    super.onResume();
    Log.d(TAG, "onResume called");
    CrashLogger.getInstance().addBreadcrumb(CrashLogger.CAT_LIFECYCLE, "MainActivity.onResume");

    // Re-inject insets into WebView on every resume
    // The DOM may have been reset if WebView was unloaded due to memory pressure
    if (getBridge() != null && getBridge().getWebView() != null) {
        getBridge().getWebView().post(() -> {
            injectInsetsIntoWebView(getBridge().getWebView());
            // Also request fresh insets in case they changed (e.g. navigation mode switch)
            getBridge().getWebView().requestApplyInsets();
        });
    }
}
```

## Why This Works Across All OEMs

- The inset values come from the OS via `ViewCompat` (AndroidX) -- this is OEM-agnostic
- Storing values as instance fields means they survive as long as the Activity is alive
- `onResume()` is called on every foreground transition on every Android device
- `requestApplyInsets()` in `onResume` also handles the edge case where the user changed navigation mode (gesture vs 3-button) while the app was in the background
- No new dependencies or permissions required

## No Web/CSS Changes Needed

The CSS variable definitions and utility classes (`--app-available-height`, `.min-h-app-viewport`, etc.) are already correct. The issue is purely that the native side stops injecting the values after the first launch.
