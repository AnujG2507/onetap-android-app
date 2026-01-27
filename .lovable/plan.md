
# Terminology Update: "Shortcut" → "One Tap Access"

## Overview

This plan updates all user-facing instances of "shortcut" terminology to use "one tap access" or contextually appropriate variations throughout the app. This branding change affects translation strings, UI labels, tooltips, and tutorial content.

## Terminology Mapping

| Current Term | New Term |
|-------------|----------|
| Create a Shortcut | Set Up One Tap Access |
| Shortcut | One Tap Access |
| shortcut | one tap access |
| Create Shortcuts | Set Up One Tap Access |
| Add shortcut to home screen | Add to home screen |
| Home Screen Shortcut | Home Screen Access |
| Call Shortcut | Call Access |
| WhatsApp Shortcut | WhatsApp Access |
| Shortcut Name | Access Name |

---

## Files to Modify

### 1. Translation File (`src/i18n/locales/en.json`)

**Tutorial Section (lines 7-13)**
- `tutorial.access.step1Title`: "Create Shortcuts" → "Set Up One Tap Access"
- `tutorial.access.step1Desc`: "...create a home screen shortcut" → "...create home screen access"
- `tutorial.access.step2Desc`: "Add website shortcuts for one-tap access" → "Add website links for one-tap access"
- `tutorial.access.step3Desc`: "...to create shortcuts" → "...to set up one tap access"

**Empty State (line 38)**
- `emptyState.valueProp3`: "Native home screen shortcuts" → "Native home screen access"

**Contact Section (lines 57-62)**
- `contact.callShortcut`: "Call Shortcut" → "Call Access"
- `contact.whatsappShortcut`: "WhatsApp Shortcut" → "WhatsApp Access"
- `contact.shortcutName`: "Shortcut Name" → "Access Name"

**Access Tab (lines 96, 111-112)**
- `access.createShortcut`: "Create a Shortcut" → "Set Up One Tap Access"
- `access.shortcut`: "Shortcut" → "One Tap Access"
- `access.shortcutDesc`: "Add to home screen" (keep as is - contextually clear)

**Library Section (lines 173-174)**
- `library.shortcut`: "Shortcut" → "One Tap Access"
- `library.shortcutTooltip`: "Add shortcut to home screen" → "Add one tap access to home screen"
- `library.creatingShortcuts` (line 167): "Creating {{count}} shortcut(s)..." → "Setting up {{count}} access point(s)..."

**Bookmark Action (line 237)**
- `bookmarkAction.createShortcut`: "Create Home Screen Shortcut" → "Set Up Home Screen Access"

**Shared URL (line 465)**
- `sharedUrl.shortcut`: "Shortcut" → "One Tap Access"

**Clipboard (line 492)**
- `clipboard.shortcut`: "Shortcut" → "One Tap Access"

**Permissions (line 533)**
- `permissions.storage.description`: "To create shortcuts for your photos..." → "To set up one tap access for your photos..."

**Saved Links (line 552)**
- `savedLinks.noBookmarksDesc`: "...then create shortcuts from them here" → "...then set up one tap access from them here"

**Success Screen (lines 641, 643)**
- `success.title`: "Added to Home Screen" (keep as is - clear and concise)
- `success.hint`: "One tap from your home screen to open instantly" (keep as is - already uses "one tap")

---

### 2. Android Widget Strings (`native/android/app/src/main/res/values/strings.xml`)

- `widget_empty_title`: "No shortcuts yet" → "No access points yet"
- `widget_empty_subtitle`: "Tap to create one" (keep as is)

---

## Summary of Changes

| File | Changes |
|------|---------|
| `src/i18n/locales/en.json` | ~18 string updates |
| `native/android/.../strings.xml` | 1 string update |

---

## Technical Notes

- All changes are to translation keys only - no component code changes required
- The native Android code uses `shortcut_title` as an internal variable name (not user-facing) - this remains unchanged
- The header in ShortcutCustomizer already uses `setUpAccess` ("Set up access") which aligns with the new terminology
- Button labels like "Add to Home Screen" remain unchanged as they're already clear and action-oriented
