

# Remove Background Colors from Home Screen Shortcut Icons

## Summary

Update the native Android icon rendering code to display platform icons and favicons with **transparent backgrounds** at **full size** on the home screen, matching the in-app UI changes.

## Current Behavior (Native Android)

| Icon Type | Background | Icon Size |
|-----------|------------|-----------|
| Platform icons (YouTube, Netflix, etc.) | Brand color fill (red, black, etc.) | 45% of container |
| Favicon icons | Blue `#3B82F6` fill | 45% of container |

## Proposed Behavior

| Icon Type | Background | Icon Size |
|-----------|------------|-----------|
| Platform icons | **Transparent** | Full size (~80% of safe zone) |
| Favicon icons | **Transparent** | Full size (~80% of safe zone) |

## File to Modify

| File | Changes |
|------|---------|
| `native/android/app/src/main/java/app/onetap/shortcuts/plugins/ShortcutPlugin.java` | Update `createFaviconIcon()` and `createPlatformIcon()` methods |

## Implementation Details

### 1. Update `createFaviconIcon()` Method

**Current**:
```java
// Fill background with blue
Paint bgPaint = new Paint();
bgPaint.setColor(Color.parseColor("#3B82F6"));
canvas.drawRect(0, 0, adaptiveSize, adaptiveSize, bgPaint);

// Scale favicon to 45%
float iconSize = adaptiveSize * 0.45f;
```

**Proposed**:
```java
// Transparent background - just clear the canvas
// Bitmap.Config.ARGB_8888 already supports transparency
// No background fill needed

// Scale favicon to fill most of the safe zone (80%)
float iconSize = adaptiveSize * 0.80f;
```

### 2. Update `createPlatformIcon()` Method

**Current**:
```java
// Fill entire canvas with platform brand color
int bgColor = getPlatformColor(platformKey);
Paint bgPaint = new Paint();
bgPaint.setColor(bgColor);
canvas.drawRect(0, 0, adaptiveSize, adaptiveSize, bgPaint);

// Scale icon to 45%
float iconSize = adaptiveSize * 0.45f;
```

**Proposed**:
```java
// Transparent background - no fill
// The icon will be drawn in its brand color directly

// Draw icon in brand color at full size
Paint iconPaint = new Paint();
iconPaint.setColor(getPlatformColor(platformKey)); // Brand color for the icon itself
iconPaint.setAntiAlias(true);
iconPaint.setStyle(Paint.Style.FILL);

// Scale icon to fill most of the safe zone (80%)
float iconSize = adaptiveSize * 0.80f;
```

### 3. Platform Icon Colors

When using transparent backgrounds, the icon paths themselves need to be colored:

| Platform | Icon Color |
|----------|------------|
| YouTube | Red `#FF0000` |
| Netflix | Red `#E50914` |
| Spotify | Green `#1DB954` |
| WhatsApp | Green `#25D366` |
| Instagram | Gradient or pink `#E4405F` |
| Twitter/X | Black `#000000` |
| Facebook | Blue `#1877F2` |

## Visual Comparison

```text
BEFORE (Platform Icon - YouTube):
┌─────────────────┐
│█████████████████│ ← Red background fills canvas
│████████▲████████│ ← Small white play icon (45%)
│███████▲▲▲███████│
│█████████████████│
└─────────────────┘

AFTER (Platform Icon - YouTube):
┌─────────────────┐
│                 │ ← Transparent (launcher shape visible)
│    ▓▓▓▓▓▓▓▓▓    │
│    ▓▓▓▶▓▓▓▓    │ ← Full-size red YouTube logo (80%)
│    ▓▓▓▓▓▓▓▓▓    │
│                 │
└─────────────────┘

BEFORE (Favicon):
┌─────────────────┐
│█████████████████│ ← Blue #3B82F6 background
│███████░░████████│ ← Small favicon (45%)
│█████████████████│
└─────────────────┘

AFTER (Favicon):
┌─────────────────┐
│                 │ ← Transparent
│    ░░░░░░░░░    │
│    ░░░██░░░░    │ ← Full-size favicon (80%)
│    ░░░░░░░░░    │
│                 │
└─────────────────┘
```

## Technical Notes

1. **Bitmap Creation**: Use `Bitmap.Config.ARGB_8888` which already supports alpha transparency
2. **No Background Paint**: Skip the `canvas.drawRect()` call for background fill
3. **Safe Zone**: Android adaptive icons have a safe zone of ~66% in the center - using 80% of the canvas ensures the icon fills most of the visible area across all launcher shapes
4. **Launcher Compatibility**: Most modern launchers will show the launcher's default background shape behind transparent adaptive icons

