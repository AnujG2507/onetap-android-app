
# Multi-Photo Slideshow Shortcut Feature

## Overview

Enable multi-select within the existing **Photo** button flow. When users select multiple images, they get a slideshow shortcut. A subtle toast notification informs users about this behavior without adding any new UI buttons.

---

## User Flow (Streamlined)

1. User taps **Photo** → **Create Shortcut**
2. Native file picker opens with **multi-select enabled** (users can pick 1 or more)
3. **If 1 image selected**: Existing single-image shortcut flow (no changes)
4. **If 2+ images selected**: 
   - Subtle toast appears: "Creating a slideshow with X photos"
   - Routes to new **SlideshowCustomizer** (reorder, name, icon selection)
5. Shortcut taps open lightweight **SlideshowViewer** (swipe through, auto-advance, "Open with...")

---

## Technical Architecture

### Phase 1: Data Model Extension

**File: `src/types/shortcut.ts`**

```typescript
// Existing types extended:
export type ShortcutType = 'file' | 'link' | 'contact' | 'message' | 'slideshow';

export interface ShortcutData {
  // ... existing fields ...
  
  // Slideshow-specific fields
  imageUris?: string[];          // Array of image content:// URIs
  imageThumbnails?: string[];    // Array of base64 thumbnails (for icon generation & preview)
  autoAdvanceInterval?: number;  // Auto-advance seconds (0 = off, 3, 5, 10)
}
```

**File: `src/types/shortcut.ts` - New interface for multi-file sources**

```typescript
export interface MultiFileSource {
  type: 'slideshow';
  files: Array<{
    uri: string;
    mimeType?: string;
    name?: string;
    thumbnail?: string;  // base64
  }>;
}
```

---

### Phase 2: Native Multi-File Picker

**File: `src/plugins/ShortcutPlugin.ts` - Add new method**

```typescript
pickMultipleFiles(options?: { 
  mimeTypes?: string[];
  maxCount?: number;  // Default 20
}): Promise<{
  success: boolean;
  files?: Array<{
    uri: string;
    name?: string;
    mimeType?: string;
    size?: number;
    thumbnail?: string;  // base64 thumbnail (256px)
  }>;
  error?: string;
}>;
```

**File: `native/.../ShortcutPlugin.java` - New method**

- Use `ACTION_OPEN_DOCUMENT` with `EXTRA_ALLOW_MULTIPLE = true`
- Take persistable URI permissions for each selected file
- Generate 256px base64 thumbnails for each image
- Cap at 20 files maximum

---

### Phase 3: Content Resolver Enhancement

**File: `src/lib/contentResolver.ts`**

Add new function `pickMultipleImages()`:

```typescript
export async function pickMultipleImages(): Promise<MultiFileSource | null> {
  if (Capacitor.isNativePlatform()) {
    const result = await ShortcutPlugin.pickMultipleFiles({
      mimeTypes: ['image/*'],
      maxCount: 20,
    });
    // ... handle result
  }
  // Web fallback with multiple file input
}
```

---

### Phase 4: AccessFlow Integration

**File: `src/components/AccessFlow.tsx`**

Modify `handleSelectFile` for `'image'` filter:

```typescript
const handleSelectFile = async (filter: FileTypeFilter, actionMode: ActionMode) => {
  if (filter === 'image' && actionMode === 'shortcut') {
    // Use multi-select picker for images when creating shortcuts
    const result = await pickMultipleImages();
    
    if (result && result.files.length > 1) {
      // Show subtle toast
      toast.info(`Creating a slideshow with ${result.files.length} photos`);
      
      // Route to slideshow customizer
      setSlideshowSource(result);
      setStep('slideshow-customize');
      return;
    } else if (result && result.files.length === 1) {
      // Single image - existing flow
      setContentSource({
        type: 'file',
        uri: result.files[0].uri,
        mimeType: result.files[0].mimeType,
        name: result.files[0].name,
      });
      setStep('customize');
      return;
    }
    return;
  }
  
  // Existing single-file flow for other types
  const file = await pickFile(filter);
  // ...
};
```

