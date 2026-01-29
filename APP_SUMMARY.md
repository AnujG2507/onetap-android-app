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
3. **Calm sync**: Intentional, not reactive—users never feel watched
4. **Runtime enforcement**: Philosophy enforced by guards, not convention

### Sync Triggers (Exhaustive List)
| Trigger | Condition | Frequency |
|---------|-----------|-----------|
| **Manual** | User presses "Sync Now" | Unlimited |
| **Daily auto** | App foregrounded + auto-sync enabled + >24h since last sync | Once per day |
| **Recovery** | User explicitly uses recovery tools | On demand |

**Explicitly forbidden**: Sync on CRUD, debounced changes, background timers, polling, network reconnect.

### Runtime Guards (`syncGuard.ts`)

All sync operations route through guarded entry points that enforce timing and intent:

```typescript
// Primary entry point - validates before executing
guardedSync(trigger: 'manual' | 'daily_auto')

// Recovery tools only
guardedUpload()   // recovery_upload trigger
guardedDownload() // recovery_download trigger
```

**Guard validations:**
- Concurrent sync blocked (only one sync at a time)
- Rapid calls detected (effect loops trigger violation)
- Daily auto-sync limited to once per 24h per session
- Unknown triggers rejected

**Failure behavior:**
- **Development**: `SyncGuardViolation` thrown immediately—makes regressions impossible to ignore
- **Production**: Warning logged, sync safely no-ops, app continues functioning

### Sync Flow
```
User Action (Sync Now) or Foreground (daily)
    ↓
validateSyncAttempt(trigger)
    ↓ [blocked?]
    └── Return { blocked: true, reason }
    ↓ [allowed]
markSyncStarted(trigger)
    ↓
Upload (upsert by entity_id)
    ↓
Download (skip existing IDs)
    ↓
recordSync(uploaded, downloaded)
    ↓
markSyncCompleted(trigger, success)
```

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
- `src/lib/syncGuard.ts` - Runtime guards enforcing sync philosophy
- `src/lib/cloudSync.ts` - Guarded sync entry points + upload/download
- `src/lib/syncStatusManager.ts` - Timing state (lastSyncAt, pending)
- `src/hooks/useAutoSync.ts` - Daily foreground sync orchestration

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
