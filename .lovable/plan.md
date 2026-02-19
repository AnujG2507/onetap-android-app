

# Fix: CSS Inset Variables Lost Due to Page Load Race Condition

## Root Cause

The native `setupNavBarInsetInjection()` runs during `onCreate` and injects CSS variables via `evaluateJavascript`. However, Capacitor loads the web page asynchronously. On subsequent cold starts (app killed then relaunched), the app initializes faster, and the inset injection fires **before** the page has finished loading. When the page finishes loading, it resets the DOM and the injected inline styles are lost.

Timeline on first install:
```text
onCreate -> WebView created -> (slow init) -> page loads -> insets inject -> works!
```

Timeline on subsequent launches:
```text
onCreate -> WebView created -> insets inject -> page loads (wipes styles) -> broken!
```

The `onResume` re-injection doesn't help here because `onResume` is called right after `onCreate` during a cold start — still before the page finishes loading.

## Solution: Two-Part Fix

### Part 1: CSS `env()` Defaults (Immediate, No JS Needed)

The `index.html` already has `viewport-fit=cover`, which makes `env(safe-area-inset-*)` available in CSS. We set the `--android-safe-*` variables to use these `env()` values as their **initial defaults**. This means the correct inset values are available the instant the CSS is parsed — no native injection needed.

When the native code eventually fires `style.setProperty(...)`, it overrides the `env()` defaults with OS-reported pixel values (which are typically identical but guaranteed accurate).

### Part 2: Delayed Re-injection in Native Code

Add a delayed re-injection (500ms) in `onResume` to catch any edge case where the page loads after the initial injection. This ensures the native values always win once the page is ready.

## Changes

### File 1: `src/index.css`

Add `--android-safe-top` and `--android-safe-bottom` variable declarations with `env()` defaults in the `:root` block. These provide correct values immediately on page load without waiting for native JS injection.

```css
:root {
    /* ... existing variables ... */

    /* Safe area insets - env() provides immediate values from viewport-fit=cover,
       native Java code overrides these with OS-reported values when ready */
    --android-safe-top: env(safe-area-inset-top, 0px);
    --android-safe-bottom: env(safe-area-inset-bottom, 0px);

    /* Available viewport height between system bars */
    --app-available-height: calc(100vh - var(--android-safe-top, 0px) - var(--android-safe-bottom, 0px));
}
```

### File 2: `native/android/app/src/main/java/app/onetap/access/MainActivity.java`

Update `onResume()` to add a delayed re-injection (500ms) to handle cases where the page finishes loading after the initial injection:

```java
@Override
public void onResume() {
    super.onResume();
    Log.d(TAG, "onResume called");
    CrashLogger.getInstance().addBreadcrumb(CrashLogger.CAT_LIFECYCLE, "MainActivity.onResume");

    if (getBridge() != null && getBridge().getWebView() != null) {
        WebView wv = getBridge().getWebView();
        // Immediate injection
        wv.post(() -> {
            injectInsetsIntoWebView(wv);
            wv.requestApplyInsets();
        });
        // Delayed injection to catch page-load race condition
        wv.postDelayed(() -> {
            injectInsetsIntoWebView(wv);
        }, 500);
    }
}
```

## Why This Fully Solves the Problem

1. **CSS `env()` defaults**: Correct values are available the instant the page loads -- zero race condition, zero dependency on native timing.
2. **Immediate native injection**: Overrides with OS-accurate values when the bridge is ready.
3. **Delayed native injection**: Catches any edge case where the page loads after the immediate injection.
4. **`onApplyWindowInsetsListener`**: Still fires on configuration changes (rotation, nav mode switch).

Every possible timing scenario is now covered. No new dependencies or permissions required.

