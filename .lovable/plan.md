

# Comprehensive Platform Icon Audit and Enhancement

## Current State Analysis

### 1. Emoji Logic Issues Found

After thorough audit, I found multiple overlapping emoji systems that are inconsistent:

**A. `src/lib/contentResolver.ts` - PLATFORM_EMOJIS**
```typescript
const PLATFORM_EMOJIS: Record<string, string> = {
  netflix: '🎬',
  primevideo: '📺',
  youtube: '▶️',
  spotify: '🎵',
  instagram: '📷',
  twitter: '🐦',
  x: '🐦',
  // ...21 platforms
  default: '🔗',
};
```

**B. `src/lib/platformIcons.ts` - PLATFORM_PATTERNS**
- Contains 33 platform patterns with full metadata (name, colors, SVG icon)
- Used for branded platform icons in bookmark library
- More comprehensive and maintained

**C. `src/components/IconPicker.tsx` - COMMON_EMOJIS**
```typescript
const COMMON_EMOJIS = [
  '🎬', '📺', '▶️', '🎵', '📷', '🐦', '✨', '🏏', '🎥', '🔗',
  // ...35 emojis total
];
```
- Static list with no platform context
- Contains duplicates of platform emojis plus generic ones

### 2. Icon Flow for Shortcuts

```
URL Shared → contentResolver.getPlatformEmoji() 
           → Returns emoji (🎬, 🐦, etc.)
           → ShortcutCustomizer sets icon = { type: 'emoji', value: emoji }
           → IconPicker shows emoji options
           → shortcutManager.createHomeScreenShortcut()
           → Native createEmojiIcon() renders emoji on blue background
```

**Problem**: URL shortcuts use emojis instead of actual branded platform icons (YouTube red logo, Netflix N logo, etc.)

### 3. PlatformIcon Component Exists But Unused for Shortcuts

The `PlatformIcon.tsx` component contains SVG paths for 33+ platforms but is only used in the Bookmark Library, not in shortcuts or notifications.

### 4. Notification Icons

`NotificationHelper.java` line 163-166:
```java
private static int getNotificationIcon(String destinationType) {
    return android.R.drawable.ic_popup_reminder;  // Generic reminder icon
}
```

**Problem**: All notifications use a generic reminder icon regardless of destination type (URL, contact, file).

---

## Implementation Plan

### Phase 1: Consolidate Platform Detection

**Goal**: Use `platformIcons.ts` as the single source of truth for all platform detection

**File: `src/lib/contentResolver.ts`**

1. Remove redundant `PLATFORM_EMOJIS` object
2. Import `detectPlatform` from `platformIcons.ts`
3. Refactor `getPlatformEmoji()` to use the consolidated detection:

```typescript
import { detectPlatform } from '@/lib/platformIcons';

// Map platform icon type to emoji fallback (for cases where branded icon can't be used)
const PLATFORM_EMOJI_MAP: Record<string, string> = {
  youtube: '▶️',
  instagram: '📷',
  twitter: '🐦',
  netflix: '🎬',
  spotify: '🎵',
  // ...map all 33 platforms
};

export function getPlatformEmoji(url: string): string {
  const platform = detectPlatform(url);
  if (platform?.icon && PLATFORM_EMOJI_MAP[platform.icon]) {
    return PLATFORM_EMOJI_MAP[platform.icon];
  }
  return '🔗'; // default
}
```

4. Refactor `parseDeepLink()` to also use `detectPlatform()`:

```typescript
export function parseDeepLink(url: string): { platform: string; isDeepLink: boolean } {
  const platform = detectPlatform(url);
  if (platform) {
    return { platform: platform.name, isDeepLink: true };
  }
  return { platform: 'Web', isDeepLink: false };
}
```

---

### Phase 2: Add Platform Icon Type to Shortcut System

**Goal**: Support branded platform icons as a new icon type for URL shortcuts

**File: `src/types/shortcut.ts`**

```typescript
export type IconType = 'thumbnail' | 'emoji' | 'text' | 'platform';

export interface ShortcutIcon {
  type: IconType;
  value: string; // For 'platform' type: platform icon key (e.g., 'youtube', 'netflix')
}
```

**File: `src/components/ShortcutCustomizer.tsx`**

When creating URL shortcuts, auto-detect platform and set icon type:

```typescript
const getInitialIcon = (): ShortcutIcon => {
  if (source.type === 'url' || source.type === 'share') {
    const platform = detectPlatform(source.uri);
    if (platform?.icon) {
      // Use platform icon for recognized URLs
      return { type: 'platform', value: platform.icon };
    }
    // Fallback to emoji for unrecognized URLs
    return { type: 'emoji', value: getPlatformEmoji(source.uri) };
  }
  return { type: 'emoji', value: getFileTypeEmoji(source.mimeType, source.name) };
};
```

---

### Phase 3: Render Platform Icons in IconPicker

**Goal**: Show branded platform icons as selectable option alongside emoji/text

**File: `src/components/IconPicker.tsx`**

1. Accept optional `platformIcon` prop for detected platform
2. Add "Platform" icon type tab when available
3. Render the platform icon with proper colors

```typescript
interface IconPickerProps {
  thumbnail?: string;
  platformIcon?: string; // e.g., 'youtube', 'netflix'
  selectedIcon: ShortcutIcon;
  onSelect: (icon: ShortcutIcon) => void;
}

// New icon type
const iconTypes = [
  ...(platformIcon ? [{ type: 'platform', ... }] : []),
  ...(validThumbnail ? [{ type: 'thumbnail', ... }] : []),
  { type: 'emoji', ... },
  { type: 'text', ... },
];
```

