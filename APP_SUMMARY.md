# OneTap Shortcuts - Complete App Summary

## Product Philosophy
**"One tap to what matters. Nothing else."**

A local-first Android app that lets users create home screen shortcuts for quick access to URLs, contacts, and scheduled reminders. The app prioritizes user sovereignty—local device intent is always authoritative.

---

## Core Features

### 1. One Tap Access (Shortcuts)
- Create Android home screen shortcuts for URLs, contacts (call/message), apps, files, slideshows, or **text notes/checklists**
- Shortcut types: `link`, `contact`, `message`, `file`, `slideshow`, `text`
- Custom icons: emoji, uploaded images, contact photos, or auto-generated initials
- Native Android implementation via Capacitor plugin (`ShortcutPlugin.java`)
- **Text shortcuts**: inline Markdown note or interactive checklist; rendered in a floating dialog via `TextProxyActivity` (blue `#0080FF` accent, Edit / Copy / Share header icons); checklist state persists on-device (SharedPreferences + WebView localStorage); footer has Reset (left, blue) and Done (right, muted) for checklists, Done only for notes; reordering checklist items in the editor clears saved check state on save

### 2. Bookmark Library
- Save URLs with metadata (title, description, folder/tag)
- Drag-and-drop folder organization
- Selection mode for bulk operations
- Soft-delete with configurable retention (7/14/30/60 days)

### 3. One Tap Reminders (Scheduled Actions)
- Schedule future shortcuts with date/time/recurrence
- Native Android notifications via `NotificationHelper.java`
- Persists across device reboots (`BootReceiver.java`)
- **Notification snooze**: configurable duration (5/10/15/30 minutes via `snoozeDurationMinutes` setting); shows countdown timer in expanded notification; re-fires original notification after snooze period; uses native `AlarmManager` — works fully offline
- Bulk delete with `bulkDeleteScheduledActions`: cancels native alarms first (best-effort), then removes from storage and records deletions for cloud sync reconciliation

### 4. Android Share Sheet Integration
- App appears in the Android Share Sheet for **any** file type and URLs
- **Shared URLs** → SharedUrlActionSheet with 4 options: Quick Save, Edit & Save, One Tap Access, Remind Later
- **Shared files** (single) → SharedFileActionSheet showing the actual file name and (for images) a thumbnail preview, with 2 options: One Tap Access, Remind Later
- **Shared images** (multiple) → SharedFileActionSheet (slideshow variant) with One Tap Access only
- Videos shared via Share Sheet auto-open in the native video player
- All action sheets include swipe-to-close gesture, back button handling, and exit animation

### 5. Cloud Sync (Optional)
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

### Backend (Supabase — External Project)
- **Client**: Custom client in `src/lib/supabaseClient.ts` pointing to the external Supabase project, configured with `flowType: 'implicit'`
- **Types**: Manually maintained in `src/lib/supabaseTypes.ts`
- **Tables**: `cloud_bookmarks`, `cloud_trash`, `cloud_scheduled_actions`, `cloud_shortcuts`, `cloud_deleted_entities`
- **Edge Functions**: `fetch-url-metadata`, `delete-account`
- **Auth**: Google OAuth with implicit flow + custom URL scheme (`onetap://auth-callback`) deep link

### Native Android Layer
- `ShortcutPlugin.java`: Home screen shortcut creation; routes `app.onetap.OPEN_TEXT` to `TextProxyActivity`; `clearChecklistState` clears `SharedPreferences("checklist_state")` prefix for a shortcut when item order changes
- `TextProxyActivity.java`: Renders text shortcuts (Markdown or checklist) in an embedded WebView
- `NotificationHelper.java`: Scheduled notifications with snooze support
- `ScheduledActionReceiver.java`: Alarm handling
- `SnoozeReceiver.java`: Handles snooze alarm re-fire
- `BootReceiver.java`: Reschedule after reboot

---

## Data Model

### Local Storage Keys

**Core Data:**
```
saved_links              → SavedLink[]         Bookmarks
saved_links_trash        → TrashedLink[]       Soft-deleted bookmarks
quicklaunch_shortcuts    → Shortcut[]          Shortcut intent data
scheduled_actions        → ScheduledAction[]   Reminders
onetap_settings          → AppSettings         User preferences
custom_folders           → string[]            Bookmark folder names
```

**Sync & Cloud:**
```
sync_status              → SyncStatus          Last sync timestamp, pending state
pending_cloud_deletions  → PendingDeletion[]   Deletion records for cloud reconciliation
```

