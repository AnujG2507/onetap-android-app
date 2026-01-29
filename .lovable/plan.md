

# Plan: Add ShortcutsList Component with Usage Count Sorting

## Overview

Add an in-app shortcuts list view so users can see and manage all their created One Tap Access shortcuts from within the app. The list will display usage count prominently and sort by most-used shortcuts by default.

## Key Features

- **Usage Count Column**: Each shortcut displays its total tap count
- **Default Sort**: Sorted by usage count (descending) - most used shortcuts appear first
- **Menu Integration**: Accessible from the hamburger menu as "My Shortcuts"
- **Action Menu**: Tap any shortcut to access Open, Edit, Delete, or Create Reminder options

## UI Design

### Menu Entry (AppMenu)
- New "My Shortcuts" button between Trash and Settings
- Icon: `Zap` (consistent with Access tab)
- Badge showing total shortcut count

### List Item Layout
```
┌─────────────────────────────────────────────────────┐
│  [Icon]  Shortcut Name                    42 taps  │
│          WhatsApp · Mom                        >   │
└─────────────────────────────────────────────────────┘
```

Each item shows:
- **Icon** (48x48): Emoji, thumbnail, or text
- **Name**: Primary text
- **Type + Target**: Secondary text (e.g., "WhatsApp · Mom", "Link · google.com")
- **Usage Count**: Right-aligned badge showing tap count
- **Chevron**: Visual affordance for tap action

### Empty State
- Large `Zap` icon
- "No shortcuts yet" title
- "Create shortcuts from the Access tab" description

## Technical Implementation

### Files to Create

**`src/components/ShortcutsList.tsx`**
```typescript
// Key implementation details:

// 1. Sort shortcuts by usage count (descending)
const sortedShortcuts = useMemo(() => {
  return [...shortcuts].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
}, [shortcuts]);

// 2. Display usage count badge
<Badge variant="secondary" className="shrink-0">
  {shortcut.usageCount || 0} {t('shortcuts.taps')}
</Badge>
```

### Files to Modify

**`src/components/AppMenu.tsx`**
- Add `onOpenShortcuts` prop to interface
- Add "My Shortcuts" menu button with Zap icon
- Show shortcut count badge
- Read count from localStorage on mount/open

**`src/pages/Index.tsx`**
- Add `shortcutsListOpen` state
- Pass handler to AppMenu
- Render ShortcutsList sheet
- Wire up action handlers from ShortcutActionSheet

**`src/i18n/locales/en.json`**
Add keys:
- `menu.shortcuts`: "My Shortcuts"
- `shortcuts.title`: "My Shortcuts"
- `shortcuts.empty`: "No shortcuts yet"
- `shortcuts.emptyDesc`: "Create shortcuts from the Access tab"
- `shortcuts.taps`: "taps"
- `shortcuts.tap`: "tap"

## Component Structure

```
ShortcutsList
├── Sheet (full-height)
│   ├── SheetHeader
│   │   └── SheetTitle: "My Shortcuts"
│   ├── ScrollArea
│   │   └── sortedShortcuts.map(shortcut =>
│   │       └── ShortcutItem
│   │           ├── Icon (emoji/thumbnail/text)
│   │           ├── Name + Type
│   │           ├── Usage Badge ("42 taps")
│   │           └── Chevron
│   │       )
│   └── Empty State (when no shortcuts)
└── ShortcutActionSheet (reused)
```

## Data Flow

1. `useShortcuts()` provides shortcuts array with `usageCount` field
2. `ShortcutsList` sorts by `usageCount` descending
3. Each item displays count in a subtle badge
4. Tapping opens `ShortcutActionSheet` for actions
5. After edit/delete, list automatically updates (React state)

## Implementation Order

1. Add translation keys to `en.json`
2. Create `ShortcutsList.tsx` with sorted list and usage badges
3. Update `AppMenu.tsx` with new menu item
4. Integrate in `Index.tsx` with sheet state management

