# OneTap Command Interface (OCI) — Implementation Plan

## Overview

A clean, explicit Intent-based command interface that allows external Android apps (LLMs, assistants, automations) to initiate OneTap access or reminder creation. This is a user-initiated handoff — not background automation. The user always sees the creation UI and must explicitly confirm.

## Supported Actions

Only two actions:

```text
app.onetap.access.action.CREATE_ACCESS
app.onetap.access.action.CREATE_REMINDER
```

## Supported Content Types (`onetap_type`)

```text
url | pdf | image | images | video | file | contact_call | contact_whatsapp
```

Any other value is rejected with a toast.

## Intent Extras

### Common (both actions)

| Key | Type | Required |
|-----|------|----------|
| `onetap_type` | String | Yes |
| `onetap_title` | String | No |
| `onetap_source` | String | No (debug only, never persisted) |
| `onetap_notes` | String | No |

### Type-Specific

| Type | Required Extra | Optional Extra |
|------|---------------|----------------|
| `url` | `onetap_url` (String) | — |
| `file` / `pdf` / `video` / `image` | `onetap_uri` (Uri) | — |
| `images` | `onetap_uris` (ArrayList of Uri) | — |
| `contact_call` | `onetap_contact_id` (String) | — |
| `contact_whatsapp` | `onetap_contact_id` (String) | `onetap_prefill_message` |

### Reminder-Only (CREATE_REMINDER)

| Key | Type | Required |
|-----|------|----------|
| `onetap_trigger_at` | Long (epoch ms) | No |
| `onetap_repeat` | String (once/daily/weekly/yearly) | No |

If trigger time is missing, the user chooses manually in the UI.

## Architecture

```text
External App
    |
    v
IntentEntryActivity (validate, normalize, strip onetap_source)
    |
    v
MainActivity (stores pending OCI command)
    |
    v
ShortcutPlugin.getSharedContent() (surfaces OCI fields to JS)
    |
    v
useSharedContent.ts (detects OCI action)
    |
    v
Index.tsx (routes to Access tab or Reminder creator with pre-filled data)
```

## File Changes

### New Files

**1. `native/android/app/src/main/java/app/onetap/access/IntentEntryActivity.java`**

- Transparent, exported activity
- Accepts only the two supported actions via intent filters
- Validates `onetap_type` against the allowed set
- Validates type-specific required extras (url, uri, uris, contact_id)
- For URI types: validates URI resolves, applies `FLAG_GRANT_READ_URI_PERMISSION`
- For `images`: validates ArrayList is non-empty and all URIs resolve to images
- On failure: native Toast + `finish()` immediately
- On success: constructs internal `app.onetap.access.OCI_COMMAND` intent to MainActivity, forwards validated extras, then finishes
- Strips `onetap_source` — never forwarded
- Attributes: `noHistory="true"`, `excludeFromRecents="true"`, translucent theme

**2. `OCI_DOCUMENTATION.md`**

- Documents the two supported actions and all extras
- Example `adb` commands for testing each type
- Validation rules and error behavior
- Clarifies this is user-initiated, not automation
- No mention of MCP or background AI control

### Modified Files

**3. `native/android/app/src/main/AndroidManifest.xml`**

- Register `IntentEntryActivity` with `exported="true"`
- Two intent filters (one per action)
- Add `OCI_COMMAND` intent filter on `MainActivity` (not exported)

**4. `native/android/app/src/main/java/app/onetap/access/MainActivity.java`**

- Add `handleOCIIntent(Intent)` method (called from `onCreate` and `onNewIntent`)
- Detect `app.onetap.access.OCI_COMMAND` action
- Store OCI extras as pending state (following existing `pendingQuickCreate` / `pendingSlideshowId` pattern)
- Expose `getPendingOCICommand()` and `clearPendingOCICommand()` methods

**5. `native/android/app/src/main/java/app/onetap/access/plugins/ShortcutPlugin.java`**

- In `getSharedContent()`, add OCI branch before the final else
- Extract `onetap_*` extras and surface in JSObject: `ociAction`, `ociType`, `ociTitle`, `ociUrl`, `ociUri`, `ociUris`, `ociContactId`, `ociPrefillMessage`, `ociTriggerAt`, `ociRepeat`, `ociNotes`

**6. `src/plugins/ShortcutPlugin.ts`**

- Extend `getSharedContent` return type with optional OCI fields: `ociAction`, `ociType`, `ociTitle`, `ociUrl`, `ociUri`, `ociUris`, `ociContactId`, `ociPrefillMessage`, `ociTriggerAt`, `ociRepeat`, `ociNotes`

**7. `src/hooks/useSharedContent.ts`**

- Detect `ociAction` in shared content result
- Map OCI types to existing content source types
- Export `ociCommand` state and `clearOCICommand`

**8. `src/pages/Index.tsx`**

- Add effect to handle `ociCommand`
- CREATE_ACCESS: route to Access tab with pre-filled source data (URL, file URI, contact, slideshow)
- CREATE_REMINDER: route to Reminders tab with pre-filled destination and optional trigger time / recurrence

**9. `src/components/AccessFlow.tsx`**

- Add optional `initialContactData` prop for OCI contact routing
- When provided, skip source selection and enter contact customization directly

## Validation Rules (Enforced in IntentEntryActivity)

- Unsupported action: silently ignore (finish)
- Missing `onetap_type`: toast "Missing content type" + finish
- Invalid `onetap_type` value: toast "Unsupported content type" + finish
- Missing required extras per type: toast describing what's missing + finish
- Unresolvable URI: toast "Cannot access file" + finish
- Mixed types in `images` ArrayList: toast "All items must be images" + finish
- Empty `images` ArrayList: toast "No images provided" + finish
- No partial state is ever saved on failure

## Security and Privacy

- No background execution
- No network calls triggered by intents
- No analytics or tracking of intent metadata
- `onetap_source` is stripped and never stored
- URI permissions validated, not blindly trusted
- All creation requires explicit user confirmation in the UI
- Fully local behavior

## Testing Checklist

Test via `adb shell am start`:
- Valid CREATE_ACCESS with each content type
- Valid CREATE_REMINDER with trigger time and recurrence
- Missing `onetap_type` (expect toast + exit)
- Invalid `onetap_type` (expect toast + exit)
- Missing required extras per type (expect toast + exit)
- Invalid / unresolvable URI (expect toast + exit)
- Mixed image + non-image for `images` type (expect toast + exit)
- Back press during creation flow (expect clean cancel, zero side effects)
- Android 12 through Android 15
