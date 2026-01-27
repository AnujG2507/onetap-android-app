
# Add Settings Access to App Menu

## Overview
Add a "Settings" navigation button to the App Menu that allows users to access the full Settings page from anywhere in the app, not just from the Profile tab header.

## Current State
- **App Menu** contains: Trash, Cloud Backup, and Theme selection
- **Settings button** exists only in the Profile tab header
- Settings page is only accessible from the Profile tab

## Proposed Changes

### 1. Update AppMenu Props
Add an `onOpenSettings` callback to the `AppMenuProps` interface:

```text
interface AppMenuProps {
  onOpenTrash: () => void;
  onOpenSettings: () => void;  // NEW
}
```

### 2. Add Settings Button to AppMenu
Add a Settings navigation item between Trash and Cloud Backup sections:

```text
┌─────────────────────┐
│ Menu                │
├─────────────────────┤
│ 🗑️ Trash         [3] │
│ ⚙️ Settings       → │
│ ☁️ Cloud Backup      │
├─────────────────────┤
│ Appearance          │
│ [Light][Dark][Sys]  │
└─────────────────────┘
```

The Settings button will:
- Use a similar styling to the Trash button (icon in colored background, label, chevron indicator)
- Trigger `onOpenSettings` callback when clicked
- Close the menu first, then open settings (with delay for smooth transition)

### 3. Update All AppMenu Consumers
Pass the `onOpenSettings` prop to AppMenu wherever it's used:

**Files to update:**
- `src/components/ProfilePage.tsx` - Already has settings state, just pass callback
- Any other components using AppMenu (need to verify)

---

## Technical Details

### AppMenu.tsx Changes

**Add import:**
```typescript
import { Settings, ChevronRight } from 'lucide-react';
```

**Update props interface:**
```typescript
interface AppMenuProps {
  onOpenTrash: () => void;
  onOpenSettings: () => void;
}
```

**Add Settings button after Trash (around line 153):**
```tsx
{/* Settings */}
<Button
  variant="ghost"
  className="w-full justify-start h-12 ps-3 pe-3"
  onClick={() => handleMenuItem(onOpenSettings)}
>
  <div className="flex items-center gap-3 flex-1">
    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
      <Settings className="h-4 w-4 text-muted-foreground" />
    </div>
    <span className="font-medium">{t('settings.title')}</span>
  </div>
  <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
</Button>
```

### ProfilePage.tsx Changes

Update the AppMenu usage to pass settings callback:
```tsx
<AppMenu 
  onOpenTrash={() => setIsTrashOpen(true)} 
  onOpenSettings={() => setShowSettings(true)}
/>
```

This applies to both signed-in and signed-out states (lines ~263 and ~349).

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/AppMenu.tsx` | Add Settings icon import, update props, add Settings button |
| `src/components/ProfilePage.tsx` | Pass `onOpenSettings` callback to AppMenu |

## Benefits

1. **Consistent access** - Settings accessible from any tab via the menu
2. **Quick settings remain** - Theme toggle stays in menu for convenience
3. **Full settings available** - One tap to access all configuration options
4. **Follows differentiated strategy** - Quick settings in menu, full settings via navigation
