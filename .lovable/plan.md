
# Plan: Auto-Update Shortcuts on Home Screen When Edited

## Overview

When a user edits a shortcut (changing name or icon), the home screen icon will update automatically in-place, preserving its position. The "Re-Add to Home Screen" button will be kept as a fallback option.

## What Will Change

### User Experience
1. Edit a shortcut's name or icon in the app
2. Tap "Save"
3. The home screen icon updates automatically (same position)
4. No need to manually re-add the shortcut
5. "Re-Add to Home Screen" button remains available as a fallback

### Files to Modify

| File | Change |
|------|--------|
| `ShortcutPlugin.java` | Add `updatePinnedShortcut()` method |
| `ShortcutPlugin.ts` | Add TypeScript interface |
| `shortcutPluginWeb.ts` | Add web fallback stub |
| `useShortcuts.ts` | Call native update when saving |
| `ShortcutEditSheet.tsx` | Update toast message |

## Technical Details

### 1. Native Android Method

Add `updatePinnedShortcut` to `ShortcutPlugin.java` that:
- Takes shortcut ID, new label, and icon data
- Uses existing `createEmojiIcon`, `createTextIcon`, and `createBitmapIcon` helpers
- Calls `ShortcutManager.updateShortcuts()` to update in-place

```java
@PluginMethod
public void updatePinnedShortcut(PluginCall call) {
    String id = call.getString("id");
    String label = call.getString("label");
    String iconEmoji = call.getString("iconEmoji");
    String iconText = call.getString("iconText");
    String iconData = call.getString("iconData");
    
    // Create icon using existing helpers
    Icon icon;
    if (iconData != null) {
        icon = createBitmapIcon(iconData);
    } else if (iconEmoji != null) {
        icon = createEmojiIcon(iconEmoji);
    } else if (iconText != null) {
        icon = createTextIcon(iconText);
    } else {
        icon = defaultIcon;
    }
    
    // Build updated ShortcutInfo with same ID
    ShortcutInfo updatedInfo = new ShortcutInfo.Builder(context, id)
        .setShortLabel(label)
        .setLongLabel(label)
        .setIcon(icon)
        .build();
    
    // Update in-place (preserves position)
    shortcutManager.updateShortcuts(Collections.singletonList(updatedInfo));
}
```

### 2. TypeScript Plugin Interface

```typescript
updatePinnedShortcut(options: {
    id: string;
    label: string;
    iconEmoji?: string;
    iconText?: string;
    iconData?: string;
}): Promise<{ success: boolean; error?: string }>;
```

### 3. Hook Integration

Modify `updateShortcut` in `useShortcuts.ts` to call native update:

```typescript
const updateShortcut = useCallback(async (id, updates) => {
    // Update localStorage first
    const updated = shortcuts.map(s => 
        s.id === id ? { ...s, ...updates } : s
    );
    saveShortcuts(updated);
    
    // Update home screen shortcut if name or icon changed
    if (Capacitor.isNativePlatform() && (updates.name || updates.icon)) {
        const shortcut = updated.find(s => s.id === id);
        if (shortcut) {
            await ShortcutPlugin.updatePinnedShortcut({
                id,
                label: shortcut.name,
                iconEmoji: shortcut.icon.type === 'emoji' ? shortcut.icon.value : undefined,
                iconText: shortcut.icon.type === 'text' ? shortcut.icon.value : undefined,
                iconData: shortcut.icon.type === 'thumbnail' ? shortcut.icon.value : undefined,
            });
        }
    }
}, [shortcuts, saveShortcuts]);
```

### 4. UI Changes

Update `ShortcutEditSheet.tsx`:
- Remove the "re-add hint" from the toast since updates happen automatically
- Keep the "Re-Add to Home Screen" button as a manual fallback option
- Button still shows when icon/name changed for users who want to force re-creation

## Why Keep the Re-Add Button?

1. **Fallback**: Some custom launchers may not refresh immediately
2. **User Control**: Users can manually recreate if update doesn't work
3. **No Downside**: It's optional and doesn't interfere with auto-update

## Android API Notes

- `ShortcutManager.updateShortcuts()` requires API 25+ (Android 7.1)
- App already requires API 26+ (Android 8.0) for pinned shortcuts
- Update only changes label/icon - the underlying intent stays the same
- Most modern launchers support this API correctly
