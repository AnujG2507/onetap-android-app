

# Sync Redesign With Dormant Access Points

## Overview

This plan introduces a new cloud table (`cloud_shortcuts`) to sync shortcut intent metadata, a `dormant` state for file-dependent access points, cloud-side deletion via a `deleted_entity_ids` table, native alarm re-registration on download, and privacy corrections -- all without uploading any files or binary data.

---

## 1. Database Schema Changes

### New Table: `cloud_shortcuts`

Stores the intent metadata for all shortcut types. No binary data, no file paths, no thumbnails.

```text
cloud_shortcuts
  id              UUID        PK, auto
  user_id         UUID        NOT NULL
  entity_id       TEXT        NOT NULL  (local shortcut ID)
  type            TEXT        NOT NULL  (link, file, contact, message, slideshow)
  name            TEXT        NOT NULL
  content_uri     TEXT        NULL      (URL for links; NULL for file-based)
  file_type       TEXT        NULL      (image, video, pdf, document -- for dormant display)
  mime_type       TEXT        NULL      (for re-attach matching)
  phone_number    TEXT        NULL      (for contact/message shortcuts)
  contact_name    TEXT        NULL
  message_app     TEXT        NULL      (whatsapp)
  quick_messages  JSONB       NULL      (array of draft strings)
  resume_enabled  BOOLEAN     NULL
  auto_advance_interval INT  NULL      (slideshows)
  image_count     INT         NULL      (slideshow image count, no URIs)
  icon_type       TEXT        NULL      (emoji, text, platform, favicon)
  icon_value      TEXT        NULL      (emoji char, text, platform key, favicon URL)
  usage_count     INT         DEFAULT 0
  original_created_at BIGINT  NOT NULL
  created_at      TIMESTAMPTZ DEFAULT now()
  updated_at      TIMESTAMPTZ DEFAULT now()
  UNIQUE(user_id, entity_id)
```

What is NOT stored:
- `thumbnailData` (binary)
- `contactPhotoUri` (device-local)
- `imageUris` / `imageThumbnails` (device-local binary)
- `originalPath` (device-local)
- `fileSize` (irrelevant for sync)
- `contentUri` for file/slideshow types (device-local)

RLS: Same 4-policy pattern (SELECT/INSERT/UPDATE/DELETE where `auth.uid() = user_id`).

### New Table: `cloud_deleted_entities`

Tracks permanently deleted entity IDs so they are never resurrected on future downloads.

```text
cloud_deleted_entities
  id              UUID        PK, auto
  user_id         UUID        NOT NULL
  entity_type     TEXT        NOT NULL  (bookmark, trash, shortcut, scheduled_action)
  entity_id       TEXT        NOT NULL
  deleted_at      TIMESTAMPTZ DEFAULT now()
  UNIQUE(user_id, entity_type, entity_id)
```

RLS: Same 4-policy pattern.

### Privacy Correction: `cloud_scheduled_actions.destination`

The existing `destination` JSONB stores phone numbers and contact names. This will be addressed by:
- Keeping phone numbers for contact-type destinations (required for restoration)
- Adding a comment in documentation justifying this: phone numbers are user-provided intent data, not scraped contacts
- No change to schema (breaking change risk too high for existing data)

---

## 2. Data Model Changes (TypeScript)

### New Type: `ShortcutSyncState`

Added to `src/types/shortcut.ts`:

```typescript
export type ShortcutSyncState = 'active' | 'dormant';
```

### Extended `ShortcutData`

Add optional field:

```typescript
syncState?: ShortcutSyncState;  // undefined = active (backward compat)
```

File-dependent shortcuts downloaded from cloud without a valid local file get `syncState: 'dormant'`.

### Helper: `isFileDependentType()`

```typescript
export function isFileDependentType(type: ShortcutType, fileType?: FileType): boolean {
  return type === 'file' || type === 'slideshow';
}
```

### Helper: `isDormant()`

```typescript
export function isDormant(shortcut: ShortcutData): boolean {
  return shortcut.syncState === 'dormant';
}
```

---

## 3. Sync Flow Redesign

### Upload Flow (Local to Cloud)

Existing behavior preserved. New additions:

1. **Shortcuts upload** -- new function `uploadShortcutsInternal()`:
   - Iterates `quicklaunch_shortcuts` from localStorage
   - For each shortcut, upserts to `cloud_shortcuts` with intent metadata only
   - File-based shortcuts: `content_uri` set to NULL (privacy)
   - Link shortcuts: `content_uri` set to the URL
   - Contact/message: phone_number and quick_messages synced
   - Icon: only `icon_type` and `icon_value` for emoji/text/platform/favicon. Thumbnail type -> icon_type = 'emoji', icon_value = file-type emoji fallback

