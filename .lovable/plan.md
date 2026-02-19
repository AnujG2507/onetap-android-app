

# Fix: Android Navigation Bar Color in Dark Mode

## Problem

The `MainActivity.java` currently configures only the status bar (transparent + light icons). The system navigation bar (gesture bar / button area at the bottom) has no explicit configuration, so in dark mode the navigation bar icons/gesture indicator may not have proper contrast against the dark background.

## Changes

### `native/android/app/src/main/java/app/onetap/access/MainActivity.java`

In `onCreate`, after the existing status bar configuration block, add navigation bar handling:

1. Set the navigation bar color to transparent (matching the status bar approach), so the app's `bg-background` shows through seamlessly.
2. Set `setAppearanceLightNavigationBars()` based on the system's current dark mode setting -- dark icons for light mode, light icons for dark mode.
3. Also update `setAppearanceLightStatusBars()` to be theme-aware (currently hardcoded to `true`, which is wrong for dark mode).

```java
// After existing insetsController block:
int nightMode = getResources().getConfiguration().uiMode
    & android.content.res.Configuration.UI_MODE_NIGHT_MASK;
boolean isLightMode = nightMode != android.content.res.Configuration.UI_MODE_NIGHT_YES;

if (insetsController != null) {
    insetsController.setAppearanceLightStatusBars(isLightMode);
    insetsController.setAppearanceLightNavigationBars(isLightMode);
}
getWindow().setNavigationBarColor(android.graphics.Color.TRANSPARENT);
```

This ensures:
- **Light mode**: Dark status bar icons + dark navigation bar icons (visible against light background)
- **Dark mode**: Light status bar icons + light navigation bar icons (visible against dark background)
- Both bars are transparent, letting the app background color show through

No CSS changes needed -- the `bg-background` on the BottomNav and the existing safe-bottom padding already handle the visual area correctly.

