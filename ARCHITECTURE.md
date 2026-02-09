# OneTap Shortcuts - Architecture

## Overview

OneTap is a paid Android app that creates home screen shortcuts for URLs, contacts, files, and scheduled reminders. It follows a **local-first** architecture where the device is always the source of truth.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **UI** | React 18 + TypeScript |
| **Build** | Vite (ESNext target) |
| **Styling** | Tailwind CSS + shadcn/ui |
| **Native Bridge** | Capacitor 8 |
| **Native Platform** | Android (Java, minSdk 31 / Android 12+) |
| **Backend** | Lovable Cloud (Supabase) — optional, for sync only |
| **Auth** | Google OAuth via Android App Links |
| **i18n** | i18next (English-only at launch, multi-language prepared) |

---

## Project Structure

```
onetap-app/
├── src/                          # React application
│   ├── components/               # UI components
│   │   ├── ui/                   # shadcn/ui primitives
│   │   └── auth/                 # Auth-related components
│   ├── hooks/                    # Custom React hooks
│   ├── lib/                      # Business logic (no React dependencies)
│   ├── pages/                    # Route-level components
│   ├── plugins/                  # Capacitor plugin interfaces
│   ├── types/                    # TypeScript type definitions
│   ├── contexts/                 # React contexts
│   ├── i18n/                     # Internationalization config
│   └── integrations/supabase/    # Auto-generated Supabase client
├── native/android/               # Source native files (EDIT THESE)
│   ├── app/src/main/java/        # Custom Java classes
│   ├── app/src/main/res/         # Resources, layouts, drawables
│   └── app/src/main/AndroidManifest.xml
├── android/                      # Generated Capacitor project (DO NOT EDIT)
├── supabase/
│   ├── functions/                # Edge functions (Deno)
│   ├── migrations/               # SQL migration files
│   └── config.toml               # Auto-generated config
├── scripts/android/              # Build automation scripts
├── public/                       # Static assets
│   ├── .well-known/              # assetlinks.json for App Links
│   └── privacy-policy.html       # Privacy policy
└── .github/workflows/            # CI/CD
```

---

## Data Architecture

### Local Storage (Source of Truth)

All data lives in `localStorage` on the device. Cloud is additive-only.

| Key | Type | Purpose |
|-----|------|---------|
| `saved_links` | `SavedLink[]` | Bookmarks |
| `saved_links_trash` | `TrashedLink[]` | Soft-deleted bookmarks |
| `scheduled_actions` | `ScheduledAction[]` | Reminders |
| `onetap_settings` | `AppSettings` | User preferences |
| `sync_status` | `SyncStatus` | Sync timing state |

### Cloud Schema (Optional, Additive-Only)

Three tables with RLS — users can only access their own data:

| Table | Purpose |
|-------|---------|
| `cloud_bookmarks` | Synced bookmarks (keyed by `entity_id`) |
| `cloud_trash` | Synced deleted bookmarks |
| `cloud_scheduled_actions` | Synced reminders |

See `SUPABASE.md` for full schema details.

---

## Native Android Layer

All native code lives in `native/android/` and is copied to `android/` by the patch script.

### Key Java Classes

| Class | Purpose |
|-------|---------|
| `MainActivity.java` | Entry point, registers Capacitor plugins |
| `ShortcutPlugin.java` | Home screen shortcut creation via `ShortcutManager` |
| `NotificationHelper.java` | Scheduled notification display |
| `ScheduledActionReceiver.java` | `BroadcastReceiver` for alarm triggers |
| `BootReceiver.java` | Reschedules alarms after device reboot |
| `NativePdfViewerActivity.java` | Full-featured PDF viewer with pinch-zoom |
| `NativeVideoPlayerActivity.java` | Video player with PiP support |
| `QuickCreateWidget.java` | Home screen widget for quick shortcut creation |
| `CrashLogger.java` | Breadcrumb-based crash logging (no external SDK) |

### Proxy Activities

Each shortcut type has a proxy activity that handles the intent:

- `LinkProxyActivity` — Opens URLs
- `ContactProxyActivity` — Initiates calls
- `MessageProxyActivity` — Opens messaging
- `WhatsAppProxyActivity` — Opens WhatsApp
- `PDFProxyActivity` — Opens PDF viewer
- `VideoProxyActivity` — Opens video player
- `FileProxyActivity` — Opens files
- `SlideshowProxyActivity` — Opens slideshow
- `ShortcutEditProxyActivity` — Edits existing shortcuts

---

## Sync Architecture

See `PRODUCT_IDEOLOGY.md` for philosophy. Key technical points:

1. **All sync goes through `syncGuard.ts`** — runtime enforcement of timing rules
2. **Two triggers only**: Manual ("Sync Now") and daily auto (once per 24h on foreground)
3. **Upload**: Upsert by `entity_id` — cloud never overwrites local
4. **Download**: Skip items whose `entity_id` already exists locally
5. **No background sync, no polling, no reactive triggers**

---

## Auth Flow (Native Android)

1. User taps "Sign in with Google"
2. App opens Chrome Custom Tab with OAuth URL
3. Google redirects to `https://[preview-domain]/auth-callback?code=...`
4. Android intercepts via App Links (`autoVerify` in AndroidManifest)
5. `oauthCompletion.ts` exchanges code for session
6. Idempotency guard prevents double-processing

**Files**: `useAuth.ts`, `useDeepLink.ts`, `oauthCompletion.ts`, `AuthCallback.tsx`

---

## Navigation

Four bottom tabs:

| Tab | Icon | Component | Purpose |
|-----|------|-----------|---------|
| Access | Zap | `AccessFlow` | Create shortcuts |
| Reminders | Bell | `NotificationsPage` | Scheduled actions |
| Bookmarks | Bookmark | `BookmarkLibrary` | Saved links library |
| Profile | User | `ProfilePage` | Settings + sync |

---

## Build Pipeline

See `DEPLOYMENT.md` for full details. Summary:

```
npm run build → npx cap sync android → patch-android-project.mjs → ./gradlew bundleRelease
```

CI/CD automates builds; human intent required for releases.

---

*Last updated: February 2026*
