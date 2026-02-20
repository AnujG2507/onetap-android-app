
# Text One-Tap Access — Updated Implementation Plan

## What Changed From the Previous Plan

The user has added three significant requirements:
1. **Markdown/formatting support** in the text editor and native viewer
2. **Cloud sync** for text shortcuts and text-based reminders
3. **Checklist with interactive task management** (check/uncheck persisted per-device, not per-shortcut-definition)
4. **Grid layout change**: 4 tiles in row 1, 3 tiles in row 2 (portrait)

The checklist clarification from the user ("manage tasks or create a checklist") means the viewer must support toggling items and persisting their state locally. The text definition stored in the shortcut/reminder describes the initial items; the checked state is a separate per-device record.

---

## Architecture Overview

```text
Creation (JS Layer)                 Viewer (Native)
────────────────────────────────    ──────────────────────────────
TextEditorStep (new)                TextProxyActivity.java (new)
  Plain text textarea                 Renders markdown via
  OR                                  MarkdownView library
  Checklist line-editor               OR native WebView
                                      Checklist state in
                                      SharedPreferences
```

### Markdown rendering on native Android

The native viewer (`TextProxyActivity`) will render the text content using a **WebView** that loads a minimal HTML page with a lightweight Markdown renderer (marked.js via CDN, or bundled in assets). This avoids adding a Java Markdown library dependency to the build. The WebView is minimal, offline-capable if marked.js is bundled, and handles both plain markdown and checklist rendering in one unified approach.

Checklist state (checked/unchecked) is stored in `SharedPreferences` keyed by `shortcut_id + item_index`. The initial state comes from the text content. This state is per-device and never synced.

---

## Database Migration Required

The existing `cloud_shortcuts` table needs one new column to store text content for cloud sync:

```sql
ALTER TABLE cloud_shortcuts 
ADD COLUMN text_content text NULL;
```

This column is `NULL` for all non-text shortcuts. For text shortcuts it holds the markdown/checklist source content (up to 2000 chars). The `supabaseTypes.ts` file is manually maintained, so it must be updated to match.

---

## Files to Create or Modify

| File | Type | Change |
|------|------|--------|
| `src/types/shortcut.ts` | Modify | Add `'text'` to `ShortcutType`; add `textContent?: string` to `ShortcutData` |
| `src/types/scheduledAction.ts` | Modify | Add `'text'` to `ScheduledActionDestinationType`; add `TextDestination` interface |
| `src/lib/supabaseTypes.ts` | Modify | Add `text_content: string \| null` to `cloud_shortcuts` Row/Insert/Update |
| `src/components/TextEditorStep.tsx` | **Create** | Full-screen text editor with markdown toolbar + checklist mode |
| `src/components/ContentSourcePicker.tsx` | Modify | Add Text `GridButton` (7th tile); change portrait grid to `grid-cols-4`; add `'text'` to `ActivePicker`; add `onSelectText` prop |
| `src/components/AccessFlow.tsx` | Modify | Add `'text-editor'` to `AccessStep`; handle Text tile selection; render `TextEditorStep`; wire `createTextShortcut`; add `useSheetBackHandler` for text step |
| `src/hooks/useShortcuts.ts` | Modify | Add `createTextShortcut()` function |
| `src/lib/shortcutManager.ts` | Modify | Add `'text'` case in `buildContentIntent()` → `action: 'app.onetap.OPEN_TEXT'` |
| `src/lib/cloudSync.ts` | Modify | `uploadShortcutsInternal()`: include `text_content`; `downloadShortcutsInternal()`: restore `textContent`; text shortcuts are **never** dormant on download |
| `src/components/MyShortcutsContent.tsx` | Modify | Add `'text'` to `TypeFilter`; add type label for text; render `📝` icon fallback |
| `src/components/ShortcutEditSheet.tsx` | Modify | Add `textContent` to editable fields; show `TextEditorStep` inline for text shortcuts; add `textContent` to `onSave` signature |
| `src/hooks/useShortcuts.ts` | Modify | Add `textContent` to `updateShortcut` allowed fields |
| `src/components/ScheduledActionCreator.tsx` | Modify | Add Text destination tile in destination selection step; add `'text-editor'` sub-step flow; add `TextDestination` support throughout |
| `src/i18n/locales/en.json` | Modify | Add translation strings (see below) |
| `native/.../TextProxyActivity.java` | **Create** | Full-screen WebView viewer with markdown + checklist support; back = finish |
| `native/.../AndroidManifest.xml` | Modify | Register `TextProxyActivity` |
| `native/.../NotificationClickActivity.java` | Modify | Add `"text"` case → launch `TextProxyActivity` |
| `native/.../plugins/ShortcutPlugin.java` | Modify | Route `app.onetap.OPEN_TEXT` intent to `TextProxyActivity` |

