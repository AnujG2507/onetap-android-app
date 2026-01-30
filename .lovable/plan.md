

## Goal
Replace the current "load entire app + show sheet" flow for WhatsApp message selection with a lightweight native Android dialog that appears directly over the home screen, without loading the WebView/React app at all.

## Current Flow (Problem)
When a WhatsApp shortcut with 2+ messages is tapped:
1. `WhatsAppProxyActivity` receives the tap
2. It stores pending action in SharedPreferences
3. It launches `MainActivity` (full WebView app)
4. App loads React, hooks detect pending action
5. `MessageChooserSheet` appears as a bottom sheet
6. User selects message, WhatsApp opens

**Pain point**: Steps 3-5 take 1-3 seconds and feel heavy for a simple selection.

## Proposed Flow (Solution)
When a WhatsApp shortcut with 2+ messages is tapped:
1. `WhatsAppProxyActivity` receives the tap
2. It shows a native Android dialog directly (no app launch)
3. User taps a message option
4. WhatsApp opens immediately
5. Activity finishes

**Result**: ~200ms from tap to dialog, feels instant.

## Technical Implementation

### 1. Create Native Dialog Layout
Create `res/layout/dialog_message_chooser.xml` with:
- Title showing contact name
- "Open chat" option (no message)
- Scrollable list of message options
- Cancel button

### 2. Modify WhatsAppProxyActivity
Transform from a transparent "pass-through" activity to a dialog-themed activity:
- Apply `Theme.Material.Light.Dialog` or `Theme.AppCompat.Light.Dialog`
- Build dialog UI programmatically or inflate layout
- Handle button clicks directly in the activity
- Open WhatsApp and finish on selection

### 3. Update AndroidManifest
Change the theme for `WhatsAppProxyActivity` from `Theme.Translucent.NoTitleBar` to a dialog theme.

### 4. Remove/Simplify JS-Side Handling
- The `usePendingWhatsAppAction` hook becomes unused for new shortcuts
- Keep backward compatibility for any existing pending actions
- `MessageChooserSheet` can remain for potential future use or be deprecated

## File Changes

### New Files
1. **`native/android/app/src/main/res/layout/dialog_message_chooser.xml`**
   - Native layout for the message chooser dialog
   - Material Design styling

2. **`native/android/app/src/main/res/values/styles.xml`** (create if not exists)
   - Custom dialog theme with rounded corners and proper styling

### Modified Files
1. **`native/android/app/src/main/java/app/onetap/shortcuts/WhatsAppProxyActivity.java`**
   - Change from transparent pass-through to dialog-based selection
   - Remove SharedPreferences storage logic
   - Add dialog creation and button handling
   - Keep usage tracking (already works)

2. **`native/android/app/src/main/AndroidManifest.xml`**
   - Update `WhatsAppProxyActivity` theme to dialog style

### Files to Review (may deprecate later)
- `src/hooks/usePendingWhatsAppAction.ts` - Will no longer be triggered
- `src/components/MessageChooserSheet.tsx` - Will no longer be used

## UI Design for Native Dialog

The dialog will match the app's calm, premium aesthetic:

```
┌─────────────────────────────────────┐
│  💬 Message for John               │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │
│  │ 📱 Open chat                │   │
│  │    Start fresh, type your   │   │
│  │    own message              │   │
│  └─────────────────────────────┘   │
│                                     │
│  ──── or use a quick message ────  │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 💬 "Hey! Are you free       │   │
│  │    today?"                  │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 💬 "On my way!"             │   │
│  └─────────────────────────────┘   │
│                                     │
│         [ Cancel ]                  │
└─────────────────────────────────────┘
```

## Technical Details

### WhatsAppProxyActivity Changes

```java
public class WhatsAppProxyActivity extends Activity {
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Parse intent extras
        String phoneNumber = getIntent().getStringExtra(EXTRA_PHONE_NUMBER);
        String messagesJson = getIntent().getStringExtra(EXTRA_QUICK_MESSAGES);
        String contactName = getIntent().getStringExtra(EXTRA_CONTACT_NAME);
        String shortcutId = getIntent().getStringExtra(EXTRA_SHORTCUT_ID);
        
        // Track usage
        if (shortcutId != null) {
            NativeUsageTracker.recordTap(this, shortcutId);
        }
        
        // Parse messages
        String[] messages = parseMessages(messagesJson);
        
        // Show dialog directly
        showMessageChooserDialog(phoneNumber, messages, contactName);
    }
    
    private void showMessageChooserDialog(String phoneNumber, String[] messages, String contactName) {
        AlertDialog.Builder builder = new AlertDialog.Builder(this, R.style.MessageChooserDialog);
        
        // Build dialog with custom layout
        View dialogView = getLayoutInflater().inflate(R.layout.dialog_message_chooser, null);
        
        // Set up title
        TextView title = dialogView.findViewById(R.id.dialog_title);
        title.setText(contactName != null ? "Message for " + contactName : "Choose message");
        
        // Set up "Open chat" option
        View openChatOption = dialogView.findViewById(R.id.open_chat_option);
        openChatOption.setOnClickListener(v -> {
            openWhatsApp(phoneNumber, null);
        });
        
        // Populate message options
        LinearLayout messagesContainer = dialogView.findViewById(R.id.messages_container);
        for (String message : messages) {
            View messageOption = createMessageOption(message);
            messageOption.setOnClickListener(v -> {
                openWhatsApp(phoneNumber, message);
            });
            messagesContainer.addView(messageOption);
        }
        
        builder.setView(dialogView);
        builder.setNegativeButton("Cancel", (d, w) -> finish());
        builder.setOnCancelListener(d -> finish());
        
        AlertDialog dialog = builder.create();
        dialog.show();
    }
    
    private void openWhatsApp(String phoneNumber, String message) {
        String url = "https://wa.me/" + phoneNumber.replaceAll("[^0-9]", "");
        if (message != null) {
            url += "?text=" + URLEncoder.encode(message, "UTF-8");
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        startActivity(intent);
        finish();
    }
}
```

### Dialog Theme (styles.xml)

```xml
<style name="MessageChooserDialog" parent="Theme.AppCompat.Light.Dialog">
    <item name="android:windowBackground">@drawable/dialog_rounded_bg</item>
    <item name="android:windowIsFloating">true</item>
    <item name="android:windowNoTitle">true</item>
    <item name="android:backgroundDimEnabled">true</item>
</style>
```

## Benefits

1. **Speed**: Dialog appears in ~200ms vs 1-3 seconds for full app load
2. **Simplicity**: No React/WebView overhead for simple selection
3. **Native feel**: Uses platform-native dialog patterns
4. **Battery/memory**: Minimal resource usage
5. **Reliability**: No dependency on WebView state or app initialization

## Backward Compatibility

- Existing shortcuts continue to work (intent format unchanged)
- JS-side hooks remain for any edge cases or future features
- No migration needed for existing users

## Testing Checklist

After implementation:
- [ ] Tap WhatsApp shortcut with 2+ messages - dialog appears instantly
- [ ] Tap "Open chat" - WhatsApp opens without message
- [ ] Tap a message option - WhatsApp opens with that message pre-filled
- [ ] Tap Cancel - dialog dismisses, returns to home screen
- [ ] Tap outside dialog - dialog dismisses
- [ ] Usage tracking still records the tap
- [ ] Dialog styling matches app aesthetic

