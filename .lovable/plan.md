
# Reminders Tab Audit & Streamlining Plan

## Overview
This plan addresses logic issues, redundancy, and experience improvements discovered in the Reminders tab audit. The goal is to create a streamlined, error-free journey that follows the app's premium experience philosophy.

---

## Issues to Fix

### 1. NoResultsState Missing Status Filter Reset
**Problem:** Clicking "Clear Filters" doesn't reset the status filter, leaving users stuck in a filtered state.

**Fix:**
- Update `NotificationsPage.tsx` NoResultsState handler to also reset `statusFilter`
- Update inline NoResultsState calls to clear all three filters

---

### 2. Consolidate Duplicate Filter Bars
**Problem:** Two separate filter rows (recurrence + status) create visual clutter and take up valuable screen space.

**Fix:**
- Merge recurrence and status filters into a single horizontally scrolling chip bar
- Use a visual separator (small dot or divider) between recurrence and status chips
- This reduces vertical space while maintaining all filter functionality

---

### 3. Missing i18n Translations (Hardcoded Strings)
**Problem:** Several components use hardcoded English strings instead of translations.

**Files affected:**
- `ScheduledActionActionSheet.tsx`: "Enabled", "Edit action", "Delete action", "Expired", "Delete scheduled action?"
- `ScheduledActionItem.tsx`: Delete confirmation dialog strings
- `ScheduledActionsList.tsx`: Empty state, sort tooltips, selection messages, button labels

**Fix:**
- Add missing translation keys to `en.json`
- Update all hardcoded strings to use `t()` function

---

### 4. ScheduledActionsList Search Parity
**Problem:** The sheet version lacks enhanced search (time descriptions, recurrence matching) and status filtering.

**Options:**
- **Option A (Recommended):** Remove `ScheduledActionsList.tsx` sheet entirely since the Reminders tab exists as a dedicated page. The sheet was designed before the tab existed.
- **Option B:** Sync the sheet's search logic with the page to ensure parity.

Given the app's navigation structure with a dedicated Reminders tab, Choose option B to go ahead.

---

### 5. Hide Search/Filters in Empty State
**Problem:** Currently search and filters show even when `actions.length > 0`, but inconsistently hidden in some views.

**Fix:**
- Already implemented for main empty state (correct)
- Ensure MissedNotificationsBanner is also hidden when the user has no actions (pure empty state)

---

### 6. Editor Safe Update Pattern
**Problem:** The delete-and-recreate pattern in `ScheduledActionEditor.tsx` risks data loss if creation fails after deletion.

**Fix:**
- Implement transactional update: Create new action first, then delete old action only on success
- If creation fails, user keeps original action

---

## Implementation Details

### Step 1: Fix NoResultsState Filter Reset
```text
File: src/components/NotificationsPage.tsx

Update the inline NoResultsState callback and handleClearFilters to reset all three filters:
- setSearchQuery('')
- setRecurrenceFilter('all')
- setStatusFilter('all')
```

### Step 2: Consolidate Filter Bars
```text
File: src/components/NotificationsPage.tsx

Merge the two filter bar divs into one:
- Keep horizontal scroll with no-scrollbar
- Add recurrence chips first
- Add small visual divider
- Add status chips after
- Remove the second div entirely
```

### Step 3: Add Missing Translations
```text
File: src/i18n/locales/en.json

Add keys:
- scheduledActionSheet.enabled
- scheduledActionSheet.editAction  
- scheduledActionSheet.deleteAction
- scheduledActionSheet.expired
- scheduledActionSheet.deleteTitle
- scheduledActionSheet.deleteDesc
- scheduledActionItem.deleteTitle
- scheduledActionItem.deleteDesc
- scheduledActionsList.* (all sheet-specific strings)
```

### Step 4: Apply Translations to Components
```text
Files to update:
- ScheduledActionActionSheet.tsx
- ScheduledActionItem.tsx
- ScheduledActionsList.tsx (if kept)
```

### Step 5: Fix Editor Update Pattern
```text
File: src/components/ScheduledActionEditor.tsx

Change handleSave from:
1. Delete old action
2. Create new action

To:
1. Create new action
2. If success, delete old action
3. If creation fails, keep original (no deletion)
```

### Step 6: Consider Deprecating ScheduledActionsList
```text
The sheet component duplicates the full-page Reminders tab. 
Since users access reminders via the dedicated tab, the sheet can be removed 
or simplified to just show recent/upcoming actions without full management features.

This would involve:
- Removing or simplifying ScheduledActionsList.tsx
- Updating any references to use navigation to Reminders tab instead
```

---

## Summary of Changes

| File | Changes |
|------|---------|
| `NotificationsPage.tsx` | Fix filter reset, consolidate filter bars |
| `en.json` | Add ~15 missing translation keys |
| `ScheduledActionActionSheet.tsx` | Add i18n translations |
| `ScheduledActionItem.tsx` | Add i18n translations |
| `ScheduledActionEditor.tsx` | Safe update pattern (create-then-delete) |
| `ScheduledActionsList.tsx` | Either deprecate or sync with page |

---

## Testing Checklist

- [ ] Clear Filters resets all three: search, recurrence, and status
- [ ] Combined filter bar scrolls horizontally without overflow
- [ ] All user-facing strings are translated
- [ ] Editing an action preserves original if update fails
- [ ] Empty state shows correctly with no search/filter controls
- [ ] No console errors during the entire reminder journey