---

### Phase 5: Slideshow Customizer Component

**New File: `src/components/SlideshowCustomizer.tsx`**

Features:
- Horizontal scrollable thumbnail strip with drag-to-reorder (uses existing `@dnd-kit`)
- Name input (auto-generates "X Photos" default)
- Icon options:
  - **Grid composite**: 2x2 thumbnail mosaic from first 4 images (default)
  - **Cover image**: Use first image
  - **Emoji/Text**: Standard options
- Auto-advance toggle (Off, 3s, 5s, 10s)
- Photo count badge

---

### Phase 6: Grid Icon Generator

**New File: `src/lib/slideshowIconGenerator.ts`**

Canvas-based function to generate 2x2 grid composite from 4 thumbnails:

```typescript
export async function generateGridIcon(thumbnails: string[]): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  
  // Draw 4 images in 2x2 grid with 4px gap
  // Returns base64 data URL
}
```

---

### Phase 7: Slideshow Viewer Page

**New File: `src/pages/SlideshowViewer.tsx`**

Lightweight, focused viewer:
- **URL Pattern**: `/slideshow/:shortcutId`
- **Layout**: Fullscreen dark background, centered image
- **Navigation**: Swipe left/right (using CSS scroll-snap or framer-motion gestures)
- **Top bar** (auto-fade after 3s):
  - Back button
  - Image counter: "3 / 12"
  - "Open with..." button (opens current image in external gallery app)
- **Auto-advance**: Play/Pause FAB in bottom-right corner
- **Gestures**:
  - Swipe down: Close viewer
  - Double-tap: Toggle fit/fill

---

### Phase 8: Native Slideshow Proxy Activity

**New File: `native/.../SlideshowProxyActivity.java`**

When home screen shortcut is tapped:
1. Record usage via `NativeUsageTracker`
2. Launch WebView to `/slideshow/:shortcutId`
3. Pass shortcut ID as intent extra

**File: `AndroidManifest.xml`** - Register new activity

---

### Phase 9: Shortcut Manager Updates

**File: `src/lib/shortcutManager.ts`**

Add slideshow case to `buildContentIntent()`:

```typescript
if (shortcut.type === 'slideshow') {
  return {
    action: 'app.onetap.OPEN_SLIDESHOW',
    data: `onetap://slideshow/${shortcut.id}`,
    extras: {
      shortcut_id: shortcut.id,
    },
  };
}
```

---

### Phase 10: useShortcuts Hook Extension

**File: `src/hooks/useShortcuts.ts`**

Add `createSlideshowShortcut` method:

```typescript
const createSlideshowShortcut = useCallback((
  images: Array<{ uri: string; thumbnail?: string }>,
  name: string,
  icon: ShortcutIcon,
  autoAdvanceInterval?: number
): ShortcutData => {
  const shortcut: ShortcutData = {
    id: crypto.randomUUID(),
    name,
    type: 'slideshow',
    contentUri: '',  // Not used for slideshows
    icon,
    createdAt: Date.now(),
    usageCount: 0,
    imageUris: images.map(i => i.uri),
    imageThumbnails: images.map(i => i.thumbnail).filter(Boolean),
    autoAdvanceInterval,
  };
  
  const updated = [...shortcuts, shortcut];
  saveShortcuts(updated);
  return shortcut;
}, [shortcuts, saveShortcuts]);
```

---

### Phase 11: Routing

**File: `src/App.tsx`**

Add route:

```tsx
<Route path="/slideshow/:shortcutId" element={<SlideshowViewer />} />
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/pages/SlideshowViewer.tsx` | Lightweight fullscreen photo viewer |
| `src/components/SlideshowCustomizer.tsx` | Multi-image configuration UI with reordering |
| `src/lib/slideshowIconGenerator.ts` | Canvas-based 2x2 grid icon generation |
| `native/.../SlideshowProxyActivity.java` | Native tap handler for home screen shortcut |

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/shortcut.ts` | Add `slideshow` type, `imageUris`, `imageThumbnails`, `autoAdvanceInterval` |
| `src/plugins/ShortcutPlugin.ts` | Add `pickMultipleFiles` interface |
| `native/.../ShortcutPlugin.java` | Implement multi-file picker with thumbnails |
| `src/lib/contentResolver.ts` | Add `pickMultipleImages()` function |
| `src/components/AccessFlow.tsx` | Route multi-image selection to slideshow flow |
| `src/lib/shortcutManager.ts` | Add slideshow intent builder |
| `src/hooks/useShortcuts.ts` | Add `createSlideshowShortcut` method |
| `src/App.tsx` | Add `/slideshow/:shortcutId` route |
| `AndroidManifest.xml` | Register SlideshowProxyActivity |
| `src/i18n/locales/en.json` | Add slideshow-related translation strings |