---

## Grid Layout Change (Portrait: 4+3)

The `ContentSourcePicker` primary grid changes from `grid-cols-3 landscape:grid-cols-6` to `grid-cols-4 landscape:grid-cols-7`.

The 7 tiles in order (matching portrait row layout):
- Row 1: Photo | Video | Audio | Document
- Row 2: Contact | Link | **Text**

The `activePicker` type union gains `'text'`. When the Text tile is tapped, the same `ActionModePicker` appears (One Tap Access vs One Tap Reminder). Text does not need the contact-mode toggle.

---

## TextEditorStep Component Design

```text
┌─────────────────────────────────────┐
│ ←    Write your text                │  ← pt-header-safe px-5 pb-4
├─────────────────────────────────────┤
│  [ Note  |  Checklist ]             │  ← segmented control (2 modes)
│                                     │
│  Markdown toolbar (Note mode only): │
│  [ B ] [ I ] [ H1 ] [ H2 ] [ — ]   │
│                                     │
│  ┌──────────────────────────────┐   │
│  │ Text area (max 2000 chars)   │   │  ← grows with content
│  │                              │   │
│  └──────────────────────────────┘   │
│  250 / 2000                         │  ← right-aligned
│                                     │
│  Checklist mode line editor:        │
│  [ ☐ Item 1            ] [x]        │
│  [ ☐ Item 2            ] [x]        │
│  [ + Add item ]                     │
│                                     │
│  Name: [_______________________]    │
│  Icon: [icon picker]                │
│                                     │
│  [Add to Home Screen]               │  ← fixed bottom
└─────────────────────────────────────┘
```

### Markdown toolbar (Note mode)
A minimal, non-overwhelming formatting toolbar sits above the textarea offering:
- **B** (wraps selection with `**`)
- **I** (wraps selection with `_`)
- **H** (inserts `# ` at line start)
- `—` (horizontal rule `---`)

No full rich-text editor. The textarea stores raw markdown. The toolbar just inserts syntax at the cursor.

### Checklist mode
Items are stored as plain text lines with a prefix:
- Unchecked: `☐ Item text`
- Checked (set by viewer): `☑ Item text`

The editor shows each item as an editable line with a delete button. "Add item" appends a new line. The stored text is the joined lines.

On the viewer side, `TextProxyActivity` reads the text, detects the `☐/☑` prefix pattern, and renders interactive checkboxes. The checked state is toggled in the WebView and persisted in `SharedPreferences` as `checked_<shortcutId>_<itemIndex>`. The shortcut definition (`textContent`) is never modified by the viewer.

---

## Cloud Sync Changes

### Upload (`uploadShortcutsInternal`)
Text shortcuts include their `textContent` in the upload. Since `isFileDependentType('text')` returns `false`, the `content_uri` is stored as `null` (consistent with the existing logic). `text_content` maps to the new column.

```typescript
// Addition to the upsert object for text type
text_content: shortcut.type === 'text' ? (shortcut.textContent || null) : null,
```

### Download (`downloadShortcutsInternal`)
Text shortcuts are reconstructed with `syncState: undefined` (active, never dormant — text content travels with the cloud row). `textContent` is populated from `cloud.text_content`.

### Scheduled Actions Sync
`TextDestination` is serialised as JSON into the `destination` JSONB column (same as all other destination types). No new column is needed in `cloud_scheduled_actions`. The download side reconstructs the `TextDestination` object including its `text` field.

