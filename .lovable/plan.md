

## Fix: Photo/file reminders should open the same way as access points

### Problem

When you tap a **photo access point** on the home screen, it opens in the app's built-in viewer (SlideshowProxyActivity). But when you tap a **photo reminder** notification, it fires a generic Android `ACTION_VIEW` intent, which shows the system app picker instead. The same inconsistency exists for videos and PDFs.

### Root Cause

Two files handle reminder notification taps:
- `NotificationClickActivity.java` (the click interceptor)
- `NotificationHelper.java` (builds the notification's pending intent)

Both have a single `case "file"` block that uses `Intent.ACTION_VIEW` for ALL file types -- no special handling for images, videos, or PDFs. Meanwhile, the shortcut system routes these file types through dedicated proxy activities (SlideshowProxyActivity, VideoProxyActivity, PDFProxyActivity).

### Solution

Add MIME-type-aware routing in both files to match what shortcuts already do:

| MIME type | Shortcut opens via | Reminder currently opens via | Fix |
|---|---|---|---|
| `image/*` | SlideshowProxyActivity (built-in viewer) | ACTION_VIEW (app picker) | Route through SlideshowProxyActivity |
| `video/*` | VideoProxyActivity (built-in player) | ACTION_VIEW (app picker) | Route through VideoProxyActivity |
| `application/pdf` | PDFProxyActivity (built-in PDF viewer) | ACTION_VIEW (app picker) | Route through PDFProxyActivity |
| Other files | FileProxyActivity (external app) | ACTION_VIEW (external app) | Keep as-is (already consistent) |

### File Changes

**1. `NotificationClickActivity.java`** -- Update `case "file"` block

Replace the generic ACTION_VIEW with MIME-type routing:
- If `mimeType` starts with `image/`: launch `SlideshowProxyActivity` with shortcut ID and title, using the `onetap://slideshow/` deep link pattern
- If `mimeType` starts with `video/`: launch `VideoProxyActivity` with URI, MIME type, and shortcut ID
- If `mimeType` is `application/pdf`: launch `PDFProxyActivity` with URI and title
- Otherwise: keep existing generic ACTION_VIEW behavior

**2. `NotificationHelper.java`** -- Update `case "file"` block

Same MIME-type routing logic as above, so that even the direct notification tap (without going through NotificationClickActivity) opens the correct viewer.

### What stays the same

- No changes to the shortcut creation flow
- No changes to the JS/TypeScript layer
- No changes to how reminder data is stored or scheduled
- Contact, URL, and text reminders are already consistent and unchanged
