

## Local Storage Sanity Evaluation

### Complete Local Storage Key Inventory

The app uses **30+ distinct localStorage keys** across multiple managers. Here is the full map followed by identified gaps.

### Identified Gaps and Vulnerabilities

---

#### GAP 1: `bulkDelete` in scheduledActionsManager Does Not Record Deletions for Cloud Sync

**Severity: High (data resurrection on sync)**

`deleteScheduledAction()` correctly calls `recordDeletion('scheduled_action', id)` before removing the action. However, `bulkDelete()` (lines 209-222) skips this entirely -- it filters out the actions and saves, but never records them in the deletion tracker.

**Impact**: After a bulk delete + sync, the cloud still has those actions. On the next download, they get re-added to localStorage. The user deletes actions that keep coming back.

**Fix**: Add `ids.forEach(id => recordDeletion('scheduled_action', id))` inside the `if (deletedCount > 0)` block before saving.

---

#### GAP 2: `bulkDelete` Does Not Cancel Native Alarms

**Severity: High (phantom notifications)**

`deleteScheduledAction()` in `useScheduledActions.ts` correctly calls `ShortcutPlugin.cancelScheduledAction({ id })` before deleting. But `bulkDelete` in `scheduledActionsManager.ts` is a storage-only function -- it does not cancel any native alarms. If bulk delete is called without cancelling alarms first, the deleted actions' alarms continue running and fire notifications for actions that no longer exist.

**Fix**: The caller of `bulkDelete` must cancel native alarms for each ID. Audit all call sites to ensure this happens. Alternatively, add a `bulkDeleteScheduledActions` function in `useScheduledActions.ts` that handles both.

---

#### GAP 3: Selection State (`scheduled_actions_selection`) Persists Across Sessions Unnecessarily

**Severity: Low-Medium (confusing UX)**

The multi-select state for scheduled actions is stored in localStorage and survives app restarts. If a user selects several items, closes the app, and returns later, the selection is silently restored. The UI may not be in "selection mode" though, so the persisted IDs become stale orphans.

**Fix**: Either (a) clear selection on mount in the Notifications page, or (b) move selection state to React state only (no localStorage persistence). Selection is a transient UI concept, not application data.

---

#### GAP 4: `clipboard_shown_urls` Grows Without Bounds

**Severity: Low (minor storage bloat)**

`useClipboardDetection.ts` appends to `clipboard_shown_urls` every time a URL is detected. The `getShownUrls()` function filters out entries older than 5 minutes when reading, but never writes the filtered result back. Over months of use, this key accumulates thousands of expired entries.

**Fix**: In `getShownUrls()`, write the filtered result back to localStorage if entries were purged, or cap the list at a reasonable size (e.g., 50 entries).

---

#### GAP 5: `processed_oauth_urls` Never Cleaned Up

**Severity: Low (minor storage bloat)**

`oauthCompletion.ts` maintains a list of processed OAuth URL identifiers (capped at 20). These are never cleaned up even after sign-out. While the cap prevents unbounded growth, stale OAuth identifiers from previous sessions could theoretically block a valid re-authentication if the same OAuth code is somehow reused.

**Impact**: Minimal due to the 20-entry cap, but semantically incorrect after sign-out.

**Fix**: Clear `processed_oauth_urls`, `pending_oauth_url`, and `oauth_started_at` during sign-out (in `useAuth.signOut`). Currently only `clearPendingOAuth()` is called, which clears the pending URL but not the processed list.

---

#### GAP 6: Sign-Out Does Not Clear Sync-Related State

**Severity: Medium (stale sync state for next user)**

When a user signs out (`useAuth.signOut`), the code clears:
- `sb-*` auth storage key
- Pending OAuth state

