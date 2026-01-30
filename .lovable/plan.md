
# Image Preview Audit and Fix Plan

## Overview
This plan addresses image preview display issues across the entire app by implementing graceful error handling, loading states, and fallback visuals consistently.

## Audit Findings

After reviewing all 13 components that render `<img>` elements, I identified the following categories:

### Components WITH proper error handling:
| Component | Error Handler |
|-----------|---------------|
| `ContactAvatar.tsx` | `onError` hides image, shows fallback |
| `BookmarkItem.tsx` | `onError` hides image, shows Globe icon |
| `ClipboardSuggestion.tsx` | `onError` hides favicon |
| `SharedUrlActionSheet.tsx` | `onError` hides thumbnail/favicon |
| `TrashItem.tsx` | `onError` hides favicon |

### Components MISSING error handling (requiring fixes):
| Component | Issue |
|-----------|-------|
| `ContentPreview.tsx` | No error handler for image previews |
| `ShortcutCustomizer.tsx` | No error handler for icon preview |
| `IconPicker.tsx` | No error handler for thumbnail preview |
| `ShortcutActionSheet.tsx` | No error handler for shortcut icon |
| `MyShortcutsContent.tsx` | No error handler for shortcut thumbnails |
| `BookmarkDragOverlay.tsx` | No error handler for favicon |
| `ProfilePage.tsx` | No error handler for avatar |
| `CloudBackupSection.tsx` | No error handler for avatar |

---

## Implementation Plan

### 1. ContentPreview.tsx
**Problem:** Image source URIs (especially `content://` URIs on Android) may fail to load.

**Fix:**
- Add `onError` handler to hide the image and show the emoji fallback
- Add loading state with skeleton placeholder

```tsx
const [imageError, setImageError] = useState(false);

{isImage && source.uri && !imageError ? (
  <img
    src={source.uri}
    alt=""
    className="h-full w-full object-cover"
    onError={() => setImageError(true)}
  />
) : (
  <span className="text-2xl">{info.emoji}</span>
)}
```

---

### 2. ShortcutCustomizer.tsx
**Problem:** Thumbnail icons may fail to load (lines 222-223), showing broken image.

**Fix:**
- Add `onError` handler to fall back to emoji icon
- Track icon load failures in state

```tsx
const [iconLoadError, setIconLoadError] = useState(false);

// Reset error when icon changes
useEffect(() => {
  setIconLoadError(false);
}, [icon]);

{!isLoadingThumbnail && icon.type === 'thumbnail' && !iconLoadError && (
  <img 
    src={icon.value} 
    alt="" 
    className="h-full w-full object-cover"
    onError={() => setIconLoadError(true)}
  />
)}
{!isLoadingThumbnail && (icon.type === 'emoji' || iconLoadError) && (
  <span className="text-2xl">{iconLoadError ? '📱' : icon.value}</span>
)}
```

---

### 3. IconPicker.tsx
**Problem:** Thumbnail preview at lines 158-163 has no error handling.

**Fix:**
- Add `onError` handler to hide image and show fallback icon

```tsx
const [thumbnailError, setThumbnailError] = useState(false);

{selectedIcon.type === 'thumbnail' && !thumbnailError && (
  <img
    src={selectedIcon.value}
    alt="Icon preview"
    className="h-full w-full object-cover"
    onError={() => setThumbnailError(true)}
  />
)}
{selectedIcon.type === 'thumbnail' && thumbnailError && (
  <Image className="h-6 w-6 text-primary-foreground/50" />
)}
```

---

### 4. ShortcutActionSheet.tsx
**Problem:** Shortcut icon preview at lines 130-135 shows broken image if thumbnail fails.

**Fix:**
- Add state to track load failures
- Fall back to type-based icon

```tsx
const [iconError, setIconError] = useState(false);

// Reset when shortcut changes
useEffect(() => {
  setIconError(false);
}, [shortcut?.id]);

{(shortcut.thumbnailData || shortcut.icon.value) && !iconError ? (
  <img 
    src={shortcut.thumbnailData || shortcut.icon.value} 
    alt="" 
    className="w-full h-full object-cover"
    onError={() => setIconError(true)}
  />
) : (
  getShortcutIcon()
)}
```

