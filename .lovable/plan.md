
# Bulletproof Image Preview Logic

## Overview
This plan implements comprehensive measures to maximize image preview success across the app. The goal is to make every possible effort to display images correctly before resorting to fallbacks.

## Current Issues Identified

After thorough code review, I found several opportunities to improve image loading reliability:

1. **No preloading** - Images are loaded only when rendered, causing flash-to-fallback issues
2. **Single source strategy** - Components don't try alternative sources (e.g., `thumbnailData` vs `icon.value`)
3. **No retry mechanism** - Failed images stay failed even if the issue was temporary
4. **No loading states** - Users see abrupt fallback switches instead of smooth transitions
5. **Race conditions** - Error states can persist incorrectly after source changes
6. **No validation** - Empty/invalid base64 strings trigger unnecessary load attempts

---

## Implementation Strategy

### 1. Create a Reusable ImageWithFallback Component

A centralized component that handles:
- Multiple source priority chain
- Preload validation before render
- Loading skeleton states
- Retry logic for transient failures
- Graceful fallback transitions

```
src/components/ui/image-with-fallback.tsx
```

### 2. Add Image Preloading Utility

A utility to validate image sources before rendering:
- Validate base64 data format
- Check `content://` URI accessibility on native
- Preload images in memory
- Cache validation results

```
src/lib/imageUtils.ts
```

### 3. Update All Image-Rendering Components

Apply the bulletproof pattern to each component:

---

## Technical Details

### A. ImageWithFallback Component

**Props:**
- `sources: string[]` - Priority-ordered list of image sources to try
- `fallback: ReactNode` - What to render when all sources fail
- `alt?: string` - Alt text
- `className?: string` - Styling
- `onLoadSuccess?: () => void` - Callback on success
- `onAllFailed?: () => void` - Callback when all sources exhausted

**Logic:**
1. Filter out empty/null sources
2. Validate base64 strings (must start with `data:image`)
3. Try each source in order
4. Show skeleton during loading
5. On error, try next source
6. After all fail, render fallback
7. Cache successful source for re-renders

### B. Image Validation Utility

```typescript
// src/lib/imageUtils.ts

export function isValidImageSource(src: string | undefined | null): boolean {
  if (!src || typeof src !== 'string') return false;
  if (src.trim() === '') return false;
  
  // Valid base64 data URL
  if (src.startsWith('data:image')) return true;
  
  // Valid blob URL
  if (src.startsWith('blob:')) return true;
  
  // Valid HTTP(S) URL
  if (src.startsWith('http://') || src.startsWith('https://')) return true;
  
  // Android content URI (may or may not work, but worth trying)
  if (src.startsWith('content://')) return true;
  
  // File URI
  if (src.startsWith('file://')) return true;
  
  return false;
}

export function preloadImage(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isValidImageSource(src)) {
      resolve(false);
      return;
    }
    
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
    
    // Timeout after 5 seconds
    setTimeout(() => resolve(false), 5000);
  });
}
```

### C. Component Updates

#### ContentPreview.tsx
```typescript
// Before: Single source with basic onError
// After: Try source.uri first, then source.thumbnailData, with validation

const imageSources = useMemo(() => {
  const sources: string[] = [];
  if (source.uri) sources.push(source.uri);
  if (source.thumbnailData) {
    // thumbnailData might be base64 without prefix
    const thumb = source.thumbnailData.startsWith('data:') 
      ? source.thumbnailData 
      : `data:image/jpeg;base64,${source.thumbnailData}`;
    sources.push(thumb);
  }
  return sources.filter(isValidImageSource);
}, [source.uri, source.thumbnailData]);
```

#### ShortcutCustomizer.tsx
```typescript
// Preview icon section - try multiple sources
const previewSources = useMemo(() => {
  const sources: string[] = [];
  if (icon.type === 'thumbnail' && icon.value) sources.push(icon.value);
  if (thumbnail) sources.push(thumbnail);
  return sources.filter(isValidImageSource);
}, [icon, thumbnail]);
```