---

## UX Details

### Toast Behavior
- **Trigger**: When 2+ photos selected
- **Message**: "Creating a slideshow with X photos"
- **Duration**: 2 seconds
- **Position**: Top (default sonner position)
- **Style**: Info variant (subtle, not intrusive)

### Slideshow Viewer Features
- Tap to show/hide controls
- Swipe navigation with momentum
- Image counter (e.g., "3 / 12")
- "Open with..." sends current image to external gallery app
- Auto-advance: 3s / 5s / 10s intervals with pause on touch
- Close: Back button, swipe down, or Android back gesture

### Icon Generation
- **Default**: 2x2 grid composite of first 4 images
- **Fallback**: Cover image (first image) if grid generation fails
- **Alternative**: Emoji (🖼️) or Text icon

---

## Constraints & Limits

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Maximum images | 20 | Storage limits, UX practicality |
| Thumbnail size | 256px | Balance quality vs. storage |
| Auto-advance intervals | Off, 3s, 5s, 10s | User research sweet spots |
| Grid icon size | 256x256 | Native shortcut icon standard |

---

## Implementation Phases

### Phase 1: Foundation (Native)
- Update `ShortcutPlugin.java` with `pickMultipleFiles` method
- Update `ShortcutPlugin.ts` TypeScript interface
- Update `shortcut.ts` types with slideshow fields

### Phase 2: Content Resolution
- Add `pickMultipleImages()` to `contentResolver.ts`
- Web fallback with `<input multiple>`

### Phase 3: AccessFlow Routing
- Detect multi-image selection in `handleSelectFile`
- Show toast notification
- Route to new slideshow step

### Phase 4: Customizer UI
- Create `SlideshowCustomizer.tsx`
- Implement drag-to-reorder with `@dnd-kit`
- Create `slideshowIconGenerator.ts` for grid icons

### Phase 5: Viewer
- Create `SlideshowViewer.tsx`
- Implement swipe navigation with framer-motion
- Add auto-advance timer logic

### Phase 6: Native Integration
- Create `SlideshowProxyActivity.java`
- Update `shortcutManager.ts` intent builder
- Register activity in AndroidManifest

### Phase 7: Polish
- Add translations
- Test edge cases (1 image, max images, cancelled picker)
- Performance optimization for large slideshows

---

## Alignment with Product Philosophy

This feature embodies the OneTap ideology:

- **One tap to what matters**: Single tap from home screen opens curated photo collection
- **Distraction-free**: No feeds, no suggestions, no editing - just viewing
- **Non-competitive**: Not replacing gallery apps; providing focused access to specific sets
- **No new UI buttons**: Multi-select hidden within existing Photo flow
- **Subtle guidance**: Toast notification educates without interrupting
- **Local-first**: All photos stored locally, no cloud dependency
- **Premium feel**: Smooth swipe transitions, auto-fade controls, gesture-driven
