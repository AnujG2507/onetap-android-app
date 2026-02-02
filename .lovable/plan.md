
# Sync for Scheduled Reminders - Implementation Plan

## ✅ COMPLETED - February 2026

### Implementation Summary

The scheduled reminders sync feature has been successfully implemented following the "calm sync" philosophy.

---

## What Was Implemented

### Phase 1: Database Schema ✅
- Created `cloud_scheduled_actions` table with:
  - JSONB columns for `destination` and `recurrence_anchor`
  - RLS policies for user data isolation
  - `updated_at` trigger for automatic timestamps
  - Unique constraint on `(user_id, entity_id)`

### Phase 2: cloudSync.ts Extension ✅
- Added `CloudScheduledAction` type definition
- Implemented `uploadScheduledActionsInternal()`:
  - Upserts local actions to cloud using entity_id
  - Handles JSONB serialization for destination/anchor
- Implemented `downloadScheduledActionsInternal()`:
  - Downloads cloud actions and merges missing ones to local
  - Recalculates trigger times for past-due recurring actions
  - Disables one-time past-due actions on download
  - Validates destination structure before importing
- Updated `performBidirectionalSync()` to include scheduled actions
- Updated `guardedUpload()` and `guardedDownload()` to include scheduled actions
- Added `getCloudScheduledActionsCount()` utility function

### Phase 3: UI Integration ✅
- No new UI elements needed - follows "calm sync" philosophy
- Existing "Sync Now" button automatically includes scheduled actions
- Existing sync status indicator reflects overall sync state
- Auto-sync (daily on foreground) automatically includes scheduled actions

---

## Design Decisions

### What Syncs
| Field | Synced | Notes |
|-------|--------|-------|
| `id` → `entity_id` | ✅ | Identity preservation |
| `name` | ✅ | Core data |
| `description` | ✅ | Core data |
| `destination` | ✅ | JSONB - file URIs are device-specific |
| `triggerTime` | ✅ | Recalculated if past-due |
| `recurrence` | ✅ | Core data |
| `enabled` | ✅ | User intent |
| `createdAt` | ✅ | Original creation time |
| `recurrenceAnchor` | ✅ | JSONB |
| `lastNotificationTime` | ❌ | Device-specific |
| `notificationClicked` | ❌ | Device-specific |

### Edge Cases Handled
1. **Past-due recurring actions**: Trigger time recalculated using `computeNextTrigger()`
2. **Past-due one-time actions**: Downloaded as disabled to preserve history
3. **Invalid destinations**: Skipped with console warning
4. **File URIs**: Synced but noted as device-specific (may not resolve on other devices)
5. **Contact photos**: Phone number syncs, but photo URI is device-specific

---

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/cloudSync.ts` | Added upload/download functions, updated sync flows |
| `supabase/migrations/` | New migration for `cloud_scheduled_actions` table |

---

## Testing Checklist

- [ ] Create reminder → Sync → Verify appears in cloud table
- [ ] Sign in on second device → Sync → Verify reminders appear
- [ ] Edit reminder → Sync → Verify update propagates
- [ ] Delete reminder → Verify cloud entry is removed
- [ ] Recurring reminder with past trigger time → Verify time recalculated on download
- [ ] File reminder sync → Verify data preserved (URI may not resolve)
- [ ] Contact reminder sync → Verify phone number preserved
- [ ] Auto-sync (24h) → Verify includes scheduled actions
