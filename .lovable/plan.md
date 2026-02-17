

# Fix Bottom Button Overlap with Android Navigation Bar

## Problem
The "Add to Home Screen" button (and similar bottom-fixed buttons) gets partially hidden behind Android's 3-button navigation bar. The current `safe-bottom-action` CSS class relies on `env(safe-area-inset-bottom)`, which returns 0 on many Android WebViews due to a known Chromium bug. Using a fixed padding would break gesture-navigation devices where there are no buttons.

## Root Cause
Capacitor 7+ / Android 15+ enforces edge-to-edge layout, meaning the WebView draws behind system bars. The CSS `env(safe-area-inset-bottom)` is supposed to report the nav bar height but is unreliable across Android WebView versions and OEM implementations.

## Solution: Native Inset Detection + CSS Variable Injection

Detect the actual navigation bar height natively in `MainActivity.java` using Android's `WindowInsets` API, then inject it into the WebView as a CSS custom property (`--android-nav-height`). This value is automatically correct for both navigation modes:
- **3-button nav**: ~48dp (enough to clear the buttons)
- **Gesture nav**: 0dp or very small (no wasted space)

### Changes

#### 1. `MainActivity.java` -- Detect nav bar height and inject CSS variable

After the WebView loads, use `ViewCompat.setOnApplyWindowInsetsListener` on the WebView to read the navigation bar bottom inset. Convert to CSS pixels and inject a CSS variable via `evaluateJavascript`:

```text
ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
    int navBarHeight = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
    float cssPx = navBarHeight / density;
    webView.evaluateJavascript(
        "document.documentElement.style.setProperty('--android-nav-height', '" + cssPx + "px')", null
    );
    return insets;
});
```

This runs once on layout and again whenever the insets change (e.g., rotation, nav mode switch).

#### 2. `src/index.css` -- Update `safe-bottom-action` to use the native variable

Replace the unreliable `env()` with the natively-injected variable, keeping a sensible fallback:

```css
.safe-bottom-action {
    padding-bottom: max(
        var(--android-nav-height, 0px),
        env(safe-area-inset-bottom, 0px),
        16px
    );
}
```

This picks the largest of: native nav height, CSS safe area (works on iOS/web), or 16px minimum floor.

#### 3. `src/index.css` -- Update `safe-bottom` similarly

```css
.safe-bottom {
    padding-bottom: max(
        var(--android-nav-height, 0px),
        env(safe-area-inset-bottom, 0px)
    );
}
```

### Why This Works for Both Nav Modes

- Android's `WindowInsets` API reports the **actual** navigation bar height
- For 3-button navigation: returns ~48dp, ensuring the button is fully visible
- For gesture navigation: returns 0dp (or a tiny gesture hint bar), so no extra space is wasted
- For web preview / iOS: the CSS variable won't be set, so `env()` or the 16px floor takes over

### Files Modified
1. `native/android/app/src/main/java/app/onetap/access/MainActivity.java` -- Add WindowInsets listener
2. `src/index.css` -- Update `safe-bottom-action` and `safe-bottom` classes

### What Does NOT Change
- No changes to any component files (ShortcutCustomizer, ContactShortcutCustomizer, etc.)
- No changes to layout structure or existing safe-area logic on iOS
- No new dependencies