But it does NOT clear:
- `onetap_sync_status` (last sync time, counts -- belongs to the previous user)
- `pending_cloud_deletions` (deletion records for the previous user's entities)

If a different user signs in on the same device, the sync status shows the previous user's last sync time, and pending deletions from user A could be uploaded under user B's account, deleting user B's cloud data.

**Fix**: In `signOut`, also call `clearSyncStatus()` and `clearPendingDeletions()`.

---

#### GAP 7: `onetap_favicon_cache` Has No Expiry

**Severity: Low (stale favicons, storage bloat)**

The favicon/metadata cache (`useUrlMetadata.ts`) caps at 500 entries but has no TTL. A favicon URL that changed months ago will continue showing the cached version indefinitely. The cache is loaded into memory at module init and persisted on every update.

**Fix**: Add a `cachedAt` timestamp to each entry and filter out entries older than 7-14 days during `loadFaviconCache()`.

---

#### GAP 8: `onetap_review_jitter_days` Persists After Review Completion

**Severity: Trivial (dead key)**

Once `onetap_review_prompt_done` is set to `'true'`, the `onetap_review_jitter_days` key becomes permanently unused but remains in localStorage.

**Fix**: Clean it up in `markDone()` or ignore (truly negligible).

---

#### GAP 9: Downloaded Trash Items from Cloud Marked as Non-Restorable but Lack Visual Indication

**Severity: Low-Medium (confusing UX)**

When trash items are downloaded from cloud, they are marked `restorable: false` (line 684 in cloudSync.ts shows no such field set -- let me verify). Actually, reviewing the download code: cloud-downloaded trash items do NOT set `restorable: false`. This means a user could restore a cloud-downloaded trash item, which would create a bookmark with an ID that may conflict with the cloud state during next sync.

Actually, the download code at line 677 creates a `TrashedLink` without `restorable` field, so it defaults to `true`. If the user restores it, it moves to `saved_links`. On next upload, it gets upserted to `cloud_bookmarks` with the same entity_id -- which is actually correct behavior (additive). This is safe.

**Revised assessment**: No gap here. Withdrawing.

---

#### GAP 10: `useShortcuts` Stale Closure in `deleteShortcut` and `updateShortcut`

**Severity: Medium (race condition on rapid operations)**

Both `deleteShortcut` and `updateShortcut` use `shortcuts` from the closure (the React state array). If a user rapidly creates and then deletes shortcuts, the `shortcuts` array in the closure may be stale. For example:
1. User creates shortcut A (shortcuts = [A])
2. User creates shortcut B (shortcuts = [A, B])
3. User immediately deletes A -- but `deleteShortcut` still has `shortcuts = [A]` from its closure
4. Result: `shortcuts.filter(s => s.id !== 'A')` produces `[]`, losing shortcut B

`createShortcut` has the same pattern: it spreads `[...shortcuts, newShortcut]` using the closure value.

**Fix**: Use functional state updates (`setShortcuts(prev => prev.filter(...))`) or read from localStorage directly in mutation functions.

---

#### GAP 11: `updateSavedLinkTitle` Does Not Fire Change Event

**Severity: Low (stale UI in other components)**

`savedLinksManager.ts` has `updateSavedLinkTitle()` (line 253) which saves to localStorage but does NOT call `notifyChange()`. Any component listening for `bookmarks-changed` events will not re-render when a title is updated through this function.

**Fix**: Add `notifyChange()` after the `localStorage.setItem` call.

---

#### GAP 12: `toggleShortlist` and `clearAllShortlist` Do Not Fire Change Events

**Severity: Low (stale state in other hook instances)**

`toggleShortlist()` (line 273) and `clearAllShortlist()` (line 287) modify `saved_links` in localStorage but do not call `notifyChange()`. Cloud sync listeners and other components watching for `bookmarks-changed` won't pick up shortlist changes.

**Fix**: Add `notifyChange()` calls to both functions.

---

### Summary of Fixes by Priority

| Priority | Gap | Issue | Effort |
|----------|-----|-------|--------|
| High | 1 | `bulkDelete` missing `recordDeletion` -- data resurrection | Trivial |
| High | 2 | `bulkDelete` doesn't cancel native alarms -- phantom notifications | Small |
| Medium | 6 | Sign-out doesn't clear sync status / pending deletions | Trivial |
| Medium | 10 | Stale closure race in useShortcuts mutations | Medium |
| Low-Med | 3 | Selection state persists across sessions | Trivial |
| Low | 4 | `clipboard_shown_urls` unbounded growth | Trivial |
| Low | 5 | `processed_oauth_urls` not cleared on sign-out | Trivial |
| Low | 7 | Favicon cache has no TTL | Small |
| Low | 11 | `updateSavedLinkTitle` missing change event | Trivial |
| Low | 12 | `toggleShortlist` / `clearAllShortlist` missing change events | Trivial |
| Trivial | 8 | Dead `review_jitter_days` key after completion | Trivial |

### Recommended Immediate Fixes

**Critical path (Gaps 1, 2, 6, 10):**

1. **scheduledActionsManager.ts `bulkDelete`**: Add `recordDeletion` calls for each deleted ID
2. **Create `bulkDeleteScheduledActions` in useScheduledActions**: Cancel native alarms before calling `bulkDelete`
3. **useAuth.ts `signOut`**: Add `clearSyncStatus()` and `clearPendingDeletions()` calls
4. **useShortcuts.ts**: Refactor `deleteShortcut`, `createShortcut`, and `updateShortcut` to use functional state updates or read from localStorage directly

**Quick wins (Gaps 3, 4, 5, 11, 12):**

5. **scheduledActionsManager.ts**: Clear selection on component mount or remove localStorage persistence for selection
6. **useClipboardDetection.ts**: Write filtered entries back in `getShownUrls()`
7. **useAuth.ts signOut**: Also clear `processed_oauth_urls`
8. **savedLinksManager.ts**: Add `notifyChange()` to `updateSavedLinkTitle`, `toggleShortlist`, `clearAllShortlist`

### Files to Modify

| File | Changes |
|------|---------|
| `src/lib/scheduledActionsManager.ts` | Add `recordDeletion` in `bulkDelete`; optionally clear selection key on module load |
| `src/hooks/useScheduledActions.ts` | Add `bulkDeleteScheduledActions` that cancels alarms + calls bulkDelete |
| `src/hooks/useAuth.ts` | Clear sync status + pending deletions + processed OAuth on sign-out |
| `src/hooks/useShortcuts.ts` | Refactor mutations to avoid stale closure |
| `src/hooks/useClipboardDetection.ts` | Write-back filtered entries in `getShownUrls` |
| `src/lib/savedLinksManager.ts` | Add `notifyChange()` to title update, shortlist toggle, and clear shortlist |