**Auth & OAuth:**
```
sb-*-auth-token          → Session             Supabase auth session (managed by SDK)
processed_oauth_urls     → string[]            OAuth URLs already handled (prevents replay)
pending_oauth_url        → string              In-flight OAuth redirect URL
oauth_started_at         → number              Timestamp of OAuth initiation
```

**Cache:**
```
onetap_favicon_cache     → Record<url, {favicon, title, ts}>   URL metadata with TTL
```

**UI State:**
```
onetap_onboarding_done   → "true"              Onboarding completed flag
onetap_tutorial_*        → "true"              Coach mark dismissal flags (per feature)
onetap_first_use_date    → ISO date string     First app open (for review prompt timing)
onetap_review_prompt_done → "true"             Review prompt dismissed/completed
onetap_review_jitter_days → number             Random delay offset for review prompt
clipboard_shown_urls     → string[]            URLs already shown in clipboard suggestion
onetap_usage_*           → UsageRecord[]       Per-shortcut usage history
scheduled_actions_selection → string[]         Transient multi-select IDs (bulk operations)
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

cloud_trash (
  id UUID PRIMARY KEY,
  entity_id UUID UNIQUE,
  user_id UUID,
  url TEXT, title TEXT, folder TEXT,
  deleted_at TIMESTAMPTZ,
  retention_days INT,
  original_created_at TIMESTAMPTZ
)

cloud_scheduled_actions (
  id UUID PRIMARY KEY,
  entity_id UUID UNIQUE,
  user_id UUID,
  name TEXT,
  destination JSONB,     -- {type, url/phone/content_uri, ...}
  trigger_time BIGINT,
  recurrence TEXT,
  enabled BOOLEAN
)

cloud_shortcuts (
  -- intent metadata for all shortcut types
  text_content    TEXT,              -- Raw markdown or checklist source (text shortcuts only)
  is_checklist    BOOLEAN DEFAULT false  -- true → render as interactive checklist
  -- ... other columns: type, name, content_uri, phone_number, etc.
)

cloud_deleted_entities (
  id UUID PRIMARY KEY,
  user_id UUID,
  entity_type TEXT,      -- 'bookmark' | 'trash' | 'shortcut' | 'scheduled_action'
  entity_id UUID,
  deleted_at TIMESTAMPTZ
)
-- RLS: Users can only access their own data on all tables
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
- `src/lib/deletionTracker.ts` - Pending deletion records for cloud reconciliation
- `src/hooks/useAutoSync.ts` - Daily foreground sync orchestration

### Data Management
- `src/lib/savedLinksManager.ts` - Bookmark CRUD
- `src/lib/scheduledActionsManager.ts` - Reminder CRUD + `bulkDelete` (records deletions for sync)
- `src/lib/settingsManager.ts` - User preferences
- `src/hooks/useScheduledActions.ts` - Reminder hook; `bulkDeleteScheduledActions` cancels native alarms before storage deletion

### Native Bridge
- `src/plugins/ShortcutPlugin.ts` - Capacitor interface
- `native/android/app/.../ShortcutPlugin.java` - Native implementation
- `src/components/TextEditorStep.tsx` — Checklist/note editor with `@dnd-kit` drag-to-reorder; emits `orderChanged` flag on confirm

### Auth
- `src/hooks/useAuth.ts` - Auth state + Google OAuth
- `src/lib/oauthCompletion.ts` - Deep link handling
- `src/pages/AuthCallback.tsx` - Web callback handler

### UX & Engagement
- `src/hooks/useReviewPrompt.ts` - Play Store review prompt (5+ days, 3+ shortcuts, jittered timing)
- `src/hooks/useClipboardDetection.ts` - Clipboard URL detection and suggestion
- `src/hooks/useUrlMetadata.ts` - Favicon/title cache with TTL

### Sign-Out Cleanup

When `signOut()` is called, the following state is cleared to prevent cross-user contamination:
- Supabase auth token (`sb-*-auth-token`)
- Pending OAuth state (`processed_oauth_urls`, pending OAuth markers)
- Sync status (`clearSyncStatus()`) — resets last sync timestamp
- Pending deletions (`clearPendingDeletions()`) — prevents stale deletion records from syncing under a new account

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
- `SharedUrlActionSheet.tsx` - Action picker for shared URLs (Quick Save, Edit & Save, Shortcut, Remind Later)
- `SharedFileActionSheet.tsx` - Action picker for shared files (One Tap Access, Remind Later)
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
  snoozeDurationMinutes: 5|10|15|30;  // Notification snooze duration
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

*Last updated: February 21, 2026 — reflects snooze feature, localStorage inventory, sign-out cleanup, UI/UX safe-area fixes*