---

### 5. MyShortcutsContent.tsx
**Problem:** ShortcutIcon component at lines 79-91 has no error handling for thumbnails.

**Fix:**
- Add state to ShortcutIcon for image load errors
- Fall back to Zap icon on failure

```tsx
function ShortcutIcon({ shortcut }: { shortcut: ShortcutData }) {
  const [imageError, setImageError] = useState(false);
  const { icon } = shortcut;
  
  // ... existing emoji/text handling ...
  
  if (icon.type === 'thumbnail') {
    const thumbnailSrc = icon.value || shortcut.thumbnailData;
    if (thumbnailSrc && !imageError) {
      return (
        <div className="h-12 w-12 rounded-xl overflow-hidden bg-muted">
          <img 
            src={thumbnailSrc} 
            alt={shortcut.name}
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        </div>
      );
    }
  }
  
  // Default fallback
  return (
    <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
      <Zap className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}
```

---

### 6. BookmarkDragOverlay.tsx
**Problem:** Favicon at lines 43-48 has no error handling.

**Fix:**
- Add `onError` handler consistent with BookmarkItem

```tsx
<img 
  src={faviconUrl} 
  alt="" 
  className="h-6 w-6 object-contain"
  onError={(e) => {
    e.currentTarget.style.display = 'none';
    e.currentTarget.nextElementSibling?.classList.remove('hidden');
  }}
/>
<Globe className={cn("h-5 w-5 text-muted-foreground", faviconUrl && "hidden")} />
```

---

### 7. ProfilePage.tsx
**Problem:** Avatar image at lines 339-345 has no error handling.

**Fix:**
- Add `onError` handler to show User icon fallback

```tsx
const [avatarError, setAvatarError] = useState(false);

{avatarUrl && !avatarError ? (
  <img 
    src={avatarUrl} 
    alt={fullName} 
    className="w-16 h-16 rounded-full"
    referrerPolicy="no-referrer"
    onError={() => setAvatarError(true)}
  />
) : (
  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
    <User className="w-8 h-8 text-primary" />
  </div>
)}
```

---

### 8. CloudBackupSection.tsx
**Problem:** Avatar at lines 213-218 has no error handling.

**Fix:**
- Add `onError` handler to show Cloud icon fallback

```tsx
const [avatarError, setAvatarError] = useState(false);

{user?.user_metadata?.avatar_url && !avatarError ? (
  <img 
    src={user.user_metadata.avatar_url} 
    alt="Profile" 
    className="h-full w-full object-cover"
    onError={() => setAvatarError(true)}
  />
) : (
  <Cloud className="h-4 w-4 text-primary" />
)}
```

---

## Technical Notes

### Error Handling Pattern
All fixes follow a consistent pattern:
1. Track image load failure in state (`useState(false)`)
2. Reset error state when the source changes (via `useEffect` or key)
3. On `onError`, set state to true
4. Conditionally render fallback based on error state

### Content URI Considerations
For `content://` URIs on Android:
- These URIs may expire or become inaccessible
- The `ContentPreview` and `ShortcutCustomizer` components are most affected
- Fallback to emoji icons ensures a graceful experience

### Performance
- Error handlers are lightweight (single state update)
- No additional network requests or retries
- Fallbacks render immediately

---

## Files to Modify
1. `src/components/ContentPreview.tsx`
2. `src/components/ShortcutCustomizer.tsx`
3. `src/components/IconPicker.tsx`
4. `src/components/ShortcutActionSheet.tsx`
5. `src/components/MyShortcutsContent.tsx`
6. `src/components/BookmarkDragOverlay.tsx`
7. `src/components/ProfilePage.tsx`
8. `src/components/CloudBackupSection.tsx`

---

## Summary
This plan ensures that all image previews across the app:
- Have proper error handling
- Show meaningful fallback content
- Maintain a polished user experience even when images fail to load