2. **Deletion sync** -- new function `uploadDeletionsInternal()`:
   - When a shortcut or bookmark is permanently deleted locally, record in `cloud_deleted_entities`
   - On upload, also delete corresponding row from `cloud_shortcuts` / `cloud_bookmarks` / etc.

### Download Flow (Cloud to Local)

1. **Bookmarks/Trash** -- existing behavior unchanged (additive only)

2. **Shortcuts download** -- new function `downloadShortcutsInternal()`:
   - Fetch from `cloud_shortcuts` where user_id matches
   - Fetch from `cloud_deleted_entities` to get exclusion set
   - Skip entities that exist locally OR are in deleted set
   - For each new shortcut:
     - If `type` is `link`, `contact`, or `message`: create as **active** (fully restorable)
     - If `type` is `file` or `slideshow`: create as **dormant** (`syncState: 'dormant'`, `contentUri: ''`)
   - Save merged array to `quicklaunch_shortcuts` in localStorage

3. **Scheduled actions download** -- enhanced:
   - Existing download logic preserved
   - After download, for **non-file destinations** (url, contact): call `ShortcutPlugin.scheduleAction()` to register native alarms
   - For **file destinations**: download as `enabled: false` and mark in UI as dormant
   - Skip entities present in `cloud_deleted_entities`

4. **Deletion reconciliation**:
   - On download, fetch `cloud_deleted_entities` for current user
   - Remove any local entities that appear in the deleted set (prevents resurrection)

### Bidirectional Sync Order

```text
1. Upload bookmarks
2. Upload trash
3. Upload shortcuts (NEW)
4. Upload scheduled actions
5. Upload deletions (NEW)
6. Download bookmarks (skip deleted)
7. Download trash (skip deleted)
8. Download shortcuts (NEW, with dormant logic)
9. Download scheduled actions (with alarm re-registration)
10. Download deletion list (reconcile local)
```

---

## 4. Scheduled Actions: Alarm Re-registration

### Current Gap

Downloaded scheduled actions are saved to localStorage but native alarms are never registered.

### Fix

In `downloadScheduledActionsInternal()`, after saving new actions to localStorage:

```typescript
// For each newly downloaded action that is enabled:
for (const action of newActions) {
  if (!action.enabled) continue;

  const dest = action.destination;
  // File destinations cannot be restored -- leave disabled
  if (dest.type === 'file') {
    action.enabled = false;
    continue;
  }

  // Register native alarm
  try {
    await ShortcutPlugin.scheduleAction({
      id: action.id,
      name: action.name,
      description: action.description,
      destinationType: dest.type,
      destinationData: JSON.stringify(dest),
      triggerTime: action.triggerTime,
      recurrence: action.recurrence,
    });
  } catch (e) {
    console.warn('[CloudSync] Failed to register alarm for downloaded action:', action.id, e);
  }
}
```

This runs inside the sync function (already guarded, already async). No new background processes.

---

## 5. Dormant Access Points: UI Design

### Visual Treatment

Dormant shortcuts appear in the My Shortcuts list with:
- A **desaturated/muted** icon (CSS `opacity-40 grayscale`)
- A small **cloud-off or link-broken** badge icon overlay
- Subtitle text: "Tap to reconnect file" (calm, no error language)

### Reconnect Flow

When a dormant shortcut is tapped:
1. Open the existing `ContentSourcePicker` (file picker)
2. User selects a local file
3. Update the shortcut's `contentUri`, `mimeType`, `fileSize`, `thumbnailData`
4. Set `syncState` to `active` (or remove the field)
5. Offer to pin to home screen

### Dormant Scheduled Actions

In `ScheduledActionItem.tsx`:
- File-based actions with `enabled: false` and missing file show a "File needed" label
- Tapping opens a reconnect flow similar to shortcuts
- Once file is re-attached, the action is enabled and the native alarm is registered

### No New Screens

All dormant handling uses existing components (action sheets, file picker). No new pages.

---

## 6. Cloud Deletion & Orphan Prevention

### On Local Permanent Delete

When a bookmark is permanently deleted (expired from trash or user empties trash):
- Record `{ entity_type: 'bookmark', entity_id }` in `cloud_deleted_entities` (uploaded on next sync)
- Delete from `cloud_bookmarks` on next sync upload

When a shortcut is deleted:
- Record `{ entity_type: 'shortcut', entity_id }` in `cloud_deleted_entities`
- Delete from `cloud_shortcuts` on next sync upload

