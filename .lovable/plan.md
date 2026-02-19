

# Fix: Status Bar and Navigation Bar Overlap in Viewers

## Problem

The slideshow viewer and video player use CSS classes `pt-safe` and `pb-safe` which **do not exist** in the stylesheet. This means zero padding is applied, causing content to render behind the Android status bar (top) and navigation bar (bottom). This happens on all Android devices regardless of OEM.

## Why This Is Already Cross-OEM Compatible

The app's `MainActivity.java` uses Android's `ViewCompat.setOnApplyWindowInsetsListener` API to read the **OS-reported system insets** (status bar height, navigation bar height) at runtime and inject them as CSS variables (`--android-safe-top`, `--android-safe-bottom`). This is the standard AndroidX approach and works reliably across all Android versions and OEMs (Samsung, Pixel, Xiaomi, OnePlus, etc.). The fix simply uses the correct CSS class names that reference these variables.

## What Exists vs What's Used

| CSS Class | Defined? | What It Does |
|-----------|----------|-------------|
| `pt-header-safe` | Yes | `padding-top: calc(var(--android-safe-top) + 1rem)` |
| `safe-bottom` | Yes | `padding-bottom: var(--android-safe-bottom, 16px)` |
| `safe-top` | Yes | `padding-top: var(--android-safe-top, 0px)` |
| `pt-safe` | **No** | Nothing -- zero padding |
| `pb-safe` | **No** | Nothing -- zero padding |

## Affected Locations (4 total)

| File | Line | Element | Broken Class | Replacement |
|------|------|---------|-------------|-------------|
| `SlideshowViewer.tsx` | 301 | Loading skeleton top bar | `pt-safe` | `pt-header-safe` |
| `SlideshowViewer.tsx` | 315 | Loading skeleton bottom bar | `pb-safe` | `safe-bottom` |
| `SlideshowViewer.tsx` | 458 | Bottom dot indicators | `pb-safe` | `safe-bottom` |
| `VideoPlayer.tsx` | 399 | Header bar | `pt-safe` | `pt-header-safe` |

Note: The SlideshowViewer's main controls top bar (line ~383) already uses `pt-header-safe` correctly -- only the above 4 locations need fixing.

## Changes

### File 1: `src/pages/SlideshowViewer.tsx`

- **Line 301**: Replace `pt-safe` with `pt-header-safe`
- **Line 315**: Replace `pb-safe` with `safe-bottom`
- **Line 458**: Replace `pb-safe` with `safe-bottom`

### File 2: `src/pages/VideoPlayer.tsx`

- **Line 399**: Replace `pt-safe` with `pt-header-safe`

## No New CSS or Native Code Needed

All replacement classes already exist in `src/index.css` and rely on the CSS variables injected by the native Android layer. This is purely a class name correction -- no new utilities, no native Java changes, no OEM-specific handling required.

