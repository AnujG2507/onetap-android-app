

# Add Android Launcher Icon from Uploaded Logo

## What Will Be Done

Copy the uploaded `logo.png` into all required Android mipmap density folders so the app icon renders correctly on devices. The existing adaptive icon XML files (`mipmap-anydpi-v26/`) are already correct and reference these images.

## Files to Create

The uploaded logo will be copied to these locations under `native/android/app/src/main/res/`:

| File | Purpose |
|------|---------|
| `mipmap-mdpi/ic_launcher.png` | Legacy icon (mdpi) |
| `mipmap-mdpi/ic_launcher_round.png` | Legacy round icon (mdpi) |
| `mipmap-mdpi/ic_launcher_foreground.png` | Adaptive foreground (mdpi) |
| `mipmap-hdpi/ic_launcher.png` | Legacy icon (hdpi) |
| `mipmap-hdpi/ic_launcher_round.png` | Legacy round icon (hdpi) |
| `mipmap-hdpi/ic_launcher_foreground.png` | Adaptive foreground (hdpi) |
| `mipmap-xhdpi/ic_launcher.png` | Legacy icon (xhdpi) |
| `mipmap-xhdpi/ic_launcher_round.png` | Legacy round icon (xhdpi) |
| `mipmap-xhdpi/ic_launcher_foreground.png` | Adaptive foreground (xhdpi) |
| `mipmap-xxhdpi/ic_launcher.png` | Legacy icon (xxhdpi) |
| `mipmap-xxhdpi/ic_launcher_round.png` | Legacy round icon (xxhdpi) |
| `mipmap-xxhdpi/ic_launcher_foreground.png` | Adaptive foreground (xxhdpi) |
| `mipmap-xxxhdpi/ic_launcher.png` | Legacy icon (xxxhdpi) |
| `mipmap-xxxhdpi/ic_launcher_round.png` | Legacy round icon (xxxhdpi) |
| `mipmap-xxxhdpi/ic_launcher_foreground.png` | Adaptive foreground (xxxhdpi) |

All 15 files will use the same uploaded PNG. Android will handle scaling at runtime. This is a perfectly valid interim approach since the logo will change soon -- at that point, properly sized PNGs from Android Asset Studio can replace these files.

## No Code Changes Needed

- The adaptive icon XMLs in `mipmap-anydpi-v26/` already reference `@mipmap/ic_launcher_foreground` and `@color/ic_launcher_background` -- no changes needed
- The patch script already copies everything from `native/android/` to `android/` during builds -- no changes needed

## Future Logo Change

When the new logo is ready, simply:
1. Generate properly sized icons using Android Asset Studio (https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html)
2. Replace the 15 PNG files in the same folders
3. Rebuild with `npx cap sync android`

