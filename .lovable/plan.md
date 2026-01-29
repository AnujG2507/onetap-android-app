
# Plan: Search and Filter for My Shortcuts List

## Overview

Add search and filter functionality to the My Shortcuts list, following the established patterns from the Reminders and Library tabs.

## User Experience

| Feature | Description |
|---------|-------------|
| **Search** | Filter shortcuts by name, target (URL/phone), or type |
| **Type Filters** | Chip bar to filter by: All, Links, Files, WhatsApp, Contacts |
| **Sort Options** | Most Used (default), Newest, A-Z |
| **Clear Filters** | Quick link to reset all filters when active |
| **Result Count** | Shows "X shortcuts" when filtering |

## Filter Categories

Based on `ShortcutType` and `fileType`:

| Filter | Includes |
|--------|----------|
| **All** | All shortcuts |
| **Links** | `type === 'link'` |
| **Files** | `type === 'file'` (images, videos, PDFs, documents) |
| **WhatsApp** | `type === 'message'` with `messageApp === 'whatsapp'` |
| **Contacts** | `type === 'contact'` (direct dial) |

## Sort Modes

| Mode | Behavior |
|------|----------|
| **Most Used** | By `usageCount` descending (current default) |
| **Newest** | By `createdAt` descending |
| **A-Z** | Alphabetical by name |

## UI Layout

```
┌────────────────────────────────────────────────┐
│  My Shortcuts                        [↻] [×]   │  ← Header with sync + close
├────────────────────────────────────────────────┤
│  [🔍 Search shortcuts...              ][×]     │  ← Search input
│                                                │
│  (All) (Links) (Files) (WhatsApp) (Contacts)   │  ← Type filter chips
│                                                │
│  Sort: [📊] [🕐] [A-Z]    5 shortcuts          │  ← Sort controls + count
├────────────────────────────────────────────────┤
│  [Shortcut items...]                           │  ← Scrollable list
└────────────────────────────────────────────────┘
```

## Technical Implementation

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/ShortcutsList.tsx` | Add search, filter chips, sort controls, and filtering logic |
| `src/i18n/locales/en.json` | Add translation keys for new UI elements |

### State Management

```typescript
// New state in ShortcutsList
const [searchQuery, setSearchQuery] = useState('');
const [typeFilter, setTypeFilter] = useState<'all' | 'link' | 'file' | 'whatsapp' | 'contact'>('all');
const [sortMode, setSortMode] = useState<'usage' | 'newest' | 'alphabetical'>('usage');
```

### Filter Logic

```typescript
const filteredShortcuts = useMemo(() => {
  let result = [...shortcuts];
  
  // Type filter
  if (typeFilter !== 'all') {
    result = result.filter(s => {
      if (typeFilter === 'whatsapp') return s.type === 'message' && s.messageApp === 'whatsapp';
      if (typeFilter === 'contact') return s.type === 'contact';
      if (typeFilter === 'link') return s.type === 'link';
      if (typeFilter === 'file') return s.type === 'file';
      return true;
    });
  }
  
  // Search filter
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    result = result.filter(s => 
      s.name.toLowerCase().includes(query) ||
      s.contentUri?.toLowerCase().includes(query) ||
      s.phoneNumber?.includes(query)
    );
  }
  
  // Sort
  result.sort((a, b) => {
    switch (sortMode) {
      case 'usage': return (b.usageCount || 0) - (a.usageCount || 0);
      case 'newest': return b.createdAt - a.createdAt;
      case 'alphabetical': return a.name.localeCompare(b.name);
    }
  });
  
  return result;
}, [shortcuts, typeFilter, searchQuery, sortMode]);
```

### Type Filter Chips

Following the NotificationsPage pattern with counts:

```typescript
const TYPE_FILTERS = [
  { value: 'all', labelKey: 'shortcuts.filterAll', icon: null },
  { value: 'link', labelKey: 'shortcuts.filterLinks', icon: <Link2 /> },
  { value: 'file', labelKey: 'shortcuts.filterFiles', icon: <FileIcon /> },
  { value: 'whatsapp', labelKey: 'shortcuts.filterWhatsApp', icon: <MessageCircle /> },
  { value: 'contact', labelKey: 'shortcuts.filterContacts', icon: <Phone /> },
];
```

### Translation Keys to Add

```json
"shortcuts": {
  "title": "My Shortcuts",
  "empty": "No shortcuts yet",
  "emptyDesc": "Create shortcuts from the Access tab",
  "taps": "taps",
  "tap": "tap",
  "searchPlaceholder": "Search shortcuts...",
  "filterAll": "All",
  "filterLinks": "Links",
  "filterFiles": "Files",
  "filterWhatsApp": "WhatsApp",
  "filterContacts": "Contacts",
  "sortMostUsed": "Most used",
  "sortNewest": "Newest",
  "sortAZ": "A-Z",
  "searchResults": "{{count}} shortcuts",
  "noMatch": "No shortcuts match your filter",
  "clearFilters": "Clear filters"
}
```

### Empty State Handling

- **No shortcuts at all**: Show existing empty state
- **No matches for filter**: Show "No shortcuts match your filter" with "Clear filters" button

## Component Structure

```
ShortcutsList
├── SheetHeader (title + sync + close)
├── Search Input (with clear button)
├── Type Filter Chips (horizontal scroll)
├── Sort Controls + Result Count
├── ScrollArea
│   ├── Shortcut Items (filtered)
│   └── Empty/No Match State
└── Action/Edit Sheets
```

## Persistence

Sort preferences will be persisted to localStorage following the Library pattern:
- `shortcuts_sort_mode`: 'usage' | 'newest' | 'alphabetical'
