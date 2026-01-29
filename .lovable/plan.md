
# Plan: Implement Home Screen Shortcut Tap Tracking on Android

## Overview

Add native tap tracking for shortcuts launched from the Android home screen. Currently, tap tracking only works when shortcuts are opened from within the app, but home screen taps (the primary use case) are not tracked.

## Problem Statement

| Shortcut Type | Current Tracking | Expected Tracking |
|---------------|------------------|-------------------|
| Link (from home screen) | Not tracked | Cannot track (opens browser directly) |
| Contact (from home screen) | Not tracked | Can track via proxy |
| Video (from home screen) | Not tracked | Can track via proxy |
| PDF (from home screen) | Not tracked | Can track via proxy |
| WhatsApp single message | Not tracked | Cannot track (opens directly) |
| WhatsApp multi-message | Not tracked | Can track via proxy |
| Any shortcut (from app) | Tracked | Tracked |

## Architecture

Track shortcut usage natively in SharedPreferences, then sync to JS layer on app startup:

```text
Home Screen Tap
      |
      v
Proxy Activity (Video/PDF/Contact/WhatsApp)
      |
      +---> Record shortcut_id to SharedPreferences
      |
      v
Execute Action (open player/dialer/etc.)
      ...
      
Later: App Opens
      |
      v
JS calls getNativeUsageEvents()
      |
      v
Merge native events into usageHistoryManager
      |
      v
Update usageCount on shortcuts
```

## Technical Implementation

### 1. Native Usage Tracker (Java)

Create a simple SharedPreferences-based tracker that records shortcut IDs with timestamps:

**New File**: `NativeUsageTracker.java`

```java
public class NativeUsageTracker {
    private static final String PREFS_NAME = "shortcut_usage_tracking";
    private static final String KEY_EVENTS = "usage_events";
    
    // Record a tap event (called from proxy activities)
    public static void recordTap(Context context, String shortcutId) {
        // Append to JSON array: [{id, timestamp}, ...]
    }
    
    // Get and clear events (called from ShortcutPlugin)
    public static List<UsageEvent> getAndClearEvents(Context context) {
        // Return all events and clear the list
    }
}
```

### 2. Update Proxy Activities

Add tracking calls to each proxy activity that handles shortcut taps:

| Proxy Activity | Changes |
|----------------|---------|
| `VideoProxyActivity` | Add `NativeUsageTracker.recordTap(this, shortcutId)` |
| `PDFProxyActivity` | Add tracking when `shortcutId` is from a shortcut (not external) |
| `ContactProxyActivity` | Receive and track shortcut_id from intent |
| `WhatsAppProxyActivity` | Add tracking before opening main app |

### 3. ShortcutPlugin Method

Add a new plugin method to retrieve native usage events:

```java
@PluginMethod
public void getNativeUsageEvents() {
    // Get events from NativeUsageTracker
    // Return as JSON array to JS
    // Clear the native events after retrieval
}
```

### 4. JS Integration

Sync native events on app startup/foreground:

**Update**: `useShortcuts.ts`

```typescript
// On mount and app foreground
useEffect(() => {
  syncNativeUsageEvents();
}, []);

async function syncNativeUsageEvents() {
  if (!Capacitor.isNativePlatform()) return;
  
  const { events } = await ShortcutPlugin.getNativeUsageEvents();
  
  events.forEach(event => {
    usageHistoryManager.recordUsage(event.shortcutId, event.timestamp);
    // Also update usageCount on the shortcut
  });
}
```

### 5. Update Intent Extras

Pass shortcut_id through intents that don't currently include it:

| Shortcut Type | Current Intent | Changes Needed |
|---------------|----------------|----------------|
| Contact | Has phone_number only | Add shortcut_id extra |
| Video | Has shortcut_title | Add shortcut_id extra |
| PDF | Already has shortcut_id | No changes |
| WhatsApp | Has phone/messages | Add shortcut_id extra |

## Files to Modify

| File | Changes |
|------|---------|
| `NativeUsageTracker.java` (new) | SharedPreferences-based usage event storage |
| `VideoProxyActivity.java` | Add tracking call with shortcut_id |
| `PDFProxyActivity.java` | Add tracking for shortcut taps (not external opens) |
| `ContactProxyActivity.java` | Receive shortcut_id, add tracking |
| `WhatsAppProxyActivity.java` | Add tracking call with shortcut_id |
| `ShortcutPlugin.java` | Add getNativeUsageEvents() method |
| `ShortcutPlugin.ts` | Add TypeScript interface for new method |
| `src/lib/shortcutManager.ts` | Pass shortcut_id in all proxy intents |
| `src/hooks/useShortcuts.ts` | Sync native events on startup |
| `src/lib/usageHistoryManager.ts` | Accept optional timestamp parameter |

## Limitations

These shortcut types cannot be tracked because they bypass the app entirely:

1. **Link shortcuts** - Open directly in browser via `ACTION_VIEW`
2. **WhatsApp single-message shortcuts** - Open WhatsApp directly via `wa.me` URL

For these, we could consider using a "Link Proxy Activity" in the future, but this would add latency and complexity.

## Testing Approach

1. Create shortcuts of each type (video, PDF, contact, WhatsApp multi-message)
2. Tap each shortcut from the home screen (not from the app)
3. Open the app and navigate to My Shortcuts
4. Verify tap counts have incremented correctly
5. Check the weekly activity chart reflects the new taps

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| App killed while events pending | Events persist in SharedPreferences |
| Same shortcut tapped multiple times before app opens | All events recorded and synced |
| Shortcut deleted before sync | Events for missing shortcuts discarded |
| Device reboot | SharedPreferences survives reboots |
