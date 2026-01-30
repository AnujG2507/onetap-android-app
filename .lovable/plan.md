
## Goal
Fix native Android tap tracking for ALL shortcut types, ensuring taps from home screen shortcuts are properly counted regardless of the shortcut type.

## Problem Summary
Currently, several shortcut types bypass proxy activities and go directly to external apps, meaning their taps are never recorded:

1. WhatsApp shortcuts with 0 or 1 message (uses direct wa.me links)
2. Telegram shortcuts
3. Signal shortcuts  
4. Slack shortcuts

These shortcuts use `android.intent.action.VIEW` with app-specific URLs and open directly without any proxy activity to record the tap.

## Solution

### Option A: Create a Universal Message Proxy Activity (Recommended)
Create a single `MessageProxyActivity` that handles all messaging shortcuts (WhatsApp, Telegram, Signal, Slack) and records taps before forwarding to the appropriate app.

**Advantages:**
- Single point of tracking for all message types
- Clean separation of concerns
- Consistent with existing proxy pattern

### Option B: Extend LinkProxyActivity
Route all message shortcuts through `LinkProxyActivity` since they all use URLs.

**Disadvantage:** Mixing concerns - link shortcuts and message shortcuts have different semantics.

## Recommended Implementation (Option A)

### 1. Create MessageProxyActivity.java
A new transparent activity that:
- Receives shortcut tap with message app URL and shortcut ID
- Records tap via `NativeUsageTracker.recordTap()`
- Opens the URL in the appropriate app
- Finishes immediately

### 2. Update ShortcutPlugin.java
In `createPinnedShortcut()`, add handling for message shortcuts:
- Detect when intent action is `ACTION_VIEW` with messaging URLs (wa.me, tg://, sgnl://, slack://)
- Route through `MessageProxyActivity` instead of `createCompatibleIntent()`
- Pass shortcut ID as extra for tracking

### 3. Update shortcutManager.ts
Change the intent action for all message shortcuts to use a custom action:
- `app.onetap.OPEN_MESSAGE` for all messaging shortcuts
- This ensures they route through the proxy on the native side

### 4. Register Activity in AndroidManifest.xml
Add the new `MessageProxyActivity` to the manifest with appropriate intent filters.

## Technical Details

### MessageProxyActivity.java
```java
public class MessageProxyActivity extends Activity {
    public static final String EXTRA_SHORTCUT_ID = "shortcut_id";
    public static final String EXTRA_URL = "url";
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        Intent intent = getIntent();
        String url = intent.getStringExtra(EXTRA_URL);
        String shortcutId = intent.getStringExtra(EXTRA_SHORTCUT_ID);
        
        // Track the tap
        if (shortcutId != null && !shortcutId.isEmpty()) {
            NativeUsageTracker.recordTap(this, shortcutId);
        }
        
        // Open the URL
        if (url != null) {
            Intent viewIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(viewIntent);
        }
        
        finish();
    }
}
```

### Changes to shortcutManager.ts
```typescript
// Message shortcuts - ALL route through MessageProxyActivity
if (shortcut.type === 'message' && shortcut.messageApp) {
  const phoneNumber = shortcut.phoneNumber?.replace(/[^0-9]/g, '') || '';
  let url: string;
  
  switch (shortcut.messageApp) {
    case 'whatsapp':
      const messages = shortcut.quickMessages || [];
      if (messages.length > 1) {
        // Multi-message still uses WhatsAppProxyActivity
        return {
          action: 'app.onetap.WHATSAPP_MESSAGE',
          ...
        };
      }
      url = messages.length === 1 
        ? `https://wa.me/${phoneNumber}?text=${encodeURIComponent(messages[0])}`
        : `https://wa.me/${phoneNumber}`;
      break;
    case 'telegram':
      url = `tg://resolve?phone=${phoneNumber}`;
      break;
    case 'signal':
      url = `sgnl://signal.me/#p/+${phoneNumber}`;
      break;
    case 'slack':
      url = shortcut.slackTeamId && shortcut.slackUserId
        ? `slack://user?team=${shortcut.slackTeamId}&id=${shortcut.slackUserId}`
        : 'slack://';
      break;
  }
  
  return {
    action: 'app.onetap.OPEN_MESSAGE',
    data: url,
    extras: { url },
  };
}
```

### Changes to ShortcutPlugin.java
Add handling in `createPinnedShortcut()`:
```java
} else if ("app.onetap.OPEN_MESSAGE".equals(finalIntentAction)) {
    android.util.Log.d("ShortcutPlugin", "Using MessageProxyActivity for message shortcut");
    intent = new Intent(context, MessageProxyActivity.class);
    intent.setAction("app.onetap.OPEN_MESSAGE");
    intent.setData(finalDataUri);
    intent.putExtra(MessageProxyActivity.EXTRA_URL, finalDataUri.toString());
    intent.putExtra(MessageProxyActivity.EXTRA_SHORTCUT_ID, finalId);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
}
```

## Files to Change

### New Files
1. `native/android/app/src/main/java/app/onetap/shortcuts/MessageProxyActivity.java`

### Modified Files
1. `src/lib/shortcutManager.ts` - Update `buildContentIntent()` for message shortcuts
2. `native/android/app/src/main/java/app/onetap/shortcuts/plugins/ShortcutPlugin.java` - Add message proxy routing
3. `native/android/app/src/main/AndroidManifest.xml` - Register MessageProxyActivity

## Testing Checklist
After implementation, verify tap tracking works for:
- [x] Link shortcuts (already working via LinkProxyActivity)
- [x] Video shortcuts (already working via VideoProxyActivity)
- [x] PDF shortcuts (already working via PDFProxyActivity)
- [x] Contact call shortcuts (already working via ContactProxyActivity)
- [x] WhatsApp shortcuts (0 messages) - FIXED via MessageProxyActivity
- [x] WhatsApp shortcuts (1 message) - FIXED via MessageProxyActivity
- [x] WhatsApp shortcuts (2+ messages) - already working via WhatsAppProxyActivity
- [x] Telegram shortcuts - FIXED via MessageProxyActivity
- [x] Signal shortcuts - FIXED via MessageProxyActivity
- [x] Slack shortcuts - FIXED via MessageProxyActivity

## Sync Verification
Ensure `syncNativeUsageEvents()` in `useShortcuts.ts` properly syncs events:
- On app startup
- On app foreground (already implemented)

## Implementation Status: COMPLETE ✓
