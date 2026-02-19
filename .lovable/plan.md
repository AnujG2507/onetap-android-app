

# Fix: Status Bar Icons Not Matching App Theme

## Problem

The status bar and navigation bar icon colors are based on the **system** dark mode setting, not the **app's** chosen theme. When they differ (e.g., system is dark but app is light), the icons become invisible against the background.

The app already syncs its resolved theme to native SharedPreferences via `ShortcutPlugin.syncTheme()`, but `MainActivity` never reads it -- it only checks `UI_MODE_NIGHT_MASK`.

## Changes

### 1. `native/android/app/src/main/java/app/onetap/access/MainActivity.java`

**In `onResume()`** -- add logic to read the resolved theme from SharedPreferences and update system bar icon colors accordingly:

```java
// Read app's resolved theme (synced from JS via ShortcutPlugin.syncTheme)
SharedPreferences prefs = getSharedPreferences("app_settings", Context.MODE_PRIVATE);
String resolvedTheme = prefs.getString("resolvedTheme", null);

boolean isLightMode;
if (resolvedTheme != null) {
    isLightMode = "light".equals(resolvedTheme);
} else {
    // Fallback to system theme if app hasn't synced yet
    int nightMode = getResources().getConfiguration().uiMode
        & android.content.res.Configuration.UI_MODE_NIGHT_MASK;
    isLightMode = nightMode != android.content.res.Configuration.UI_MODE_NIGHT_YES;
}

WindowInsetsControllerCompat insetsController =
    WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
if (insetsController != null) {
    insetsController.setAppearanceLightStatusBars(isLightMode);
    insetsController.setAppearanceLightNavigationBars(isLightMode);
}
```

This runs every time the app resumes, so it picks up theme changes made in settings.

### 2. `native/android/app/src/main/java/app/onetap/access/plugins/ShortcutPlugin.java`

**In `syncTheme()`** -- after saving to SharedPreferences, immediately update the system bar icons on the current activity so changes take effect without needing to background/resume the app:

```java
// Update system bar icon colors immediately
Activity activity = getActivity();
if (activity != null) {
    activity.runOnUiThread(() -> {
        boolean isLight = "light".equals(resolvedTheme);
        WindowInsetsControllerCompat ctrl =
            WindowCompat.getInsetsController(activity.getWindow(), activity.getWindow().getDecorView());
        if (ctrl != null) {
            ctrl.setAppearanceLightStatusBars(isLight);
            ctrl.setAppearanceLightNavigationBars(isLight);
        }
    });
}
```

### 3. Update `body::before` CSS tint strip

**In `src/index.css`** -- the `body::before` pseudo-element (status bar tint) already handles light and dark correctly. No CSS changes needed.

## How It Works

```text
User changes theme in Settings
  --> next-themes applies CSS class
  --> AppMenu syncs resolvedTheme to native SharedPreferences
  --> ShortcutPlugin.syncTheme() updates bar icons immediately
  --> On next onResume(), bar icons re-checked from SharedPreferences
```

## Why This Fixes It

- **On app launch**: `onCreate` uses system theme as initial guess (unchanged), then `onResume` corrects it from SharedPreferences
- **On theme change**: `syncTheme` updates icons instantly
- **On app resume**: `onResume` re-reads SharedPreferences, catching any changes

