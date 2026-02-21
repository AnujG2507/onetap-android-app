

## Documentation Update Plan

### Overview

After comparing all 9 documentation files against the current codebase, I identified **14 gaps** where documentation is outdated, incomplete, or inconsistent with recent code changes (localStorage sanity fixes, UI/UX safe-area corrections, snooze feature, settings additions).

---

### Gap 1: ARCHITECTURE.md -- Safe Area Decision Guide Is Wrong for Sheets

**Lines 171-172:** The decision guide says:
```
Is the element a bottom Sheet (Radix, side="bottom")?
  -> safe-bottom-with-nav
```

But we changed `sheet.tsx` to use `safe-bottom-sheet` (not `safe-bottom-with-nav`). The guide now directs developers to the wrong class.

**Also line 121:** The UI Components diagram shows `SheetContent side=bottom` using `.safe-bottom-with-nav` -- this is now `.safe-bottom-sheet`.

**Fix:** Update both the diagram and the decision guide to reflect `safe-bottom-sheet` for bottom sheets.

---

### Gap 2: ARCHITECTURE.md -- Toast Viewport Safe Area Not Documented

The toast viewport was changed from `safe-bottom-with-nav` to `safe-bottom`. Neither the diagram nor the decision guide mentions toast positioning.

**Fix:** Add a line to the decision guide for toast viewport.

---

### Gap 3: APP_SUMMARY.md -- Settings Block Missing `snoozeDurationMinutes`

The Settings section (line 247-255) is missing the `snoozeDurationMinutes` field that was added to `AppSettings`.

**Fix:** Add `snoozeDurationMinutes: 5|10|15|30;` to the settings block.

---

### Gap 4: APP_SUMMARY.md -- Missing Snooze Feature Under Reminders

Section "3. One Tap Reminders" (line 26-28) does not mention the snooze capability added to notifications.

**Fix:** Add a bullet point about notification snooze (configurable duration, countdown timer, re-fires original notification).

---

### Gap 5: APP_SUMMARY.md -- Local Storage Keys Section Is Incomplete

The "Local Storage Keys" section (lines 73-79) lists only 5 keys. The app uses 30+ keys. Critical missing keys include:

- `quicklaunch_shortcuts` (the actual shortcut data)
- `pending_cloud_deletions` (deletion reconciliation)
- `onetap_favicon_cache` (URL metadata cache)
- `clipboard_shown_urls` (clipboard detection)
- `onetap_review_prompt_done` / `onetap_review_jitter_days`
- `custom_folders` (bookmark folder names)
- `scheduled_actions_selection` (transient multi-select)
- `processed_oauth_urls` / `pending_oauth_url` / `oauth_started_at`
- `onetap_onboarding_done`
- `onetap_tutorial_*` (coach marks)
- `onetap_usage_*` (usage history)

**Fix:** Add a comprehensive localStorage key inventory grouped by category (core data, sync, auth, cache, UI state).

---

### Gap 6: APP_SUMMARY.md -- Missing Sign-Out Cleanup Documentation

The Auth section does not document what `signOut` clears. After recent fixes, sign-out now clears sync status, pending deletions, and processed OAuth URLs to prevent cross-user contamination.

**Fix:** Add a "Sign-Out Cleanup" subsection under Auth.

---

### Gap 7: APP_SUMMARY.md -- Missing `cloud_shortcuts` and `cloud_deleted_entities` in Cloud Schema

The Cloud Schema section (lines 96-113) only shows `cloud_bookmarks` and `cloud_shortcuts`. It omits `cloud_trash`, `cloud_scheduled_actions`, and `cloud_deleted_entities`. While `cloud_shortcuts` is partially shown, the others are described in SUPABASE.md but not in this summary document.

**Fix:** Add brief schema entries for all 5 cloud tables.

---

### Gap 8: APP_SUMMARY.md -- Key Files Section Missing Recent Additions

The "Key Files" section (lines 188-208) is missing:
- `src/lib/deletionTracker.ts` -- deletion reconciliation
- `src/hooks/useReviewPrompt.ts` -- review prompt logic
- `src/hooks/useClipboardDetection.ts` -- clipboard URL detection
- `src/hooks/useUrlMetadata.ts` -- favicon cache with TTL

**Fix:** Add these to the appropriate subsection.

---

### Gap 9: UBUNTU_SETUP.md -- Section 8 "Activate Native Code" Is Completely Outdated

Section 8 (lines 233-261) instructs users to manually uncomment Java files and XML in the `android/` directory. This workflow is obsolete -- the `patch-android-project.mjs` script now automatically copies all native files from `native/android/` to `android/`. Users should never manually edit files in `android/`.

**Fix:** Replace Section 8 with a note that the patch script handles native code activation automatically, and remove the manual uncommenting instructions.

---

### Gap 10: DEPLOYMENT.md -- Edge Functions Section Has Inconsistent CLI Instructions

Section 11 (lines 294-311) uses `npm install -g supabase` and bare `supabase` commands. Section 7 of SUPABASE.md correctly recommends `npx supabase` to avoid permission issues. The two documents give conflicting advice.

**Fix:** Update DEPLOYMENT.md Section 11 to use `npx supabase` consistently, matching SUPABASE.md.

---

### Gap 11: ARCHITECTURE.md -- Floating Element Z-Index Documentation Missing

The recent UI/UX fixes normalized z-index values across floating elements (FABs at z-30, action bars at z-30). No documentation covers the z-index conventions. This will drift again without a reference.

**Fix:** Add a small z-index convention table to the Safe Area Design System section or as a new subsection.

---

### Gap 12: APP_SUMMARY.md -- `bulkDeleteScheduledActions` Not Documented

The new `bulkDeleteScheduledActions` function in `useScheduledActions.ts` (which cancels native alarms before storage deletion and records deletions for cloud sync) is not mentioned anywhere in documentation.

**Fix:** Add to Key Files / Data Management section.

---

### Gap 13: PRODUCT_IDEOLOGY.md -- Snooze Is Not Listed in Offline Feature Table

The offline feature table (Section 6, lines 173-181) lists features and their offline status. Snooze is a new notification-layer feature that works fully offline but is not listed.

**Fix:** Add "Snooze reminders" row with checkmark and note that it uses native AlarmManager.

---

### Gap 14: APP_SUMMARY.md -- Last Updated Date

The file says "Last updated: February 20, 2026" but significant changes have been made since (localStorage fixes, UI/UX fixes, snooze feature).

**Fix:** Update to current date.

---

### Implementation Plan

All changes are documentation-only (Markdown files). No code changes required.

**Files to modify:**

| File | Gaps Addressed |
|------|---------------|
| `ARCHITECTURE.md` | 1, 2, 11 |
| `APP_SUMMARY.md` | 3, 4, 5, 6, 7, 8, 12, 14 |
| `UBUNTU_SETUP.md` | 9 |
| `DEPLOYMENT.md` | 10 |
| `PRODUCT_IDEOLOGY.md` | 13 |

**Order of changes:**

1. APP_SUMMARY.md (most gaps, highest documentation value)
2. ARCHITECTURE.md (safe area corrections affect developer decisions)
3. UBUNTU_SETUP.md (outdated section could cause build failures)
4. DEPLOYMENT.md (minor CLI inconsistency)
5. PRODUCT_IDEOLOGY.md (single row addition)

