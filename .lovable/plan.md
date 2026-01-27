
# Enhanced Clipboard URL Detection with Multiple Actions

## Problem Statement

Currently, when a URL is detected from the clipboard, the `ClipboardSuggestion` component only offers a single action: **"Use this link"** which navigates directly to shortcut creation. 

In contrast, when a URL is shared to the app (via Android Share Sheet), the `SharedUrlActionSheet` provides three options:
1. **Quick Save** - Instantly save to library with auto-fetched metadata
2. **Edit & Save** - Save to library with custom title, description, and folder
3. **Create Shortcut** - Navigate to shortcut customization

The user expects the same flexibility for clipboard-detected URLs.

## Solution Overview

Enhance the `ClipboardSuggestion` component to provide multiple action options, similar to the `SharedUrlActionSheet` flow. Users will be able to:
- **Quick Save** - One-tap save to bookmark library
- **Edit & Save** - Save with custom metadata
- **Create Shortcut** - Current behavior (navigate to customization)
- **Schedule Reminder** - Create a timed reminder for this URL

## Implementation Approach

### Option A: Expand ClipboardSuggestion Inline (Recommended)

Transform the `ClipboardSuggestion` component from a simple two-button UI into a multi-action picker with expandable edit form, similar to `SharedUrlActionSheet` but optimized for the floating suggestion format.

**Pros:**
- Keeps the interaction in context without opening a separate sheet
- Maintains the swipe-to-dismiss gesture
- Consistent with the premium "frictionless" philosophy

**Cons:**
- Slightly more complex component
- May need to increase the auto-dismiss timer to give users time to choose

### Option B: Replace with SharedUrlActionSheet

When a clipboard URL is detected, show the `SharedUrlActionSheet` instead of `ClipboardSuggestion`.

**Pros:**
- Reuses existing component with all features
- Consistent behavior between shared URLs and clipboard URLs

**Cons:**
- More intrusive (full-screen overlay vs. floating suggestion)
- Loses the elegant swipe-to-dismiss gesture and auto-dismiss behavior

## Recommended Approach: Enhanced ClipboardSuggestion (Option A)

### UI Design

```text
CURRENT:
┌─────────────────────────────────────┐
│ [━━━━━ progress bar ━━━━━]          │
│ 📋 URL DETECTED                   ✕ │
│ youtube.com                         │
│ [  Dismiss  ] [ Use this link → ]   │
└─────────────────────────────────────┘

PROPOSED (Choose Mode):
┌─────────────────────────────────────┐
│ [━━━━━ progress bar ━━━━━]          │
│ 📋 URL DETECTED                   ✕ │
│ ┌─────────────────────────────────┐ │
│ │ 🎬 YouTube • youtube.com        │ │
│ │ Video Title (loading...)        │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [ ⚡ Quick Save ]                   │
│ [ ✏️ Edit & Save ] [ 📱 Shortcut ]  │
│ [ 🔔 Remind Later ]                 │
└─────────────────────────────────────┘

PROPOSED (Edit Mode):
┌─────────────────────────────────────┐
│ ← Save to Library                 ✕ │
│ ┌─────────────────────────────────┐ │
│ │ Title                           │ │
│ │ [___________________________] x │ │
│ │ Description (optional)          │ │
│ │ [___________________________]   │ │
│ │ Folder: [None][Work][Personal]  │ │
│ └─────────────────────────────────┘ │
│ [ 📚 Save to Library ]              │
└─────────────────────────────────────┘
```

### Technical Implementation

#### 1. Update ClipboardSuggestion Props

```typescript
interface ClipboardSuggestionProps {
  url: string;
  onCreateShortcut: (url: string) => void;
  onSaveToLibrary: (url: string, data?: { title?: string; description?: string; tag?: string | null }) => void;
  onCreateReminder: (url: string) => void;
  onDismiss: () => void;
}
```

#### 2. Add State Management

```typescript
// View modes
const [viewMode, setViewMode] = useState<'choose' | 'edit'>('choose');
const [showSuccess, setShowSuccess] = useState(false);

// Edit form state
const [editTitle, setEditTitle] = useState('');
const [editDescription, setEditDescription] = useState('');
const [editTag, setEditTag] = useState<string | null>(null);

// Metadata fetching
const { metadata, isLoading } = useUrlMetadata(url);
const { thumbnailUrl, platform: videoPlatform } = useVideoThumbnail(url);
```

#### 3. Increase Auto-dismiss Timer

Change from 8 seconds to 15 seconds to give users time to read options and make a choice.

#### 4. Add Action Buttons

- **Quick Save**: Call `onSaveToLibrary(url, { title: metadata?.title })` with success animation
- **Edit & Save**: Switch to edit mode with form fields
- **Shortcut**: Call `onCreateShortcut(url)`
- **Remind Later**: Call `onCreateReminder(url)`

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/ClipboardSuggestion.tsx` | Complete redesign with multi-action UI, edit form, metadata fetching |
| `src/components/AccessFlow.tsx` | Update `ClipboardSuggestion` usage with new callbacks |
| `public/locales/en.json` | Add new translation keys for clipboard actions |
| `public/locales/*.json` | Add translations for all supported languages |

### Detailed Changes

#### ClipboardSuggestion.tsx

1. **Add imports**: `useUrlMetadata`, `useVideoThumbnail`, `PlatformIcon`, `getAllFolders`, UI components
2. **Add viewMode state**: 'choose' or 'edit' 
3. **Add form state**: editTitle, editDescription, editTag
4. **Integrate metadata fetching**: Show title/favicon/thumbnail while user considers actions
5. **Implement Quick Save**: Success animation + callback
6. **Implement Edit & Save**: Form UI with folder selection
7. **Implement Remind Later**: New callback to AccessFlow
8. **Increase auto-dismiss**: 8s → 15s (or pause timer on interaction)

#### AccessFlow.tsx

1. **Update handleClipboardUse** → rename to `handleClipboardCreateShortcut`
2. **Add handleClipboardSaveToLibrary**: Save URL to library with optional metadata
3. **Add handleClipboardCreateReminder**: Create reminder destination and navigate

#### Translation Keys to Add

```json
"clipboard": {
  "detected": "URL Detected",
  "dismiss": "Dismiss",
  "useLink": "Use this link",
  "quickSave": "Quick Save",
  "editSave": "Edit & Save",
  "shortcut": "Shortcut",
  "remindLater": "Remind Later",
  "saveToLibrary": "Save to Library"
}
```

### Edge Cases

1. **Metadata loading**: Show skeleton while loading, enable Quick Save after load
2. **Offline mode**: Allow all actions but show offline indicator
3. **Edit mode back button**: Return to choose mode, don't dismiss
4. **Success state**: Show checkmark animation, then auto-dismiss

### Benefits

1. **Feature parity** with SharedUrlActionSheet
2. **Consistent UX** across share and clipboard detection
3. **More user control** over what happens with detected URLs
4. **Maintains elegance** of floating suggestion format
5. **Adds reminder scheduling** as a new pathway from detection

