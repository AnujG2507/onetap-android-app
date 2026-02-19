

# Fix: Status Bar Icons Invisible in Light Mode

## Problem

In light mode, the status bar icons (clock, battery, signal) are white/light-colored against a white/light app background, making them invisible. This happens because:

1. Capacitor 8 forces edge-to-edge rendering, making the status bar area transparent (app content shows behind it)
2. No `windowLightStatusBar` flag is set, so the system defaults to white/light status bar icons
3. White icons on a white background = invisible

## Solution

Two changes are needed:

### 1. `native/android/app/src/main/java/app/onetap/access/MainActivity.java`

Add code in `onCreate` (after `super.onCreate()`) to:
- Set the status bar background to fully transparent (ensuring no tinted overlay)
- Set `APPEARANCE_LIGHT_STATUS_BARS` flag so status bar icons render as **dark** (visible on light backgrounds)

This uses `WindowInsetsControllerCompat` which is already available via the AndroidX dependency Capacitor includes.

```java
// After super.onCreate(savedInstanceState);

// Make status bar transparent with dark icons for light mode visibility
if (getBridge() != null) {
    getWindow().setStatusBarColor(android.graphics.Color.TRANSPARENT);
    androidx.core.view.WindowInsetsControllerCompat insetsController =
        androidx.core.view.WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    if (insetsController != null) {
        insetsController.setAppearanceLightStatusBars(true);
    }
}
```

### 2. `native/android/app/src/main/res/values/styles.xml`

Add `statusBarColor` and `windowLightStatusBar` to the AppTheme as a fallback (covers the brief moment before Java code runs):

```xml
<style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
    <item name="android:statusBarColor">@android:color/transparent</item>
    <item name="android:windowLightStatusBar">true</item>
</style>
```

### 3. `index.html`

Change the `theme-color` meta tag from blue (`#2563eb`) to match the app background in light mode (`#fafafa` which is `0 0% 98%` in HSL -- the current `--background` value). This tells the Android system the intended header color:

```
Before: <meta name="theme-color" content="#2563eb" />
After:  <meta name="theme-color" content="#fafafa" />
```

## What This Achieves

- Status bar area remains transparent (app content draws behind it, as Capacitor 8 intended)
- Status bar icons (time, battery, signal) render in **dark** color, clearly visible against the light app background
- The safe-area CSS variables (`--android-safe-top`) continue to provide proper spacing so app content doesn't overlap the icons

## Files Changed

| File | Change |
|------|--------|
| `MainActivity.java` | Set transparent status bar + light status bar appearance (dark icons) |
| `styles.xml` | Add XML-level fallback for transparent status bar + light icons |
| `index.html` | Update theme-color meta tag to match light background |

