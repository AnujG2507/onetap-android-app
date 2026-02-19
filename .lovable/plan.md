

# Fix: Remove Double Bottom Padding

## Problem

The system already handles navigation bar spacing via `setDecorFitsSystemWindows(true)` -- the WebView ends above the system nav bar. But then `--android-safe-bottom` injects additional CSS padding (with a 24px minimum floor) inside the WebView, creating a visible gap at the bottom.

```text
Current (double padding):
+------------------+
|    App Content   |
|  [Bottom Nav]    |
|  ~~~ 24px+ gap ~~|  <-- CSS padding (unnecessary)
+------------------+  <-- WebView ends here (system already handled it)
|  System Nav Bar  |
+------------------+

Fixed (no CSS padding):
+------------------+
|    App Content   |
|  [Bottom Nav]    |
+------------------+  <-- WebView ends here, nav sits flush
|  System Nav Bar  |
+------------------+
```

## Changes

### File 1: `native/android/app/src/main/java/app/onetap/access/MainActivity.java`

Set `--android-safe-bottom` to `0px` always. Since `setDecorFitsSystemWindows(true)` is kept, the system handles all spacing. The CSS variable becomes a no-op.

- Remove the 24px default injection
- Remove the inset listener logic that calculates and injects padding
- Replace with a single `--android-safe-bottom: 0px` injection
- Keep `setDecorFitsSystemWindows(true)` unchanged

### File 2: `src/index.css`

- Update `.safe-bottom` fallback from `24px` to `0px`
- Update `.safe-bottom-action` to remove the extra `+ 16px` calc tied to the old padding (keep just a small visual margin if needed)
- No changes to `.safe-top` or header utilities (status bar handling is unaffected)

### No other files changed

`BottomNav.tsx` already uses the `safe-bottom` class -- it will automatically get 0px padding and sit flush at the bottom of the WebView, directly above the system navigation area.

## Why This Works on All OEMs

The key insight: `setDecorFitsSystemWindows(true)` delegates spacing entirely to the Android system. Every OEM (Samsung, Xiaomi, Huawei, OnePlus, Pixel) handles this identically at the framework level -- the WebView is resized to exclude the system bars. No CSS workaround is needed because there is nothing to work around.

| Navigation Type | System Behavior | CSS Padding | Result |
|----------------|----------------|-------------|--------|
| Gesture (swipe) | WebView ends above ~20dp gesture area | 0px | Flush, no gap |
| 3-button nav | WebView ends above ~48dp button bar | 0px | Flush, no gap |
| Samsung One UI | Same framework behavior | 0px | Flush, no gap |
| Xiaomi MIUI | Same framework behavior | 0px | Flush, no gap |

