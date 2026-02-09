# OneTap Shortcuts - Backend (Lovable Cloud)

## Overview

The backend is used **only** for optional cloud sync and Google OAuth. The app is fully functional without it.

**Principles:**
- Local device is source of truth
- Cloud is additive-only (never deletes/overwrites local data)
- No background sync, no polling, no realtime subscriptions
- No analytics, no tracking
- $0 fixed monthly cost

---

## Database Schema

### `cloud_bookmarks`

Stores synced bookmarks. Keyed by `entity_id` (the local UUID).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | Auto-generated |
| `entity_id` | UUID (UNIQUE) | Maps to local bookmark `id` |
| `user_id` | UUID | Owner |
| `url` | TEXT | Original URL |
| `title` | TEXT | Page title |
| `description` | TEXT | Page description |
| `favicon` | TEXT | Favicon URL |
| `folder` | TEXT | Folder/tag name |
| `created_at` | TIMESTAMPTZ | Cloud creation time |
| `updated_at` | TIMESTAMPTZ | Last cloud update |

**RLS:** Users can only SELECT, INSERT, UPDATE, DELETE their own rows (`auth.uid() = user_id`).

### `cloud_trash`

Stores synced soft-deleted bookmarks.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | Auto-generated |
| `entity_id` | UUID | Maps to local trashed item |
| `user_id` | UUID | Owner |
| `url` | TEXT | Original URL |
| `title` | TEXT | Page title |
| `description` | TEXT | Page description |
| `folder` | TEXT | Folder/tag name |
| `deleted_at` | TIMESTAMPTZ | When deleted |
| `original_created_at` | TIMESTAMPTZ | Original creation time |
| `retention_days` | INT | Trash retention period |
| `created_at` | TIMESTAMPTZ | Cloud creation time |
| `updated_at` | TIMESTAMPTZ | Last cloud update |

**RLS:** Same as `cloud_bookmarks`.

### `cloud_scheduled_actions`

Stores synced reminders.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | Auto-generated |
| `entity_id` | UUID | Maps to local action `id` |
| `user_id` | UUID | Owner |
| `name` | TEXT | Reminder name |
| `description` | TEXT | Description |
| `destination` | JSONB | Target (URL, contact, etc.) |
| `trigger_time` | BIGINT | Unix timestamp |
| `recurrence` | TEXT | Recurrence pattern |
| `recurrence_anchor` | JSONB | Anchor data for recurrence |
| `enabled` | BOOLEAN | Active status |
| `original_created_at` | BIGINT | Local creation timestamp |
| `created_at` | TIMESTAMPTZ | Cloud creation time |
| `updated_at` | TIMESTAMPTZ | Last cloud update |

**RLS:** Same as `cloud_bookmarks`.

---

## Edge Functions

### `fetch-url-metadata`

**Purpose:** Server-side URL fetch to bypass CORS restrictions. Extracts page title and favicon.

- **Method:** POST
- **Auth:** None required (public)
- **Body:** `{ "url": "https://example.com" }`
- **Response:** `{ "title": "...", "favicon": "...", "domain": "..." }`
- **Timeout:** 5 seconds per fetch
- **Fallback:** Google Favicons API if page fetch fails

### `delete-account`

**Purpose:** Deletes user's cloud data and auth account.

- **Method:** POST
- **Auth:** Required (Bearer token)
- **Flow:**
  1. Validates JWT
  2. Deletes from `cloud_bookmarks` (by `user_id`)
  3. Deletes from `cloud_trash` (by `user_id`)
  4. Deletes auth user via admin API
- **Response:** `{ "success": true }`

---

## Authentication

- **Provider:** Google OAuth only
- **Mechanism:** Android App Links (HTTPS deep links)
- **Sign-in is optional** — no features are gated behind auth
- **Session:** Managed by Supabase Auth SDK, stored in localStorage

### Key Files

| File | Purpose |
|------|---------|
| `src/hooks/useAuth.ts` | Auth state + sign-in/out functions |
| `src/lib/oauthCompletion.ts` | Shared OAuth completion logic |
| `src/hooks/useDeepLink.ts` | Native deep link handling |
| `src/pages/AuthCallback.tsx` | Web callback route |
| `public/.well-known/assetlinks.json` | Android App Links verification |

---

## Sync Contract

All sync goes through `src/lib/syncGuard.ts`. See `PRODUCT_IDEOLOGY.md` for the full philosophy.

**Upload:** Upserts by `(user_id, entity_id)` — same entity overwrites in cloud.
**Download:** Skips any `entity_id` that already exists locally.

**Key files:**
- `src/lib/syncGuard.ts` — Runtime guards
- `src/lib/cloudSync.ts` — Guarded sync entry points
- `src/lib/syncStatusManager.ts` — Timing state
- `src/hooks/useAutoSync.ts` — Daily foreground check

---

## Security

- RLS enabled on all tables
- Users can only access their own data
- `delete-account` uses service role key server-side only
- No sensitive data in localStorage beyond user preferences
- OAuth tokens managed by Supabase Auth (not stored manually)

---

*Last updated: February 2026*
