# OneTap Shortcuts - Complete App Summary

## Product Philosophy
**"One tap to what matters. Nothing else."**

A local-first Android app that lets users create home screen shortcuts for quick access to URLs, contacts, and scheduled reminders. The app prioritizes user sovereignty—local device intent is always authoritative.

---

## Core Features

### 1. One Tap Access (Shortcuts)
- Create Android home screen shortcuts for URLs, contacts (call/message), or apps
- Custom icons: emoji, uploaded images, contact photos, or auto-generated initials
- Native Android implementation via Capacitor plugin (`ShortcutPlugin.java`)

### 2. Bookmark Library
- Save URLs with metadata (title, description, folder/tag)
- Drag-and-drop folder organization
- Selection mode for bulk operations
- Soft-delete with configurable retention (7/14/30/60 days)

### 3. One Tap Reminders (Scheduled Actions)
- Schedule future shortcuts with date/time/recurrence
- Native Android notifications via `NotificationHelper.java`
- Persists across device reboots (`BootReceiver.java`)

### 4. Cloud Sync (Optional)
- Google OAuth authentication
- Bidirectional sync: local ↔ cloud
- **Local is source of truth**—cloud is additive-only

---

## Technical Architecture

### Frontend Stack
- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** with semantic design tokens
- **shadcn/ui** components
- **Capacitor** for native Android bridge
- **i18next** for internationalization

### Backend (Lovable Cloud/Supabase)
- **Tables**: `cloud_bookmarks`, `cloud_trash`
- **Edge Functions**: `fetch-url-metadata`, `delete-account`
- **Auth**: Google OAuth with native deep link handling

### Native Android Layer
- `ShortcutPlugin.java`: Home screen shortcut creation
- `NotificationHelper.java`: Scheduled notifications
- `ScheduledActionReceiver.java`: Alarm handling
- `BootReceiver.java`: Reschedule after reboot

---

## Data Model

### Local Storage Keys
```
saved_links          → SavedLink[]      (bookmarks)
saved_links_trash    → TrashedLink[]    (soft-deleted)
scheduled_actions    → ScheduledAction[] (reminders)
onetap_settings      → AppSettings
sync_status          → SyncStatus
```

### SavedLink
```typescript
{
  id: string;           // UUID, canonical entity_id
  url: string;          // Original URL preserved
  title: string;
  description: string;
  tag: string | null;   // Folder name
  createdAt: number;    // Unix timestamp
  isShortlisted: boolean;
}
```

### Cloud Schema
```sql
cloud_bookmarks (
  id UUID PRIMARY KEY,
  entity_id UUID UNIQUE,  -- Maps to local id
  user_id UUID,
  url TEXT,
  title TEXT,
  folder TEXT,
  created_at TIMESTAMPTZ
)
-- RLS: Users can only access their own data
```

---

## Sync Architecture

### Design Principles
1. **Local sovereignty**: Device intent is never overridden
2. **Additive-only**: Cloud never deletes local data
3. **Idempotent uploads**: `onConflict: 'user_id,entity_id'`
4. **No background workers**: Sync triggers on user actions only

### Sync Flow
```
Local Change Detected
    ↓
Mark hasPendingChanges = true
    ↓
Debounce 3s (min 30s interval)
    ↓
Upload (upsert by entity_id)
    ↓
Download (skip existing IDs)
    ↓
Mark synced + update timestamp
```

### Retry Triggers
- **Foreground return**: `visibilitychange` event
- **Network reconnect**: Online event after offline
- No polling, no timers, no manual retry buttons

### Conflict Resolution
| Scenario | Behavior |
|----------|----------|
| Same URL, different entity_ids | Both coexist (intentional duplicates) |
| Concurrent edits | Last-write-wins in cloud, locals preserved |
| Delete vs edit race | Deleted stays deleted, edit creates new |
| Restore race | First restore wins |

---

## Key Files

### Sync Logic
- `src/lib/cloudSync.ts` - Upload/download operations
- `src/lib/syncStatusManager.ts` - State tracking
- `src/hooks/useAutoSync.ts` - Orchestration + debounce
- `src/hooks/useSyncStatus.ts` - Retry on foreground/reconnect

### Data Management
- `src/lib/savedLinksManager.ts` - Bookmark CRUD
- `src/lib/scheduledActionsManager.ts` - Reminder CRUD
- `src/lib/settingsManager.ts` - User preferences

### Native Bridge
- `src/plugins/ShortcutPlugin.ts` - Capacitor interface
- `native/android/app/.../ShortcutPlugin.java` - Native implementation

### Auth
- `src/hooks/useAuth.ts` - Auth state + Google OAuth
- `src/lib/oauthCompletion.ts` - Deep link handling
- `src/pages/AuthCallback.tsx` - Web callback handler

---

## UI Structure

### Navigation (4 tabs)
1. **Access** (Zap) - Create shortcuts
2. **Reminders** (Bell) - Scheduled actions
3. **Bookmarks** (Bookmark) - Library
4. **Profile** (User) - Settings + sync

### Key Components
- `BookmarkLibrary.tsx` - Main library view
- `ScheduledActionCreator.tsx` - Reminder creation
- `ShortcutCustomizer.tsx` - Shortcut configuration
- `CloudBackupSection.tsx` - Sync controls
- `SyncStatusIndicator.tsx` - Ambient sync status dot

---

## Offline Behavior
- All features work offline (local storage)
- Metadata fetching skipped when offline
- Amber indicator shows pending changes
- Auto-retry when connectivity returns

---

## Platform Constraints
- **Android only** - iOS lacks shortcut creation APIs
- No PWA mode - Native features required
- No background sync - Android battery restrictions

---

## Settings
```typescript
{
  clipboardDetectionEnabled: boolean;  // Auto-detect URLs
  trashRetentionDays: 7|14|30|60;
  autoSyncEnabled: boolean;
  scheduledRemindersEnabled: boolean;
  reminderSoundEnabled: boolean;
  pipModeEnabled: boolean;  // Video PiP
}
```

---

## API Endpoints

### Edge Functions
- `POST /fetch-url-metadata` - Fetches title/favicon for URLs (CORS bypass)
- `POST /delete-account` - Deletes user account and all associated data

---

## Security
- Row Level Security (RLS) on all cloud tables
- Users can only access their own data
- OAuth tokens stored securely via Supabase Auth
- No sensitive data in localStorage beyond user preferences

---

*Last updated: January 2026*