---

## Native: TextProxyActivity Design

```java
// TextProxyActivity.java
// 
// Receives via Intent extras:
//   shortcut_id       (string) — for checklist state keying + NativeUsageTracker
//   text_content      (string) — markdown or checklist source text (<2KB, safe)
//   is_checklist      (boolean) — whether to render as checklist
//
// Renders:
//   Full-screen WebView
//   Loads minimal HTML template from assets/text_viewer.html
//   Passes text_content and is_checklist into JS context
//   text_viewer.html uses marked.js (bundled in assets/js/) for rendering
//
// Checklist interaction:
//   WebView evaluates JS to toggle checkbox state
//   Calls Android.saveCheckboxState(id, checked) via JavascriptInterface
//   Java side saves to SharedPreferences keyed by shortcut_id + item index
//
// On open:
//   NativeUsageTracker.recordTap(shortcutId, timestamp)
//
// Back press:
//   finish()
```

The `text_viewer.html` asset is a minimal file bundled in `assets/` in the APK. It references a bundled `marked.min.js` so it works fully offline without CDN.

---

## Data Flow: Shortcut Creation

```text
User taps "Text" tile in ContentSourcePicker
  → ActionModePicker shows ("One Tap Access" / "One Tap Reminder")
  → User selects "One Tap Access"
  → AccessFlow sets step = 'text-editor'
  → TextEditorStep renders
  → User writes text (markdown or checklist), names it, picks icon
  → Taps "Add to Home Screen"
  → AccessFlow calls createTextShortcut(textContent, isChecklist, name, icon)
  → useShortcuts.createTextShortcut() builds ShortcutData:
      { type: 'text', contentUri: '', textContent: '...', name, icon, ... }
  → saveShortcuts() → localStorage → widget sync → event dispatch
  → createHomeScreenShortcut(shortcut)
  → buildContentIntent() returns:
      { action: 'app.onetap.OPEN_TEXT', data: 'onetap://text/<id>',
        extras: { shortcut_id, text_content, is_checklist } }
  → Native plugin creates pinned shortcut → TextProxyActivity
  → AccessFlow sets step = 'success'
```

## Data Flow: Reminder Creation

```text
User taps "Text" tile → ActionModePicker → "One Tap Reminder"
  → AccessFlow calls onCreateReminder({ type: 'text', text: '...', name: '...' })
  → ScheduledActionCreator receives pre-filled TextDestination
    (skips destination step, goes to timing step)
  → At fire time: NotificationHelper builds notification with reminder name
  → User taps notification → NotificationClickActivity → 'text' case
      → Intent to TextProxyActivity with text_content + shortcut_id extras
```

Alternatively, when Text is selected from the ScheduledActionCreator destination step (without pre-fill), a `'text-editor'` sub-step renders within the creator flow — identical to the shortcut editor but without the icon picker, since reminders don't need icons.

---

## Type System Changes

### `src/types/shortcut.ts`
```typescript
export type ShortcutType = 'file' | 'link' | 'contact' | 'message' | 'slideshow' | 'text';

// In ShortcutData:
textContent?: string;      // Raw markdown or checklist text (up to 2000 chars)
isChecklist?: boolean;     // Whether content is rendered as checklist
```

### `src/types/scheduledAction.ts`
```typescript
export type ScheduledActionDestinationType = 'file' | 'url' | 'contact' | 'text';

export interface TextDestination {
  type: 'text';
  text: string;               // Markdown or checklist source
  name: string;               // Display name
  isChecklist?: boolean;
}

export type ScheduledActionDestination = 
  | FileDestination 
  | UrlDestination 
  | ContactDestination
  | TextDestination;
```

### `isFileDependentType()` in `src/types/shortcut.ts`
Returns `false` for `'text'`. Text is self-contained.

### Cloud sync — `src/lib/supabaseTypes.ts`
Manually add `text_content: string | null` to `cloud_shortcuts` Row, Insert, and Update types.

---

## MyShortcutsContent Changes

