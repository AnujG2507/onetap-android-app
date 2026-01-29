# OneTap Shortcuts - Product Ideology

**"One tap to what matters. Nothing else."**

This document defines the core principles that guide all product and technical decisions. These are not guidelines—they are constraints that the codebase actively enforces.

---

## 1. Local-First Sovereignty

**The local device is the canonical source of truth.**

- `entity_id` is generated locally (UUID) and never reassigned
- Cloud operations are strictly **additive-only**
- The system never overwrites or deletes local data based on cloud state
- If conflict resolution is needed, local intent wins

**Enforcement**: Cloud sync functions only add items whose `entity_id` doesn't exist locally. No update or delete operations based on cloud state.

---

## 2. Calm UX & Premium Feel

**The app should feel inevitable, not clever.**

- No redundant confirmations or "Are you sure?" dialogs
- No blocking modals or "error walls"
- No countdowns, spinners lasting >2s, or anxiety-inducing indicators
- Ambient feedback over intrusive notifications (status dots, not alerts)
- Graceful degradation—features work offline, failures are silent

**User trust principle**: The user should never feel watched, rushed, or punished for being offline.

---

## 3. Intentional Sync (Not Reactive)

**Sync is a convergence operation, not a live mirror.**

Users should never feel that data is being uploaded constantly or invisibly.

### Allowed Sync Triggers (Exhaustive)

| Trigger | When | Frequency |
|---------|------|-----------|
| **Manual** | User presses "Sync Now" | Unlimited |
| **Daily auto** | App foregrounded + auto-sync enabled + >24h elapsed | Once per day |

### Explicitly Forbidden

- ❌ Sync on every CRUD operation
- ❌ Sync triggered by debounced state changes
- ❌ Sync loops caused by effects or listeners
- ❌ Background timers, polling, or scheduled workers
- ❌ Sync during local state mutation
- ❌ "Helpful" retries that bypass timing constraints

### Runtime Enforcement (`syncGuard.ts`)

The sync guard module enforces philosophy at runtime, making it **impossible** to silently reintroduce reactive sync:

```typescript
// Every sync must declare its trigger
guardedSync('manual')      // User pressed button
guardedSync('daily_auto')  // Foreground daily check

// Guards validate before execution
validateSyncAttempt(trigger) → { allowed, reason }
```

**Guard violations:**
- **Development**: Throws `SyncGuardViolation` immediately—regressions cannot be ignored
- **Production**: Logs warning, safely no-ops, app continues functioning

**Detected violations:**
- Concurrent sync attempts
- Rapid repeated calls (effect loops)
- Multiple daily syncs per session
- Unknown or undeclared triggers

---

## 4. Efficiency ("One Tap")

**Minimize friction. Every tap should feel purposeful.**

- Clipboard detection pre-fills URLs
- Default actions are pre-selected
- Combined flows: "Edit & Save" as one action
- No intermediate screens unless necessary

---

## 5. Resource Respect

**The app is a guest on the user's device.**

- ❌ No background workers, polling, or persistent services
- ❌ No wake locks or battery-draining behaviors
- Sync is event-driven (foreground return only)
- Native Android alarms for reminders (not internal polling)

---

## 6. Offline-First

**All core features must function without internet.**

- Shortcut creation: Works offline
- Bookmark management: Works offline
- Reminder scheduling: Works offline (native alarms)
- Metadata fetching: Graceful fallback to URL-only

Cloud is optional. The app is fully functional without sign-in.

---

## 7. Auth Philosophy

**Sign-in is optional and non-blocking.**

- Auth only unlocks cloud sync
- No features are gated behind sign-in
- OAuth flow handles edge cases gracefully
- Session recovery is silent, not modal

---

## 8. Branding & Terminology

**Language shapes perception.**

| Instead of | Use |
|------------|-----|
| Shortcut | One Tap Access |
| Scheduled Shortcut | One Tap Reminder |
| Create Shortcut | Set Up One Tap Access |
| Shortcut Name | Access Name |

---

## 9. Technical Constraints

### Sync Guard Contract

```typescript
// All sync MUST go through guarded entry points
guardedSync(trigger)    // Primary bidirectional
guardedUpload()         // Recovery only
guardedDownload()       // Recovery only

// Internal functions are private - cannot be called directly
// Legacy exports route through guards with deprecation warnings
```

### Data Identity Contract

```typescript
// entity_id is sacred - generated locally, never reassigned
bookmark.id === cloud_bookmark.entity_id

// Cloud uses entity_id for upsert, not URL
onConflict: 'user_id,entity_id'
```

### Timing Contract

```typescript
// Daily sync: minimum 24h between successful syncs
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// Session limit: only one daily_auto attempt per session
dailySyncAttemptedThisSession = true;
```

---

## 10. Success Criteria

A feature is complete only if:

1. ✅ Works fully offline
2. ✅ Respects local sovereignty
3. ✅ Feels calm and predictable
4. ✅ No background resource usage
5. ✅ Enforced by code, not convention

---

*Last updated: January 2026*
