
# Plan: Clear Shortcut Name When Phone Number is Cleared

## Overview
When a user selects a contact and then clears the phone number using the X button, the shortcut name should also be cleared to provide a consistent reset experience. However, clearing the shortcut name independently should NOT affect the phone number field.

## Current Behavior
- Phone number clear button (lines 185-199): Clears phone number, picked contact, photo, and icon
- Shortcut name clear button (lines 227-234): Only clears the name field

## Required Change

**File:** `src/components/ContactShortcutCustomizer.tsx`

Update the phone number clear button's `onClick` handler to also clear the `name` state:

```typescript
onClick={() => {
  setPhoneNumber('');
  setPickedContact(null);
  setContactPhoto(null);
  setName(''); // Add this line to clear shortcut name
  // Reset icon to default
  setIcon({ type: 'emoji', value: mode === 'dial' ? '📞' : '💬' });
}}
```

## Technical Details
- **Location:** Line 187-193 in the phone number input's clear button click handler
- **Change:** Add `setName('')` to the existing reset logic
- **Impact:** When user clears phone number, all contact-related data including the auto-generated shortcut name will be reset

## Expected Behavior After Change

| Action | Phone Number | Shortcut Name | Icon |
|--------|--------------|---------------|------|
| Clear phone number | Cleared | Cleared | Reset to default |
| Clear shortcut name | Unchanged | Cleared | Unchanged |

## Files Changed Summary
| File | Change |
|------|--------|
| `src/components/ContactShortcutCustomizer.tsx` | Add `setName('')` to phone clear handler |
