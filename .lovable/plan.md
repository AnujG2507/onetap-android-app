

# Add WhatsApp Message Reminder to Scheduled Action Creator

## Problem

The Reminders tab's "Add Reminder" flow only offers three destination types: Local File, Link, and Contact (call). There is no option to create a WhatsApp message reminder, even though the data model (`ContactDestination`) already supports `isWhatsApp` and `quickMessage` fields.

## Solution

Add a fourth destination option -- "WhatsApp Message" -- to the destination picker in the `ScheduledActionCreator`, and mirror the same in the `ScheduledActionEditor`. When selected, it follows the same contact-picking sub-flow (pick from contacts or enter manually), but also shows an optional message prefill field. The destination is stored with `isWhatsApp: true`.

## Changes

### 1. `src/i18n/locales/en.json`

Add new translation keys under `scheduledActions` and `scheduledEditor`:

- `whatsappMessage`: "WhatsApp Message"
- `whatsappMessageDesc`: "Message Someone at a Scheduled Time"
- `optionalMessage`: "Message (optional)"
- `optionalMessagePlaceholder`: "Pre-fill a message draft..."

### 2. `src/components/ScheduledActionCreator.tsx`

- Import `MessageCircle` from lucide-react
- Add state: `isWhatsAppMode` (boolean) to distinguish WhatsApp vs call contact flow
- Add state: `whatsappMessage` (string) for optional message prefill
- Add a 4th `DestinationOption` in the main destination step with `MessageCircle` icon, using the new translation keys
- When WhatsApp is selected, set `isWhatsAppMode = true` then enter the same `contactSubStep: 'choose'` flow (pick from contacts or enter manually)
- In both the "pick contact" and "manual contact submit" handlers, check `isWhatsAppMode` -- if true, set `isWhatsApp: true` and `quickMessage` on the `ContactDestination`
- Before advancing to timing, show an optional textarea for the message draft (only when `isWhatsAppMode` is true)
- Update `getSuggestedName` to return "Message {name}" instead of "Call {name}" when `isWhatsApp` is true
- Reset `isWhatsAppMode` and `whatsappMessage` on back navigation

### 3. `src/components/ScheduledActionEditor.tsx`

- Import `MessageCircle` from lucide-react
- Add a 4th `DestinationOption` ("WhatsApp Message") in the destination change step
- When selected, pick contact via the existing handler but set `isWhatsApp: true` on the resulting destination
- Add `getDestinationIcon` case: when `dest.type === 'contact' && dest.isWhatsApp`, show `MessageCircle` instead of `Phone`

### 4. `src/components/ScheduledActionItem.tsx`

- Import `MessageCircle` from lucide-react
- In the icon rendering logic, check `dest.isWhatsApp` on contact destinations and show `MessageCircle` instead of `Phone`

## Technical Details

The `ContactDestination` type already has the required fields:
```typescript
interface ContactDestination {
  type: 'contact';
  phoneNumber: string;
  contactName: string;
  photoUri?: string;
  quickMessage?: string;   // already exists
  isWhatsApp?: boolean;     // already exists
}
```

The notification handler on the native side already reads `isWhatsApp` and `quickMessage` to open WhatsApp instead of the dialer, so no native changes are needed.

Flow for the new WhatsApp destination:
1. User taps "WhatsApp Message" in destination picker
2. Sub-flow: pick from contacts or enter manually (same as call contact)
3. After contact is selected, show an optional message textarea
4. User taps continue to proceed to timing step
5. Destination is stored with `isWhatsApp: true` and optional `quickMessage`
6. When the reminder fires, it opens WhatsApp with the contact (and optional prefilled message)
