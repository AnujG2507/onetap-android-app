

# Permanent Fix for Bottom CTA Overlap on Android

## Summary

A two-part fix: (1) disable edge-to-edge at the native layer so the WebView never renders behind the nav bar, and (2) replace the CSS inset logic with a clean contract using a renamed variable `--android-safe-bottom` with a 24px minimum fallback.

## Changes

### File 1: `native/android/app/src/main/java/app/onetap/access/MainActivity.java`

**Add import:**
```java
import androidx.core.view.WindowCompat;
```

**In `onCreate`, before `super.onCreate()`:**
```java
// Disable edge-to-edge: system resizes the WebView to exclude nav bar.
// This is the single most important line -- it prevents content from
// rendering behind the navigation bar on ALL Android devices.
WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
```

**Replace `setupNavBarInsetInjection`** to:
1. Read BOTH `navigationBars()` and `systemGestures()` bottom insets
2. Take the `max` of both (covers gesture pill + 3-button nav)
3. Apply a 24px CSS minimum floor
4. Inject as `--android-safe-bottom` (renamed for clarity)
5. Inject a 24px default IMMEDIATELY (synchronously) before the inset listener fires, so the first paint already has safe spacing

### File 2: `src/index.css`

**Replace `.safe-bottom`:**
```css
.safe-bottom {
  padding-bottom: calc(var(--android-safe-bottom, 24px));
}
```

**Replace `.safe-bottom-action`:**
```css
.safe-bottom-action {
  padding-bottom: calc(var(--android-safe-bottom, 24px) + 16px);
}
```

No `env()`, no `max()` chains, no conditional logic. The native layer is the single source of truth; 24px is the absolute minimum touch-safe fallback for web-only contexts.

## Why This Works

| Problem | Solution |
|---------|----------|
| WebView renders behind nav bar | `setDecorFitsSystemWindows(window, true)` resizes WebView to exclude it |
| `env(safe-area-inset-bottom)` returns 0 on Android | Removed entirely; not used |
| Gesture nav reports near-zero inset | `systemGestures()` bottom inset is also read and max'd |
| CSS variable injected too late (race) | Default 24px injected synchronously before WebView loads; real value overrides |
| OEM variance | `WindowInsetsCompat` abstracts all OEM differences |

## Components Affected (No Changes Needed)

These components already use `.safe-bottom` or `.safe-bottom-action` and will automatically benefit:
- `BottomNav.tsx` -- uses `safe-bottom`
- `ShortcutCustomizer.tsx` -- uses `safe-bottom-action`
- `UrlInput.tsx` -- uses `safe-bottom-action`
- `SlideshowCustomizer.tsx` -- uses `safe-bottom-action`
- `ContactShortcutCustomizer.tsx` -- uses `safe-bottom-action`

## Files Modified

| File | Change |
|------|--------|
| `MainActivity.java` | Add `WindowCompat.setDecorFitsSystemWindows`, rewrite inset injection |
| `src/index.css` | Simplify `.safe-bottom` and `.safe-bottom-action` to use `--android-safe-bottom` with 24px fallback |

## Testing Checklist

- Pixel emulator, gesture navigation: CTA fully visible, no overlap
- Pixel emulator, 3-button navigation: CTA above nav buttons
- Samsung One UI gestures: no overlap
- First render: no layout jump (24px default prevents flash)
- Web preview (no Android): 24px fallback provides minimum spacing