#### MyShortcutsContent.tsx (ShortcutIcon)
```typescript
// Try icon.value, then thumbnailData
const imageSources = useMemo(() => {
  const sources: string[] = [];
  if (icon.value) sources.push(icon.value);
  if (shortcut.thumbnailData) {
    const thumb = shortcut.thumbnailData.startsWith('data:')
      ? shortcut.thumbnailData
      : `data:image/jpeg;base64,${shortcut.thumbnailData}`;
    sources.push(thumb);
  }
  return sources.filter(isValidImageSource);
}, [icon.value, shortcut.thumbnailData]);
```

#### ShortcutActionSheet.tsx
```typescript
// Same multi-source approach
const iconSources = useMemo(() => {
  const sources: string[] = [];
  if (shortcut.thumbnailData) sources.push(shortcut.thumbnailData);
  if (shortcut.icon.value) sources.push(shortcut.icon.value);
  return sources.filter(isValidImageSource);
}, [shortcut]);
```

#### IconPicker.tsx
```typescript
// Validate thumbnail before showing thumbnail tab
const validThumbnail = useMemo(() => 
  thumbnail && isValidImageSource(thumbnail) ? thumbnail : null,
[thumbnail]);

// Only show thumbnail option if valid
const iconTypes = [
  ...(validThumbnail ? [{ type: 'thumbnail', ... }] : []),
  // ...
];
```

#### ProfilePage.tsx & CloudBackupSection.tsx
```typescript
// Validate avatar URL before attempting load
const validAvatarUrl = useMemo(() => 
  avatarUrl && isValidImageSource(avatarUrl) ? avatarUrl : null,
[avatarUrl]);
```

#### BookmarkDragOverlay.tsx
```typescript
// Already has decent error handling, but add validation
const validFaviconUrl = useMemo(() => 
  faviconUrl && isValidImageSource(faviconUrl) ? faviconUrl : null,
[faviconUrl]);
```

---

## Files to Create
1. `src/lib/imageUtils.ts` - Image validation and preloading utilities
2. `src/components/ui/image-with-fallback.tsx` - Reusable image component

## Files to Modify
1. `src/components/ContentPreview.tsx` - Multi-source support
2. `src/components/ShortcutCustomizer.tsx` - Better source chain
3. `src/components/MyShortcutsContent.tsx` - ShortcutIcon improvements
4. `src/components/ShortcutActionSheet.tsx` - Icon source chain
5. `src/components/IconPicker.tsx` - Pre-validate thumbnail
6. `src/components/ProfilePage.tsx` - Validate avatar
7. `src/components/CloudBackupSection.tsx` - Validate avatar
8. `src/components/BookmarkDragOverlay.tsx` - Validate favicon

---

## Key Improvements

| Before | After |
|--------|-------|
| Single image source | Priority chain of multiple sources |
| No source validation | Validate before render attempt |
| Abrupt fallback switch | Loading skeleton → smooth transition |
| Error state persists | Reset on source change + retry logic |
| Empty strings attempted | Filter invalid sources early |
| Components duplicate logic | Centralized ImageWithFallback |

---

## Edge Cases Handled

1. **Empty base64 strings** - Filtered out before load attempt
2. **Expired content:// URIs** - Falls through to thumbnailData backup
3. **Network timeout** - 5-second preload timeout prevents hanging
4. **Flash of broken image** - Skeleton shown during validation
5. **Base64 without prefix** - Automatically prepends `data:image/jpeg;base64,`
6. **Source change race conditions** - useEffect resets state on change
7. **SSR/hydration** - Preload only runs in browser context

---

## Summary

This plan creates a bulletproof image loading system that:
- Tries multiple sources before giving up
- Validates sources before attempting loads
- Shows smooth loading states
- Provides consistent fallback behavior
- Centralizes logic for maintainability
