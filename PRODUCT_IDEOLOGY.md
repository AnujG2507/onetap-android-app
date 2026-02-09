# OneTap Shortcuts — Product Ideology

> **"One tap to what matters. Nothing else."**

---

## What This Document Is

This document defines the **non-negotiable principles** that guide every product and technical decision in OneTap. These are not suggestions or best practices — they are hard constraints that the codebase actively enforces through runtime guards, architectural choices, and code review standards.

If you are adding a feature, fixing a bug, or refactoring code, read this first. Every change must pass the [Success Criteria](#10-success-criteria) at the bottom.

---

## 1. Local-First Sovereignty

**The user's device is the single source of truth. Always.**

### What This Means

- Every bookmark, shortcut, and reminder is created locally with a UUID (`entity_id`)
- That `entity_id` is **permanent** — it is never reassigned, overwritten, or replaced by the cloud
- Cloud sync only **adds** data that doesn't exist locally — it never updates or deletes local data
- If there is a conflict between local and cloud, **local wins**

### Why This Matters

Users paid for this app. Their data belongs to them, on their device. If the cloud disappeared tomorrow, nothing should change for the user.

### How It's Enforced

The cloud sync functions in `src/lib/cloudSync.ts` check each item's `entity_id` before inserting. If a matching `entity_id` already exists locally, the cloud version is skipped.

```
Cloud says: "Here's a bookmark with entity_id ABC"
Local check: "I already have entity_id ABC"
Result: Skip. Local version is kept unchanged.
```

⚠️ **DANGER:**
Never write code that updates or deletes local data based on what the cloud returns.
This would violate the most fundamental principle of the app.

---

## 2. Calm UX and Premium Feel

**The app should feel inevitable, not clever.**

### Rules

1. **No "Are you sure?" dialogs** — if an action is reversible (like trash), just do it
2. **No blocking error modals** — errors are handled gracefully in the background
3. **No spinners lasting more than 2 seconds** — use skeleton placeholders instead
4. **No countdowns or anxiety indicators** — the app should feel patient
5. **Ambient feedback only** — use status dots and subtle indicators, not alert banners
6. **Graceful offline behavior** — features work without internet, failures are silent

### The Trust Principle

> The user should never feel watched, rushed, or punished for being offline.

If a feature makes the user anxious, it's designed wrong.

### Examples

| ❌ Wrong | ✅ Right |
|----------|---------|
| "Are you sure you want to delete?" | Move to trash silently (user can restore) |
| Spinning loader for 10 seconds | Skeleton placeholder that feels instant |
| "Error: Network unavailable" modal | Silently queue the action for later |
| "Syncing..." banner that won't go away | Small status dot that changes color |

---

## 3. Intentional Sync (Not Reactive)

**Sync is a convergence operation, not a live mirror.**

Users should never feel that data is being uploaded constantly or invisibly. Sync happens only when the user asks for it or when a calm daily check runs.

### Allowed Sync Triggers (This Is the Complete List)

| Trigger | When It Happens | How Often |
|---------|-----------------|-----------|
| **Manual** | User taps "Sync Now" in the profile screen | Unlimited |
| **Daily auto** | App comes to foreground + auto-sync is enabled + more than 24 hours since last sync | Once per day maximum |

There are no other triggers. Period.

### Explicitly Forbidden (Never Add These)

- ❌ Sync on every create, update, or delete operation
- ❌ Sync triggered by debounced state changes
- ❌ Sync loops caused by React effects or event listeners
- ❌ Background timers, polling, or scheduled workers
- ❌ Sync during local state mutation
- ❌ "Helpful" automatic retries that bypass timing constraints
- ❌ Sync on network reconnection

### How This Is Enforced: The Sync Guard (`src/lib/syncGuard.ts`)

The sync guard is a runtime enforcement layer that makes it **impossible** to silently reintroduce reactive sync. Every sync operation must declare its trigger:

```typescript
// These are the ONLY valid entry points for sync
guardedSync('manual')      // User pressed the Sync Now button
guardedSync('daily_auto')  // Foreground daily check passed all conditions
```

Before any sync runs, the guard validates:

```
1. Is another sync already running? → Block (no concurrent syncs)
2. Was this called too rapidly? → Block (likely an effect loop)
3. Has daily_auto already run this session? → Block (one per session)
4. Is the trigger recognized? → Block unknown triggers
```

**What happens when a violation is detected:**

| Environment | Behavior |
|-------------|----------|
| Development | Throws `SyncGuardViolation` error immediately — you cannot ignore it |
| Production | Logs a warning, safely does nothing, app continues working |

⚠️ **DANGER:**
Never bypass the sync guard. Never call internal sync functions directly.
If you need a new sync trigger, add it to the guard's allowed list first.

---

## 4. Efficiency ("One Tap")

**Minimize friction. Every tap should feel purposeful.**

### Design Rules

1. **Clipboard detection** — when the user copies a URL, the app detects it and pre-fills the input
2. **Smart defaults** — the most common action is pre-selected so the user can just tap "Done"
3. **Combined flows** — "Edit & Save" happens in one step, not two separate screens
4. **No unnecessary screens** — every intermediate screen must justify its existence

### The Test

For any user flow, ask: "Can I remove one step from this?" If yes, remove it.

---

## 5. Resource Respect

**The app is a guest on the user's device.**

### Hard Rules

- ❌ No background workers or persistent services
- ❌ No wake locks or battery-draining behaviors
- ❌ No analytics, tracking, or telemetry
- ❌ No advertising SDKs
- ✅ Sync only happens in the foreground, triggered by user action or daily check
- ✅ Reminders use native Android alarms (`AlarmManager`), not internal polling

### Why No Analytics?

OneTap is a paid app with no ads and no subscriptions. There is no business reason to track users. The user's trust is more valuable than usage metrics.

---

## 6. Offline-First

**All core features must function without internet.**

| Feature | Works Offline? | Notes |
|---------|---------------|-------|
| Create shortcuts | ✅ Yes | Fully local |
| Manage bookmarks | ✅ Yes | Stored in localStorage |
| Schedule reminders | ✅ Yes | Uses native Android alarms |
| Fetch URL metadata | ⚠️ Partial | Falls back to URL-only display |
| Cloud sync | ❌ No | Requires internet (but sync is optional) |
| Sign in | ❌ No | Requires internet (but sign-in is optional) |

### The Offline Promise

> Cloud is optional. The app is fully functional without sign-in, without internet, and without a Supabase account. If Supabase shut down tomorrow, every user's app would continue working exactly as before.

---

## 7. Auth Philosophy

**Sign-in is optional and non-blocking.**

### Rules

1. Auth exists **only** to unlock cloud sync — nothing else
2. **No features are gated behind sign-in** — every feature works without an account
3. OAuth edge cases (expired tokens, failed redirects) are handled gracefully
4. Session recovery happens silently in the background — never with a modal or redirect

### What This Means for Development

When you build a new feature, it must work for both signed-in and signed-out users. If it requires auth, you're probably building it wrong.

---

## 8. Branding and Terminology

**Language shapes perception.** Use the OneTap vocabulary consistently.

| ❌ Internal / Technical Term | ✅ User-Facing Term |
|------------------------------|---------------------|
| Shortcut | One Tap Access |
| Scheduled Shortcut | One Tap Reminder |
| Create Shortcut | Set Up One Tap Access |
| Shortcut Name | Access Name |
| Shortcut list | My Access Points |

### Why This Matters

"Shortcut" is a generic Android term. "One Tap Access" communicates the product's unique value. Every label the user sees should reinforce what makes OneTap special.

---

## 9. Technical Contracts

These are the specific code-level constraints that enforce the ideology above. If you're modifying sync, data, or timing logic, you must understand these.

### 9.1 Sync Guard Contract

```typescript
// All sync MUST go through these guarded entry points
guardedSync(trigger)    // Primary bidirectional sync
guardedUpload()         // Recovery tool only
guardedDownload()       // Recovery tool only

// Internal sync functions are private — you cannot call them directly
// Any attempt to bypass guards will throw in development
```

**Key files:** `src/lib/syncGuard.ts`, `src/lib/cloudSync.ts`

### 9.2 Data Identity Contract

```typescript
// entity_id is sacred — generated locally, never reassigned
bookmark.id === cloud_bookmark.entity_id

// Cloud upserts use entity_id as the unique key, NOT the URL
// Two bookmarks can have the same URL but different entity_ids
onConflict: 'user_id,entity_id'
```

**Key files:** `src/lib/savedLinksManager.ts`, `src/lib/cloudSync.ts`

### 9.3 Timing Contract

```typescript
// Daily auto-sync: minimum 24 hours between successful syncs
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// Session limit: only ONE daily_auto attempt per app session
// Even if it fails, it won't retry until the next session
dailySyncAttemptedThisSession = true;
```

**Key files:** `src/lib/syncGuard.ts`, `src/hooks/useAutoSync.ts`

---

## 10. Success Criteria

**A feature is complete only when ALL of these are true:**

- [ ] ✅ Works fully offline (no internet required for core functionality)
- [ ] ✅ Respects local sovereignty (never overwrites local data from cloud)
- [ ] ✅ Feels calm and predictable (no anxiety-inducing UI patterns)
- [ ] ✅ No background resource usage (no workers, polling, or persistent services)
- [ ] ✅ Enforced by code, not convention (guards and contracts prevent regressions)

If any checkbox is unchecked, the feature is not ready to ship.

---

## 11. Platform Independence

**OneTap has zero platform lock-in.**

### Production Stack

| Component | Technology | Role |
|-----------|-----------|------|
| App | React + Capacitor + Native Java | Android application |
| Backend | Supabase | Auth, cloud sync, URL metadata |
| Website | Vercel | Marketing site, privacy policy, `assetlinks.json` |

### What This Means

- The app does not depend on any specific code editor, IDE, or development platform
- The backend is Supabase — there are no abstraction layers for "swapping backends"
- The website is a static site on Vercel — no server-side rendering or platform dependencies
- Any engineer with Git access can build, deploy, and maintain the entire system

---

*Last updated: February 2026*
