

# Fix: WebView Overlapping System Navigation Bar

## Root Cause

**Capacitor 8 forces edge-to-edge rendering by default.** The app calls `setDecorFitsSystemWindows(true)` on line 31, but `super.onCreate()` on line 33 (Capacitor's `BridgeActivity`) overrides this and re-enables edge-to-edge. The WebView then extends behind the system navigation bar, and since `--android-safe-bottom` is set to `0px`, nothing pushes the content above it.

```text
What's happening:
Line 31: setDecorFitsSystemWindows(true)   <-- We set it
Line 33: super.onCreate(savedInstanceState) <-- Capacitor overrides it back to edge-to-edge
Result:  WebView extends behind system nav bar, bottom nav overlaps
```

## Solution

Stop fighting Capacitor's edge-to-edge behavior. Instead, read the actual system navigation bar insets using `ViewCompat.setOnApplyWindowInsetsListener` and inject the real pixel value as a CSS variable. This is the only approach that works reliably because:

- It works regardless of whether edge-to-edge is on or off
- It reads the actual inset value from the OS, not a hardcoded guess
- It works on all OEMs (Samsung, Xiaomi, Huawei, OnePlus, Pixel)
- It adapts to gesture nav (~20-24dp) vs 3-button nav (~48dp) automatically

## Changes

### File 1: `native/android/app/src/main/java/app/onetap/access/MainActivity.java`

- Add back imports for `ViewCompat` and `WindowInsetsCompat`
- Remove the `setDecorFitsSystemWindows(true)` call (let Capacitor manage this)
- Replace `setupNavBarInsetInjection()` with an inset listener that:
  1. Reads `navigationBars().bottom` inset in pixels
  2. Converts to CSS pixels using device density
  3. Injects the value as `--android-safe-bottom` (no floor, no minimum)
  4. Also injects `--android-safe-top` for the status bar area

```java
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

// In setupNavBarInsetInjection():
private void setupNavBarInsetInjection() {
    getBridge().getWebView().post(() -> {
        WebView webView = getBridge().getWebView();
        float density = getResources().getDisplayMetrics().density;

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
            int navBottom = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
            int statusTop = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top;

            // Convert hardware pixels to CSS pixels (dp)
            float bottomDp = navBottom / density;
            float topDp = statusTop / density;

            String jsBottom = "document.documentElement.style.setProperty("
                + "'--android-safe-bottom', '" + bottomDp + "px')";
            String jsTop = "document.documentElement.style.setProperty("
                + "'--android-safe-top', '" + topDp + "px')";

            webView.evaluateJavascript(jsBottom, null);
            webView.evaluateJavascript(jsTop, null);

            Log.d(TAG, "Insets injected -- bottom: " + bottomDp
                + "px, top: " + topDp + "px");

            return ViewCompat.onApplyWindowInsets(view, insets);
        });

        webView.requestApplyInsets();
    });
}
```

### File 2: `src/index.css`

- Update `.safe-bottom` fallback to `16px` (reasonable fallback before insets arrive)
- Update `.safe-top` to use `var(--android-safe-top, 0px)` instead of `env(safe-area-inset-top)` (env() is unreliable in Android WebViews)
- Update `.pt-header-safe` and `.pt-header-safe-compact` to use `--android-safe-top`
- Update `.safe-bottom-action` to include the safe bottom variable again

### No other files changed

`BottomNav.tsx` already uses the `safe-bottom` class and will automatically receive the correct padding.

## How This Works Per Navigation Type

| Navigation Type | `navBottom` (px) | Density | CSS Value | Visual Result |
|----------------|-----------------|---------|-----------|---------------|
| Gesture (swipe) | ~60px | 3.0 | ~20px | Small padding above gesture bar |
| 3-button nav | ~144px | 3.0 | ~48px | Larger padding above button bar |
| Samsung One UI gesture | ~60px | 3.0 | ~20px | Correct |
| Xiaomi MIUI 3-button | ~144px | 3.0 | ~48px | Correct |
| No nav bar | 0px | any | 0px | Flush at bottom |

## Technical Details

- **No floor/minimum**: The CSS variable gets the exact value the OS reports. No 24px floor that caused the previous double-padding issue.
- **No fighting Capacitor**: We remove `setDecorFitsSystemWindows(true)` entirely and let Capacitor 8 handle edge-to-edge as it was designed to.
- **Inset listener fires on config changes**: If the user switches between gesture and 3-button nav while the app is open, the listener re-fires and updates the CSS variable automatically.
- **Fallback timing**: The CSS fallback of `16px` ensures the bottom nav is never fully behind the system bar during the brief moment before the inset listener fires.

