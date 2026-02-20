# OneTap Shortcuts — Architecture

> **Purpose of this document:** Help you build a mental model of how everything fits together, so you can make changes confidently without breaking things you don't understand yet.

---

## Table of Contents

1. [The Three Layers](#1-the-three-layers)
2. [Web Layer (React + Capacitor)](#2-web-layer-react--capacitor)
3. [Native Android Layer (Java)](#3-native-android-layer-java)
4. [Backend Layer (Supabase)](#4-backend-layer-supabase)
5. [How Data Flows](#5-how-data-flows)
6. [How OAuth Works](#6-how-oauth-works-step-by-step)
7. [Why No Background Services](#7-why-no-background-services)
8. [Why No Analytics](#8-why-no-analytics)
9. [Navigation Structure](#9-navigation-structure)
10. [Project Structure](#10-project-structure)
11. [Build Pipeline Overview](#11-build-pipeline-overview)
12. [Failure Scenarios and Recovery](#12-failure-scenarios-and-recovery)

---

## 1. The Three Layers

OneTap is built in three layers. Each layer has a specific job:

```
┌───────────────────────────────────────────────┐
│            LAYER 1: Web (React)               │
│                                               │
│  What you see: buttons, forms, lists, tabs    │
│  Where it lives: src/                         │
│  Language: TypeScript + React                 │
│                                               │
│  This is where 90% of your changes happen.    │
├───────────────────────────────────────────────┤
│            LAYER 2: Native (Android)          │
│                                               │
│  What it does: home screen shortcuts,         │
│  notifications, PDF viewer, video player      │
│  Where it lives: native/android/              │
│  Language: Java                               │
│                                               │
│  You only touch this for Android-specific     │
│  features that the web layer can't do.        │
├───────────────────────────────────────────────┤
│            LAYER 3: Backend (Supabase)        │
│                                               │
│  What it does: cloud sync, Google sign-in,    │
│  URL metadata fetching                        │
│  Where it lives: supabase/                    │
│  Language: SQL (schema) + TypeScript (funcs)  │
│                                               │
│  This is OPTIONAL. The app works without it.  │
└───────────────────────────────────────────────┘
```

**How they connect:**

```
React UI  ──(Capacitor bridge)──▶  Native Android Java
React UI  ──(Supabase SDK)──────▶  Supabase Backend
```

Capacitor is the bridge between web and native. It lets your React code call Java functions (like "create a home screen shortcut") through a plugin system.

**No platform lock-in:** The app depends only on Supabase (open-source, self-hostable) for its backend. There are no proprietary platform dependencies.

---

## 2. Web Layer (React + Capacitor)

**What is it?** A standard React single-page application, bundled by Vite, styled with Tailwind CSS and shadcn/ui components.

**What is Capacitor?** Capacitor wraps your React app inside a native Android WebView. Think of it as a container that lets your web app behave like a native app. It also provides a "bridge" so your React code can call native device APIs.

**Key folders:**

| Folder | Purpose |
|--------|---------|
| `src/components/` | UI components (buttons, forms, sheets, lists) |
| `src/components/ui/` | Low-level shadcn/ui primitives (don't edit these often) |
| `src/hooks/` | React hooks for state, auth, sync, etc. |
| `src/lib/` | Pure business logic — no React dependencies |
| `src/pages/` | Top-level page components (one per route) |
| `src/plugins/` | TypeScript interfaces for Capacitor native plugins |
| `src/types/` | TypeScript type definitions |
| `src/contexts/` | React context providers |
| `src/i18n/` | Translation files and i18next configuration |

### Safe Area Design System

Capacitor 8 forces the WebView into edge-to-edge mode — content renders behind the system status bar and navigation bar. `MainActivity.java` reads real OS insets via `ViewCompat.setOnApplyWindowInsetsListener` on every layout pass (including orientation changes) and injects them as CSS custom properties on `<html>`. `env()` fallbacks ensure values are available in the browser preview before native injection fires.

**CSS Variables (defined in `src/index.css` `:root`)**

| Variable | Source | Description |
|---|---|---|
| `--android-safe-top` | `statusBars().top` | Height of the status bar (portrait and landscape) |
| `--android-safe-bottom` | `navigationBars().bottom` | Height of the bottom nav bar (portrait gesture/button bar) |
| `--android-safe-left` | `navigationBars().left` | Width of the nav bar when it moves to the **left** side in landscape (90° clockwise rotation) |
| `--android-safe-right` | `navigationBars().right` | Width of the nav bar when it moves to the **right** side in landscape (90° anti-clockwise rotation) |

**Utility Classes (defined in `src/index.css` `@layer utilities`)**

| Class | Property | When to use |
|---|---|---|
| `safe-top` | `padding-top` | Fixed headers that must clear the status bar |
| `safe-bottom` | `padding-bottom` | Any element anchored to the bottom edge |
| `safe-bottom-with-nav` | `padding-bottom: safe-bottom + 3.5rem (portrait) / 2.5rem (landscape)` | Bottom `<Sheet>` panels — clears both the system nav bar and the app's `BottomNav` |
| `safe-bottom-sheet` | `padding-bottom: max(safe-bottom, 16px)` | Vaul `<Drawer>` panels — clears system nav only (BottomNav is behind the overlay) |
| `safe-bottom-action` | `padding-bottom: safe-bottom + 16px` | Floating action areas requiring visual breathing room above the nav bar |
| `safe-left` | `padding-inline-start` | Side `<Sheet>` panels anchored to the left edge |
| `safe-right` | `padding-inline-end` | Side `<Sheet>` panels anchored to the right edge |
| `safe-x` | `padding-inline-start` + `padding-inline-end` | Any full-width element that must clear a **horizontal** nav bar in landscape (e.g. `BottomNav`, `AccessFlow` header, custom overlay containers) |
| `pt-header-safe` | `padding-top: safe-top + 1rem` | Standard page headers |
| `pt-header-safe-compact` | `padding-top: safe-top + 0.75rem (0.5rem landscape)` | Compact page headers |

**Which class to use — decision guide:**

```
Is the element a bottom Sheet (Radix, side="bottom")?
  → safe-bottom-with-nav

Is the element a Vaul Drawer?
  → safe-bottom-sheet  (on DrawerContent base class)

Is the element a fixed full-width bar (BottomNav, AccessFlow root)?
  → safe-x

Is the element a side Sheet (left/right)?
  → safe-left (left variant) or safe-right (right variant)

Is the element a custom fixed overlay card (SharedUrlActionSheet, SharedFileActionSheet)?
  → safe-bottom-with-nav + safe-x  (on the outer container)

Is the element a fixed header?
  → pt-header-safe or pt-header-safe-compact
```

> **RTL note:** `safe-left` / `safe-right` / `safe-x` use logical properties (`padding-inline-start/end`), so they are automatically mirrored in RTL layouts — no extra RTL overrides needed.

---

## 3. Native Android Layer (Java)

**What is it?** Custom Java classes that handle things the web layer cannot do — primarily creating home screen shortcuts and firing scheduled notifications.

⚠️ **Critical rule:** Always edit files in `native/android/`. Never edit files in `android/` directly. The build script copies from `native/android/` → `android/` every time you build.

**Key classes and what they do:**

| Java Class | What It Does |
|------------|-------------|
| `MainActivity.java` | App entry point. Registers Capacitor plugins. Forces edge-to-edge rendering and injects `--android-safe-top`, `--android-safe-bottom`, `--android-safe-left`, and `--android-safe-right` CSS variables from real OS insets on every orientation change. |
| `ShortcutPlugin.java` | Creates home screen shortcuts using Android's `ShortcutManager` API |
| `NotificationHelper.java` | Displays scheduled notifications |
| `ScheduledActionReceiver.java` | Receives alarm broadcasts and triggers notifications |
| `BootReceiver.java` | Reschedules all alarms after the phone restarts |
| `NativePdfViewerActivity.java` | Full-featured PDF viewer with pinch-zoom |
| `NativeVideoPlayerActivity.java` | Video player with picture-in-picture support |
| `QuickCreateWidget.java` | Home screen widget for quick shortcut creation |
| `CrashLogger.java` | Simple crash logging (no external SDK needed) |
| `TextProxyActivity.java` | Renders text shortcuts (Markdown or checklist) in a floating dialog; blue `#0080FF` accent; footer has Reset + Done (checklist) or Done only (note) |

**Proxy Activities:** Each shortcut type has a "proxy activity" — a lightweight Java class that receives the shortcut tap and performs the action:

| Proxy | Intent Action | Action |
|-------|--------------|--------|
| `LinkProxyActivity` | `app.onetap.OPEN_LINK` | Opens a URL in the browser |
| `ContactProxyActivity` | `app.onetap.OPEN_CONTACT` | Initiates a phone call |
| `MessageProxyActivity` | `app.onetap.OPEN_MESSAGE` | Opens the messaging app |
| `WhatsAppProxyActivity` | `app.onetap.OPEN_WHATSAPP` | Opens WhatsApp to a specific contact |
| `PDFProxyActivity` | `app.onetap.OPEN_PDF` | Opens the native PDF viewer |
| `VideoProxyActivity` | `app.onetap.OPEN_VIDEO` | Opens the native video player |
| `FileProxyActivity` | `app.onetap.OPEN_FILE` | Opens a file with the system file handler |
| `SlideshowProxyActivity` | `app.onetap.OPEN_SLIDESHOW` | Opens a photo slideshow |
| `TextProxyActivity` | `app.onetap.OPEN_TEXT` | Renders markdown or checklist text in a floating premium dialog. Header: Edit (blue tint), Copy, Share icons. Footer: checklist mode has Reset (left, blue) + Done (right, muted) split by a vertical divider; note mode has Done only. Accent colour: `#0080FF` (app primary blue). |
| `ShortcutEditProxyActivity` | `app.onetap.EDIT_SHORTCUT` | Opens the edit screen for an existing shortcut |

**Text shortcut intent contract:**

```
Intent action:  app.onetap.OPEN_TEXT
Activity:       TextProxyActivity
Extras:
  shortcut_id   String   — usage tracking + checklist state key (SharedPreferences key prefix)
  text_content  String   — raw markdown or checklist source text (max 2000 chars)
  is_checklist  Boolean  — true → render as interactive checklist; false → render as Markdown
```

**Checklist state persistence:** Checkbox state is stored in two places simultaneously:
- **WebView `localStorage`** — keyed as `chk_<shortcut_id>_<line_index>`, survives soft closes
- **Android `SharedPreferences`** (`checklist_state`) — backup via the `ChecklistBridge` JS interface (exposed as `window.Android`), survives WebView cache clears

**Checklist state clearing (reorder):** State keys are index-based (`chk_{id}_{lineIndex}`). If the user reorders checklist items in `TextEditorStep`, saved states for old indices would map to the wrong items. When a reorder is saved, `ShortcutPlugin.clearChecklistState({ id })` clears all keys with the prefix `chk_{id}_` from `SharedPreferences("checklist_state")`. The same clearing is performed by the native Reset button in the viewer footer.

---

## 4. Backend Layer (Supabase)

**What is Supabase?** An open-source backend platform that provides a PostgreSQL database, authentication, and serverless functions. It can be self-hosted or used as a managed service at [supabase.com](https://supabase.com).

**What the backend does:**
- ✅ Stores synced bookmarks, trash, reminders, and shortcut intent metadata (optional)
- ✅ Handles Google OAuth sign-in
- ✅ Fetches URL metadata (title, favicon) to bypass browser CORS restrictions
- ✅ Tracks deletion reconciliation to prevent "resurrection" of deleted items

**What the backend does NOT do:**
- ❌ Does not store file content, thumbnails, or binary data (privacy boundary)
- ❌ Does not run background jobs or cron tasks
- ❌ Does not send push notifications
- ❌ Does not track analytics

See [SUPABASE.md](SUPABASE.md) for the complete backend guide.

---

## 5. How Data Flows

### Data Ownership

```
┌───────────────────────────────────────────────────┐
│                 LOCAL DEVICE                       │
│          (Source of Truth — ALWAYS)                │
│                                                    │
│  localStorage:                                     │
│    saved_links        → Your bookmarks             │
│    saved_links_trash  → Your deleted bookmarks     │
│    scheduled_actions  → Your reminders             │
│    onetap_settings    → Your preferences           │
│    sync_status        → When you last synced       │
│                                                    │
│  Android System:                                   │
│    ShortcutManager    → Your home screen shortcuts  │
│    AlarmManager       → Your scheduled reminders    │
└────────────────────────┬──────────────────────────┘
                         │
              (optional, additive-only)
                         │
                         ▼
┌───────────────────────────────────────────────────┐
│                  SUPABASE                          │
│          (Backup Copy — NEVER overwrites local)    │
│                                                    │
│  cloud_bookmarks          → Copy of bookmarks      │
│  cloud_trash              → Copy of deleted items   │
│  cloud_scheduled_actions  → Copy of reminders       │
│  cloud_shortcuts          → Shortcut intent metadata│
│  cloud_deleted_entities   → Deletion reconciliation │
└───────────────────────────────────────────────────┘

**Privacy boundaries:** The cloud never stores local file URIs, thumbnails,
contact photos, or any binary data. File-dependent shortcuts sync as "dormant"
— they carry enough metadata to describe the intent, but require the user to
re-attach the local file on a new device before they become actionable.
```

**The golden rule:** Local data always wins. If there's a conflict between what's on the device and what's in the cloud, the device version is kept. Cloud sync only *adds* items that don't already exist locally — it never updates or deletes local data.

### Sync Flow

```
User taps "Sync Now"  ──or──  App opens (daily auto)
         │
         ▼
  syncGuard.ts validates the request
         │
    ┌────┴────┐
    │ Blocked │──▶ No-op (silently ignored)
    └────┬────┘
         │ Allowed
         ▼
  Upload: Send local items to cloud
  (bookmarks, trash, shortcuts, scheduled actions)
  (upsert by entity_id — same item overwrites in cloud)
         │
         ▼
  Upload deletions: Push pending deletions to cloud_deleted_entities
  and delete corresponding cloud rows
         │
         ▼
  Download: Fetch cloud deletion ledger, then cloud items
  (skip any item whose entity_id exists locally OR in deletion ledger)
         │
         ▼
  Reconcile: Remove local items that appear in cloud deletion ledger
  (handles cross-device deletion)
         │
         ▼
  Record sync timestamp
```

### Dormant Access Points

File-dependent shortcuts (type = `file` or `slideshow`) cannot fully restore from the cloud because local file URIs and binary data are never synced (privacy boundary). When downloaded to a new device:

1. The shortcut's intent metadata is restored (name, type, icon hint, usage count)
2. The shortcut is marked `syncState: 'dormant'`
3. It appears in the list with a file-type emoji icon (🖼️, 🎬, 📄, etc.)
4. The user sees a "Re-attach file" prompt and must provide the local file to reactivate

Link, contact, message, and **text** shortcuts restore fully because their data (URL, phone number, or `text_content`) is self-contained and device-independent. **Text shortcuts are never dormant** — `isFileDependentType()` in `src/types/shortcut.ts` explicitly excludes `'text'` from the file-dependent type set, and `text_content` is synced as a plain-text cloud column (up to 2000 chars). Checkbox interaction state is per-device and is not synced.

---

## 6. How OAuth Works (Step by Step)

Google sign-in uses **implicit flow** with a **custom URL scheme** deep link for reliable native OAuth:

- **Auth flow type:** Implicit (tokens returned directly in URL fragment — no PKCE code verifier needed)
- **Native redirect:** `onetap://auth-callback` (custom scheme — always works, no domain verification)
- **Web redirect:** `{current_origin}/auth-callback`

### Why Implicit Flow?

On Android, the OAuth browser (Chrome) is a separate process from the app's WebView. With PKCE flow, the code verifier is stored in the WebView's localStorage but Chrome has no access to it. When the deep link returns the app, `exchangeCodeForSession` fails because it can't find the matching code verifier. Implicit flow eliminates this problem — tokens are delivered directly in the URL fragment.

| Aspect | PKCE (broken on native) | Implicit (current) |
|---|---|---|
| Code verifier | Stored in WebView localStorage, inaccessible from Chrome | Not needed |
| Token delivery | Auth code in query param, needs server-side exchange | Tokens directly in URL fragment |
| Security | More secure for web apps | Acceptable for native apps with custom schemes |
| Complexity | Requires matching code verifier across browser contexts | Simpler — tokens are self-contained |

### The Flow

```
Step 1: User taps "Sign in with Google"
           │
           ▼
Step 2: App opens Google's OAuth page in a Chrome Custom Tab
        (a browser window that floats on top of the app)
           │
           ▼
Step 3: User signs in with Google
           │
           ▼
Step 4: Google redirects to:
        onetap://auth-callback#access_token=xxx&refresh_token=yyy
        (implicit flow: tokens in URL fragment, custom scheme opens app)
           │
           ▼
Step 5: Android intercepts this URL via custom scheme intent filter
        (declared in AndroidManifest.xml — no domain verification needed)
           │
           ▼
Step 6: useDeepLink.ts receives the URL
           │
           ▼
Step 7: oauthCompletion.ts extracts access_token and refresh_token
        from the URL, then calls supabase.auth.setSession()
        (with idempotency — processes the same URL only once)
           │
           ▼
Step 8: User is signed in. Session stored by Supabase SDK.
```

**Files involved:**

| File | Role |
|------|------|
| `src/lib/supabaseClient.ts` | Supabase client configured with `flowType: 'implicit'` |
| `src/hooks/useAuth.ts` | Starts the OAuth flow, manages auth state |
| `src/hooks/useDeepLink.ts` | Listens for deep links from Android |
| `src/lib/oauthCompletion.ts` | Shared logic to complete OAuth — handles both implicit tokens (`setSession`) and PKCE code exchange as fallback |
| `src/pages/AuthCallback.tsx` | Web-only fallback callback route |
| `public/.well-known/assetlinks.json` | Proves domain ownership to Android (for App Links fallback) |
| `native/android/.../AndroidManifest.xml` | Declares both App Link and custom scheme intent filters |

**OAuth redirect URL configuration:**

- **Native (Android):** Uses `onetap://auth-callback` (custom scheme, set automatically in code)
- **Web:** Uses `{current_origin}/auth-callback` (set automatically in code)

You must configure **both** URLs in your Supabase project under Authentication → URL Configuration → Redirect URLs:
- `onetap://auth-callback`
- `https://onetapapp.in/auth-callback`

**What can go wrong:**

| Problem | Cause | Fix |
|---------|-------|-----|
| App doesn't open after sign-in | `onetap://auth-callback` not in Supabase redirect allowlist | Add it in Supabase dashboard → Auth → URL Configuration |
| App opens but stays signed out | Supabase client not using `flowType: 'implicit'` | Verify `src/lib/supabaseClient.ts` has `flowType: 'implicit'` in auth config |
| "ES256 invalid signing" error | Callback URL not in Supabase's redirect allowlist | Add the URL in Supabase dashboard → Auth → URL Configuration |
| Sign-in works once, then stops | Idempotency guard blocking repeat URL | Clear localStorage key `pending_oauth_url` |
| Web sign-in fails | Preview/production URL not in redirect allowlist | Add the web URL to Supabase redirect URLs |

---

## 7. Why No Background Services

**Philosophy:** The app is a guest on the user's device. It should not consume battery, CPU, or network in the background.

**How reminders work without background services:** OneTap uses Android's built-in `AlarmManager` to schedule notifications. The alarm is set once when you create a reminder, and Android handles the rest. `BootReceiver` reschedules alarms if the phone restarts.

**How sync works without background services:** Sync only happens when the user explicitly requests it ("Sync Now") or once per day when the app is opened. There is no background timer, no polling, and no push-triggered sync.

---

## 8. Why No Analytics

**Philosophy:** A paid app earns money from delivering value, not from surveillance. The app collects zero analytics, zero usage metrics, and zero crash telemetry to external services.

Crash logging is local-only (`CrashLogger.java`) — breadcrumbs are stored on the device and can be viewed by the developer during debugging, but are never sent anywhere.

---

## 9. Navigation Structure

The app has four bottom tabs:

```
┌──────────┬──────────┬──────────┬──────────┐
│  Access  │ Reminders│ Bookmarks│ Profile  │
│   (Zap)  │  (Bell)  │(Bookmark)│  (User)  │
└──────────┴──────────┴──────────┴──────────┘
```

| Tab | Component | Purpose |
|-----|-----------|---------|
| Access | `AccessFlow.tsx` | Create new shortcuts; tapping the **Text** tile triggers the inline `TextEditorStep` sub-flow (full-screen Markdown / checklist editor with toolbar, name field, and icon picker — no separate route) |
| Reminders | `NotificationsPage.tsx` | View and create scheduled reminders |
| Bookmarks | `BookmarkLibrary.tsx` | Browse and organize saved links |
| Profile | `ProfilePage.tsx` | Settings, cloud sync, account |

### Share Sheet Integration

The Android manifest declares a catch-all `*/*` intent filter for `ACTION_SEND` (single files) and `image/*` for `ACTION_SEND_MULTIPLE` (slideshow). When content is shared to the app:

```
Content shared via Android Share Sheet
        │
        ├── URL (text/plain) ──▶ SharedUrlActionSheet
        │                         ├── Quick Save (instant save to library)
        │                         ├── Edit & Save (edit metadata first)
        │                         ├── One Tap Access (create shortcut)
        │                         └── Remind Later (schedule reminder)
        │
        ├── Video file ──▶ Native video player (auto-play)
        │
        ├── Single file ──▶ SharedFileActionSheet
        │                    ├── One Tap Access (create shortcut)
        │                    └── Remind Later (schedule reminder)
        │
        ├── Multiple images ──▶ SharedFileActionSheet (slideshow)
        │                        └── One Tap Access (create slideshow)
        │
        └── Mixed/unsupported ──▶ Toast + exit
```

### File Name and Thumbnail Handling

When a file is shared to the app:

1. **Native layer** (`ShortcutPlugin.java`) queries `ContentResolver` for `OpenableColumns.DISPLAY_NAME` to extract the actual file name (e.g., "Vacation_Photo.jpg")
2. **JS layer** (`useSharedContent.ts`) passes the name into the `ContentSource` object
3. **SharedFileActionSheet** converts `content://` URIs to WebView-renderable URLs via `Capacitor.convertFileSrc()` for image thumbnail display
4. **ShortcutCustomizer** receives the `ContentSource` with the correct name, pre-populating the shortcut name field

For single image shortcuts, `SlideshowViewer.tsx` implements a thumbnail fallback: if the full-quality `content://` URI becomes inaccessible (stale permission), the viewer falls back to the stored base64 thumbnail instead of showing a black screen.

**Key files:**
- `src/hooks/useSharedContent.ts` — Intercepts shared content from native layer
- `src/components/SharedUrlActionSheet.tsx` — Action picker for shared URLs
- `src/components/SharedFileActionSheet.tsx` — Action picker for shared files
- `src/pages/Index.tsx` — Routes shared content to the appropriate action sheet

---

## 10. Project Structure

```
onetap-app/
├── src/                          # React application (EDIT HERE)
│   ├── components/               # UI components
│   │   ├── ui/                   # shadcn/ui primitives
│   │   └── auth/                 # Auth-related components
│   ├── hooks/                    # Custom React hooks
│   ├── lib/                      # Business logic (no React imports)
│   ├── pages/                    # Route-level components
│   ├── plugins/                  # Capacitor plugin TypeScript interfaces
│   ├── types/                    # TypeScript type definitions
│   ├── contexts/                 # React contexts
│   └── i18n/                     # Translations
│
│   Key Supabase files (manually maintained):
│   ├── lib/supabaseClient.ts     # Custom client with hardcoded external project credentials
│   └── lib/supabaseTypes.ts      # Database type definitions
│
├── native/android/               # Native Java source files (EDIT HERE)
│   ├── app/src/main/java/        # Custom Java classes
│   ├── app/src/main/res/         # Android resources, layouts, drawables
│   └── app/src/main/AndroidManifest.xml
│
├── android/                      # ⚠️ GENERATED by Capacitor — do NOT edit
│
├── supabase/
│   ├── functions/                # Serverless functions (Deno/TypeScript)
│   ├── migrations/               # SQL migrations
│   └── config.toml               # Supabase config
│
├── scripts/android/              # Build scripts
│   ├── clean-rebuild-android.mjs # Full rebuild automation
│   └── patch-android-project.mjs # Applies native patches
│
├── public/                       # Static assets
│   ├── .well-known/              # assetlinks.json for OAuth
│   └── privacy-policy.html       # Google Play requirement
│
├── .github/workflows/            # CI/CD pipeline
│   └── android-release.yml       # Build + publish workflow
│
└── Documentation files (*.md)
```

---

## 11. Build Pipeline Overview

```
Your code changes
       │
       ▼
npm run build          ← Vite bundles React app into dist/
       │
       ▼
npx cap sync android   ← Copies dist/ into the Android project
       │
       ▼
patch-android-project  ← Copies native/ files, configures Gradle
       │                     (injects mandatory release signing —
       │                      build FAILS if RELEASE_STORE_FILE,
       │                      RELEASE_STORE_PASSWORD, RELEASE_KEY_ALIAS,
       │                      or RELEASE_KEY_PASSWORD env vars are missing)
       │
       ▼
./gradlew bundleRelease  ← Produces a release-signed .aab file
       │
       ▼
Upload to Play Store   ← CI does this automatically (internal track)
       │
       ▼
Manual promotion       ← YOU decide when it goes to production
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full guide.

---

## 12. Failure Scenarios and Recovery

| Scenario | What Happens | How to Recover |
|----------|-------------|----------------|
| **Cloud goes down** | App works perfectly. Sync button shows an error. | Wait for cloud to come back. No data is lost. |
| **User clears app data** | All local data is lost. | If signed in + synced: re-sign-in and sync to restore cloud copies. If never synced: data is gone. |
| **Phone restarts** | `BootReceiver` reschedules all alarms. Shortcuts survive. | Automatic — no action needed. |
| **Bad release shipped** | Users get a broken version. | Tag a hotfix version (`v1.0.1`), test on internal track, promote to production. See [RELEASE_PROCESS.md](RELEASE_PROCESS.md). |
| **OAuth stops working** | Users can't sign in. App still works for everything except sync. | Check `onetap://auth-callback` is in Supabase redirect URLs, verify `flowType: 'implicit'` in supabaseClient.ts. See Section 6 above. |
| **Lost signing keystore** | Cannot publish updates to the same Play Store listing. | **Unrecoverable.** You must create a new app listing. Always back up your keystore. |
| **Sync guard blocks sync** | Sync silently does nothing. | Check console logs for `SyncGuardViolation` (dev) or warning (prod). Likely a timing issue. |
| **Checklist state clear fails on save** | See below. | See below. |

### TextProxyActivity — Checklist State Clear Failure Scenarios

Checklist state is cleared in two distinct situations: (a) the **Reset button** inside the viewer dialog, and (b) **`ShortcutPlugin.clearChecklistState()`** called from JS when a reordered or edited checklist is saved. Both write via `SharedPreferences.Editor.apply()` (asynchronous, fire-and-forget). The scenarios below document what can go wrong in each path.

#### Path A — Reset button (`clearChecklistState()` in `TextProxyActivity`)

`clearChecklistState()` shows a confirmation `AlertDialog`, then on confirm:
1. Opens `SharedPreferences("checklist_state", MODE_PRIVATE)`.
2. Iterates all keys with prefix `chk_{shortcutId}_` and calls `editor.remove(key)`.
3. Calls `editor.apply()` — schedules the write asynchronously.
4. Calls `webView.evaluateJavascript("resetAllItems()", null)` to uncheck DOM checkboxes.
5. Shows "Checklist reset" `Toast`.

**Failure: `apply()` silently fails (e.g. disk full, I/O error)**
- The `Toast` shows and the WebView DOM is reset — the user sees all items unchecked.
- On next open, `TextProxyActivity` re-reads `SharedPreferences`. If `apply()` failed, the old checked states are still there, so items will re-render as checked despite appearing reset in the previous session.
- **Net effect:** Ghost state. The UI and SharedPreferences are out of sync until the user resets again or the disk error clears.
- **Recovery:** No automatic retry. The user must tap Reset again. There is no error indicator because `apply()` does not surface failures to the caller.

**Failure: WebView `evaluateJavascript("resetAllItems()")` fails (WebView detached or page not loaded)**
- `evaluateJavascript` silently no-ops if the WebView is in a bad state.
- SharedPreferences clear still succeeds (assuming `apply()` flushed).
- **Net effect:** DOM shows old checked state in the current session; next open renders correctly from now-cleared SharedPreferences.
- **Recovery:** Dismiss and reopen the shortcut — next open rebuilds the DOM from (now empty) SharedPreferences.

#### Path B — Save-time clear (`ShortcutPlugin.clearChecklistState()` from JS)

Called by `useShortcuts.ts` after a reordered or edited checklist is saved. Delegates to `ShortcutPlugin.java` which writes to `SharedPreferences("checklist_state")` via `apply()`.

**Failure: `apply()` silently fails**
- The shortcut content is updated (new item order written to localStorage/home screen intent).
- Old index-based state keys survive in SharedPreferences (e.g. `chk_{id}_2` may now map to a different item).
- **Net effect:** Stale state cross-contamination. On next open, a checkbox that was previously checked will appear checked against the wrong item in the reordered list.
- **Recovery:** User taps Reset inside the viewer to manually clear state. No automatic recovery path. The bug is visually obvious (wrong items appear checked) so users typically notice and reset.

**Failure: `clearChecklistState()` is called before `shortcutId` is available (null guard)**
- Both `TextProxyActivity.clearChecklistState()` and `ShortcutPlugin.clearChecklistState()` guard on `shortcutId != null` and return early.
- **Net effect:** Clear is silently skipped. Behaviorally identical to the `apply()` failure case above.
- **Recovery:** Same — manual Reset in viewer.

#### Design Note

`apply()` is used over `commit()` intentionally — `commit()` blocks the main thread and could freeze the dialog UI on slow storage. The trade-off is that failures are invisible. A future improvement could use `commit()` inside a background thread with a retry on failure, or listen for `SharedPreferences.OnSharedPreferenceChangeListener` to verify the write landed.

---

## 13. Home Screen ↔ App Sync Contract (Android 12+)

### Overview

The app maintains a bidirectional sync between Android home screen shortcuts (via `ShortcutManager`) and the in-app "My Access Points" list (localStorage). This sync is **type-agnostic** — it works identically for all shortcut types (file, link, contact, message, slideshow, **text**).

Recognized intent actions dispatched by `ShortcutPlugin.java`:

| Intent Action | Handled By |
|--------------|------------|
| `app.onetap.OPEN_LINK` | `LinkProxyActivity` |
| `app.onetap.OPEN_CONTACT` | `ContactProxyActivity` |
| `app.onetap.OPEN_MESSAGE` | `MessageProxyActivity` |
| `app.onetap.OPEN_WHATSAPP` | `WhatsAppProxyActivity` |
| `app.onetap.OPEN_PDF` | `PDFProxyActivity` |
| `app.onetap.OPEN_VIDEO` | `VideoProxyActivity` |
| `app.onetap.OPEN_FILE` | `FileProxyActivity` |
| `app.onetap.OPEN_SLIDESHOW` | `SlideshowProxyActivity` |
| `app.onetap.OPEN_TEXT` | `TextProxyActivity` — passes `shortcut_name` (String, dialog title), `text_content` (String), and `is_checklist` (boolean) as intent extras |
| `app.onetap.EDIT_SHORTCUT` | `ShortcutEditProxyActivity` |

### Three-Source Reconciliation Model

The sync uses three independent data sources to make bulletproof decisions:

```
+-------------------+     +---------------------+     +------------------+
| ShortcutManager   |     | SharedPreferences   |     | JS localStorage  |
| (OS pin state)    |     | (creation registry) |     | (full metadata)  |
+-------------------+     +---------------------+     +------------------+
        |                          |                          |
        +----------+---------------+                          |
                   |                                          |
           getPinnedShortcutIds()                              |
           returns ALL three sources                          |
                   |                                          |
                   +------------------------------------------+
                                   |
                          syncWithHomeScreen()
                     uses smart reconciliation logic
```

- **ShortcutManager** — OS-level pin state (`getShortcuts(FLAG_MATCH_PINNED)`)
- **Creation Registry** (`SharedPreferences: shortcut_creation_registry`) — Every shortcut ID ever created by the app, with creation timestamp
- **localStorage** — Full shortcut metadata (name, icon, usage counts, etc.)

### Native Shortcut Creation Registry

A `SharedPreferences` store (`shortcut_creation_registry`) independently tracks every shortcut the app creates:
- **Key**: shortcut ID
- **Value**: creation timestamp (epoch millis)

This registry serves as a secondary source of truth when `ShortcutManager` returns suspicious results (0 pinned IDs on Xiaomi/Huawei, race conditions during creation, third-party launcher state loss).

**Lifecycle:**
- `registerShortcutCreation(id)` — called immediately after `requestPinShortcut()` succeeds
- `unregisterShortcut(id)` — called when a shortcut is explicitly deleted from the app
- Registry self-cleans over time as the OS confirms shortcuts are no longer pinned

### Shadow Dynamic Registration

Every pinned shortcut is also registered as a **dynamic shortcut** ("shadow registration"). This is required because `getShortcuts(FLAG_MATCH_PINNED)` on many OEM launchers (OnePlus, Xiaomi, OPPO, Vivo) only returns shortcuts that also have an active dynamic registration.

### Dynamic Shortcut Pool Management (Timestamp-Based Eviction)

Android imposes a **hard limit** on dynamic shortcuts per app (typically 4–15, varies by OEM). The pool is managed with timestamp-based eviction:

1. Before every `addDynamicShortcuts()` call, `ensureDynamicShortcutSlot()` checks pool capacity
2. If at capacity, `evictOldestDynamicShortcut()` runs:
   - **Pass 1**: Evict the oldest pinned-but-dynamic shortcut outside the 10-second cooldown (it doesn't need the shadow anymore)
   - **Pass 2**: Evict the oldest non-cooldown shortcut regardless of pin state
   - **Never**: Evict a shortcut created within the last 10 seconds (cooldown protection)
3. If eviction fails (all in cooldown), a retry with aggressive eviction is attempted

### Sync Triggers

| Trigger | Location | Behavior |
|---------|----------|----------|
| App mount | `useShortcuts.ts` | Calls `syncWithHomeScreen()` once |
| App resume | `useShortcuts.ts` | Calls `syncWithHomeScreen()` on `appStateChange(isActive)` |
| Delete from app | `useShortcuts.ts` | Calls `disablePinnedShortcut()` then removes from localStorage |

### Reconciliation Logic (`syncWithHomeScreen`)

```
1. Get OS pinned IDs + registry IDs + recently created IDs from native
2. Build "confirmed pinned" set:
   - Start with OS pinned IDs
   - ADD any recently created IDs (created <10s ago, protected from race window)
3. Zero-ID guard (cross-reference with registry):
   - If OS returned 0 AND dynamicCount is -1 (error): skip sync entirely
   - If OS returned 0 AND registry has >3 entries: skip sync (likely OEM API failure)
   - If OS returned 0 AND registry has ≤3 entries: proceed (user may have removed all)
4. Filter localStorage shortcuts against confirmed set
5. Save filtered list (removing orphans)
```

### Failure Mode Coverage

| Scenario | Protection |
|----------|------------|
| OEM returns 0 pinned (Xiaomi/Huawei) | Registry cross-reference blocks false deletion |
| Sync runs 2s after shortcut creation | `recentlyCreatedIds` protects during cooldown |
| Dynamic pool full, shadow fails | Timestamp eviction ensures slot; cooldown protects new entry |
| Samsung 30s cache delay | Cooldown + registry prevent premature deletion |
| Third-party launcher loses state | Registry preserves knowledge of creation |
| User actually removes shortcut | OS confirms removal; shortcut filtered out on next sync |

### Things Android Will Never Tell Us

1. **Shortcut was unpinned** — No broadcast. Must poll via `getShortcuts(FLAG_MATCH_PINNED)` on foreground.
2. **Dynamic shortcut limit exceeded** — Exception thrown but no proactive signal. Must manage pool preemptively.
3. **Launcher changed** — No broadcast. `isPinned()` may become unreliable. Re-sync on every foreground.
4. **File permissions revoked** — No signal. Mitigated by copying files to app-internal storage.

---

*Last updated: February 2026*