4. When platform type is selected, render the `PlatformIcon` component with proper styling

---

### Phase 4: Generate Platform Icon Bitmaps for Android

**Goal**: Create native Android icons using platform colors and SVG paths

**File: `native/android/app/src/main/java/app/onetap/shortcuts/plugins/ShortcutPlugin.java`**

Add new method `createPlatformIcon()`:

```java
private Icon createPlatformIcon(String platformKey) {
    // Map platform keys to colors and simple icon representations
    int bgColor = getPlatformColor(platformKey);  // e.g., YouTube = red
    String iconLetter = getPlatformLetter(platformKey); // e.g., "Y" for YouTube
    
    // Create adaptive bitmap with platform branding
    int adaptiveSize = 216;
    Bitmap bitmap = Bitmap.createBitmap(adaptiveSize, adaptiveSize, Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(bitmap);
    
    // Fill with platform color
    Paint bgPaint = new Paint();
    bgPaint.setColor(bgColor);
    canvas.drawRect(0, 0, adaptiveSize, adaptiveSize, bgPaint);
    
    // Draw platform letter/symbol
    Paint textPaint = new Paint();
    textPaint.setColor(Color.WHITE);
    textPaint.setTextSize(adaptiveSize * 0.5f);
    textPaint.setTextAlign(Paint.Align.CENTER);
    canvas.drawText(iconLetter, adaptiveSize/2f, ...);
    
    return Icon.createWithAdaptiveBitmap(bitmap);
}

private int getPlatformColor(String key) {
    switch (key) {
        case "youtube": return Color.parseColor("#DC2626"); // red-600
        case "netflix": return Color.parseColor("#DC2626"); // red-600
        case "spotify": return Color.parseColor("#16A34A"); // green-600
        case "instagram": return Color.parseColor("#E11D48"); // pink gradient
        case "twitter": return Color.BLACK;
        // ... all 33 platforms
        default: return Color.parseColor("#2563EB"); // primary blue
    }
}
```

**File: `src/lib/shortcutManager.ts`**

Pass platform icon key to native:

```typescript
if (shortcut.icon.type === 'platform') {
  iconOptions.platformIcon = shortcut.icon.value; // e.g., 'youtube'
}
```

**File: `src/plugins/ShortcutPlugin.ts`**

Add `platformIcon` parameter to interface.

---

### Phase 5: Streamline IconPicker Emoji Selection

**Goal**: Remove redundant platform emojis from COMMON_EMOJIS, keep only generic/file-type emojis

**File: `src/components/IconPicker.tsx`**

```typescript
// Reduced list - platform icons handled separately
const COMMON_EMOJIS = [
  // File types (primary use case for emoji mode)
  '🖼️', '📄', '📑', '📊', '📽️', '📝', '📃', '📁',
  // Actions/categories
  '⭐', '❤️', '🔥', '💡', '🎯', '🚀', '📱', '🏠',
  // Misc useful
  '🎨', '💻', '📦', '📚', '⚙️', '🔔', '📍',
];
```

This reduces from 35 to ~24 emojis, removing platform-specific ones that are now handled by the branded icons.

---

### Phase 6: Improve Notification Icons

**Goal**: Show contextual icons in notifications based on action type

**File: `native/android/app/src/main/java/app/onetap/shortcuts/NotificationHelper.java`**

```java
private static int getNotificationIcon(String destinationType) {
    switch (destinationType) {
        case "url":
            return R.drawable.ic_link;  // Add link icon
        case "contact":
            return R.drawable.ic_phone; // Add phone icon
        case "file":
            return R.drawable.ic_file;  // Add file icon
        default:
            return R.drawable.ic_notification;
    }
}
```

Add corresponding drawable resources for each type.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/contentResolver.ts` | Remove PLATFORM_EMOJIS, use detectPlatform() |
| `src/types/shortcut.ts` | Add 'platform' to IconType |
| `src/components/ShortcutCustomizer.tsx` | Auto-detect platform, pass to IconPicker |
| `src/components/IconPicker.tsx` | Add platform icon tab, reduce emoji list |
| `src/lib/shortcutManager.ts` | Handle platform icon type |
| `src/plugins/ShortcutPlugin.ts` | Add platformIcon parameter |
| `ShortcutPlugin.java` | Add createPlatformIcon() method |
| `NotificationHelper.java` | Improve notification icons |
| `MyShortcutsContent.tsx` | Render platform icons in list |
| `ShortcutActionSheet.tsx` | Render platform icons |

## Files to Create

| File | Purpose |
|------|---------|
| `native/android/app/src/main/res/drawable/ic_link.xml` | Link notification icon |
| `native/android/app/src/main/res/drawable/ic_phone.xml` | Phone notification icon |
| `native/android/app/src/main/res/drawable/ic_file.xml` | File notification icon |
| `native/android/app/src/main/res/drawable/ic_notification.xml` | Default notification icon |

---

## Summary

| Before | After |
|--------|-------|
| URL shortcuts use generic emojis | URL shortcuts use branded platform icons with proper colors |
| 3 separate platform detection systems | 1 consolidated detection in platformIcons.ts |
| 35 emojis including platform duplicates | ~24 emojis for file types and generic use |
| Generic notification icons | Context-aware notification icons |
| Emoji icons on home screen | Branded platform icons (YouTube red, Netflix, etc.) |

---

## Testing Recommendations

1. Create shortcuts for YouTube, Netflix, Instagram, X.com URLs - verify branded icons
2. Verify emoji selection still works for file shortcuts
3. Test notifications show appropriate icons
4. Verify platform detection doesn't misidentify URLs (netflix vs x.com fix persists)
5. Test the reduced emoji picker for usability