The `TypeFilter` union gains `'text'`. A new "Text" filter chip appears in the filter bar. `getShortcutTypeLabel()` returns `t('shortcuts.filterText')` for text shortcuts. `ShortcutIcon` renders `📝` as the fallback emoji for text shortcuts that have no custom icon.

---

## ShortcutEditSheet Changes

For text shortcuts, the edit sheet shows:
- Name field (existing)
- Icon picker (existing)
- A "Edit text content" section with `TextEditorStep` rendered inline (or as a sub-sheet)

The `onSave` signature gains `textContent` in its allowed update fields. `updateShortcut` in `useShortcuts.ts` allows `textContent` and `isChecklist`.

When text content changes on edit, the shortcut's `textContent` is updated in localStorage. The next time the home screen shortcut is tapped, it fires the stored intent which still has the original text in extras — this means after editing the text content, the user needs the shortcut to be **re-added to the home screen** (same constraint as file reconnection). A banner similar to the dormant reconnect flow informs the user.

---

## ScheduledActionCreator Changes

In the destination selection step, a new "Text" option row is added alongside File, Link, and Contact. Tapping it opens a `'text-editor'` sub-step that renders `TextEditorStep` without the icon picker. On confirm, it constructs a `TextDestination` and calls `handleDestinationSelect`.

`getSuggestedName()` gains a `'text'` case returning the first line of the text content (trimmed to 40 chars), or `"Text note"` as fallback.

---

## i18n Strings to Add (en.json)

```json
{
  "access": {
    "text": "Text"
  },
  "textEditor": {
    "title": "Write your text",
    "noteMode": "Note",
    "checklistMode": "Checklist",
    "placeholder": "Write anything — a note, a checklist, a routine...",
    "checklistPlaceholder": "One item per line",
    "charCount": "{{count}}/2000",
    "addItem": "+ Add item",
    "addToHomeScreen": "Add to Home Screen",
    "creating": "Adding...",
    "editTitle": "Edit text"
  },
  "shortcuts": {
    "filterText": "Text"
  },
  "scheduledActions": {
    "textTitle": "Text note",
    "textDesc": "A note, checklist, or message to display"
  }
}
```

---

## What Must NOT Be Done

| Rule | Reason |
|------|--------|
| No full rich-text WYSIWYG editor | Scope creep; toolbar syntax insertion is sufficient |
| No "view all notes" screen | Violates product ideology — text is an access point, not a notes app |
| No type change after creation | Type is immutable once set; UI should disable type selector on edit |
| No automatic checklist reset | State is per-device in SharedPreferences; user manages their own state |
| No automatic sync of checklist checked state | Checked state is local intent, not data |
| No cloud sync of linked files via text shortcuts | Text is fully self-contained; no file handling needed |
| No online requirement for text shortcuts | All content is inline — works fully offline |
| No markdown preview in the editor | Raw textarea with toolbar is sufficient; preview is the native viewer |

---

## Technical Implementation Sequence

1. **Database migration**: Add `text_content` column to `cloud_shortcuts` → update `supabaseTypes.ts`
2. **Types**: Update `shortcut.ts` and `scheduledAction.ts`
3. **TextEditorStep component**: Build the editor UI (markdown toolbar + checklist mode)
4. **ContentSourcePicker**: Add Text tile + `grid-cols-4` portrait layout
5. **AccessFlow**: Wire up `'text-editor'` step + `createTextShortcut` handler
6. **useShortcuts**: Add `createTextShortcut()` function
7. **shortcutManager**: Add `'text'` case in `buildContentIntent()`
8. **cloudSync**: Extend upload/download for text content field
9. **MyShortcutsContent**: Add text type filter + label + icon fallback
10. **ShortcutEditSheet**: Add text content editing support
11. **ScheduledActionCreator**: Add Text destination tile + sub-step
12. **i18n**: Add translation strings
13. **Native TextProxyActivity**: Create Java activity + HTML/JS assets
14. **AndroidManifest**: Register TextProxyActivity
15. **NotificationClickActivity**: Add text case
16. **ShortcutPlugin.java**: Route OPEN_TEXT intent