When a scheduled action is deleted:
- Record `{ entity_type: 'scheduled_action', entity_id }` in `cloud_deleted_entities`
- Delete from `cloud_scheduled_actions` on next sync upload

### On Download

Before adding any downloaded entity to local storage, check against:
1. Existing local IDs (current behavior)
2. `cloud_deleted_entities` for current user (new)

This prevents resurrection of deleted items.

### Local Storage for Pending Deletions

Between syncs, pending deletions are stored in `localStorage` key `pending_cloud_deletions` as an array of `{ entity_type, entity_id }`. Cleared after successful upload.

---

## 7. Privacy Boundaries (Enforced)

| Data Type | Synced? | Justification |
|-----------|---------|---------------|
| URL strings | Yes | User-provided intent, essential for restoration |
| Shortcut names | Yes | User-provided label |
| Shortcut type | Yes | Required for dormant/active classification |
| File type (pdf/image/video) | Yes | UX: shows what kind of file is needed |
| MIME type | Yes | Helps file picker filter correctly on reconnect |
| Phone numbers | Yes | User-provided intent for contact/WhatsApp shortcuts |
| Contact names | Yes | User-provided label |
| Quick messages | Yes | User-composed draft text |
| Icon emoji/text/platform | Yes | Non-sensitive display metadata |
| File contents | NEVER | Privacy policy, architecture constraint |
| Thumbnails (base64) | NEVER | Binary data, privacy |
| File paths / URIs | NEVER | Device-specific, useless cross-device |
| Contact photos | NEVER | Device-local, privacy |
| Image URIs (slideshow) | NEVER | Device-local content:// URIs |

---

## 8. Migration Strategy

### For Existing Users (Already Syncing)

- No breaking changes to `cloud_bookmarks`, `cloud_trash`, `cloud_scheduled_actions`
- `cloud_shortcuts` and `cloud_deleted_entities` are new tables -- no migration needed
- First sync after update will upload existing shortcuts to `cloud_shortcuts`
- No data loss possible

### For New Device Install

- Sign in triggers sync
- Bookmarks and trash restore as before
- Shortcuts appear: links/contacts as active, file-based as dormant
- Scheduled actions: URL/contact ones get alarms registered, file ones stay disabled
- Deleted entity list prevents resurrection

### Backward Compatibility

- `syncState` field is optional; `undefined` means active
- Old app versions that don't know about `cloud_shortcuts` simply won't sync shortcuts (no conflict)
- `cloud_deleted_entities` is additive; old versions won't write to it but also won't be harmed by it

---

## 9. File Changes Summary

| File | Change |
|------|--------|
| `src/types/shortcut.ts` | Add `ShortcutSyncState`, `syncState` field, helper functions |
| `src/lib/cloudSync.ts` | Add `uploadShortcutsInternal()`, `downloadShortcutsInternal()`, `uploadDeletionsInternal()`, deletion reconciliation, alarm re-registration in download |
| `src/lib/savedLinksManager.ts` | On permanent delete, record to pending deletions list |
| `src/lib/scheduledActionsManager.ts` | On delete, record to pending deletions list |
| `src/hooks/useShortcuts.ts` | On delete, record to pending deletions list |
| `src/lib/supabaseTypes.ts` | Add `cloud_shortcuts` and `cloud_deleted_entities` type definitions |
| `src/components/MyShortcutsContent.tsx` | Dormant visual treatment, tap-to-reconnect handler |
| `src/components/ShortcutActionSheet.tsx` | Show "Reconnect file" action for dormant shortcuts |
| `src/components/ScheduledActionItem.tsx` | Show dormant state for file-based actions |
| `src/components/ScheduledActionEditor.tsx` | Reconnect flow for dormant file destinations |
| `SUPABASE.md` | Document new tables, sync scope, dormant concept |
| `ARCHITECTURE.md` | Update data flow section with dormant state |
| `APP_SUMMARY.md` | Update sync description |

### New Files

| File | Purpose |
|------|---------|
| `src/lib/deletionTracker.ts` | Manage pending deletion records in localStorage, upload/download logic |

### Database Migration (External Project)

SQL to create `cloud_shortcuts` and `cloud_deleted_entities` tables with RLS policies. Must be applied manually to the external Supabase project.

---

## 10. What This Plan Does NOT Do

- Does not upload any files or binary data
- Does not add background sync or polling
- Does not change the sync guard philosophy (manual + daily auto only)
- Does not auto-recreate home screen shortcuts (user must pin manually)
- Does not introduce new screens or navigation
- Does not change the auth flow
- Does not modify the external Supabase client configuration

