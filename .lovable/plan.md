
## Diagnosis: Why Text Shortcuts Don't Open Lightly

### Root Cause — Two Gaps

**Gap 1 — Manifest theme is wrong for in-app launch.**
`TextProxyActivity` uses `Theme.NoTitleBar` — a full-screen, opaque activity. It loads visually like a new full app screen. `WhatsAppProxyActivity` uses `Theme.Material.Light.Dialog` which floats on top of the current screen with no transition, no loading bar, just an instant dialog. Text shortcuts need the same pattern.

**Gap 2 — No native plugin bridge to launch TextProxyActivity from JS.**
The current `handleOpen` for `text` type navigates React Router to `/text/:id`, which means the Capacitor WebView re-renders a whole new page through React. The correct path — just like WhatsApp — is for the JS layer to call a `ShortcutPlugin` method that fires `startActivity(Intent → TextProxyActivity)` directly from native. The WebView never needs to render anything; the native Activity handles it completely.

### How the WhatsApp Flow Works (the reference model)

```text
User taps "Open" on a WhatsApp shortcut in My Shortcuts list
  → handleOpen() in MyShortcutsContent.tsx
    → ShortcutPlugin.openWhatsApp() [JS → Native bridge]
      → WhatsAppProxyActivity started as a Dialog
        → Floating chooser appears on top of the app
        → User selects message → WhatsApp opens
        → Activity finishes (returns to app)
```

### Target Flow for Text Shortcuts

```text
User taps "Open" on a text shortcut in My Shortcuts list
  → handleOpen() in MyShortcutsContent.tsx
    → ShortcutPlugin.openTextShortcut() [NEW JS → Native bridge]
      → TextProxyActivity started as a bottom-sheet style Activity
        → Lightweight native WebView slides up (no app reload)
        → User reads note / toggles checklist
        → Back button → Activity finishes (returns to app)
```

### Files to Change

| Layer | File | Change |
|---|---|---|
| Native Java | `TextProxyActivity.java` | Upgrade theme handling: use the same `app_settings` SharedPreferences-based theme detection as WhatsApp. Add a top bar with a close/back button (purely native Views, no HTML). Change the WebView to load inline self-contained HTML (no CDN calls for markdown — embed a tiny renderer inline). |
| Native Manifest | `AndroidManifest.xml` | Change `TextProxyActivity` theme from `Theme.NoTitleBar` to a new `TextViewerTheme` style that uses `windowIsFloating=false` but slides up from the bottom like a sheet (`windowEnterAnimation` = slide_in_bottom). |
| Native styles | `styles.xml` | Add `TextViewerTheme` with bottom-sheet-style animation (slide up on enter, slide down on exit), full height, dark/light aware. |
| Native Java Plugin | `ShortcutPlugin.java` | Add a new `@PluginMethod openTextShortcut` that fires `TextProxyActivity` directly via `startActivity` without creating a pinned shortcut — identical pattern to how `openWhatsApp` works. |
| TypeScript interface | `ShortcutPlugin.ts` | Add `openTextShortcut(options: { shortcutId: string; textContent: string; isChecklist: boolean; name: string }) => Promise<{ success: boolean }>` to the interface. |
| TypeScript web fallback | `shortcutPluginWeb.ts` | Add `openTextShortcut` web stub that falls back to `navigate('/text/:id')` via a custom event or just returns `{ success: false }` so the JS caller falls back gracefully. |
| TypeScript component | `MyShortcutsContent.tsx` | In `handleOpen` for `text` type: on native, call `ShortcutPlugin.openTextShortcut(...)` instead of `navigate()`. Keep `navigate()` as web/non-native fallback. |

### Detailed Technical Changes

#### 1. `native/android/app/src/main/res/values/styles.xml`
Add a `TextViewerTheme` that:
- Is NOT floating (fills the screen, but the activity animates up from the bottom like a sheet)
- Has a slide-up/slide-down animation pair
- Has no title bar
- Respects day/night (parent: `Theme.AppCompat.DayNight.NoActionBar`)

```xml
<style name="TextViewerTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
    <item name="android:windowAnimationStyle">@style/TextViewerAnimation</item>
    <item name="android:windowIsTranslucent">false</item>
    <item name="android:windowBackground">@android:color/transparent</item>
</style>

<style name="TextViewerAnimation">
    <item name="android:activityOpenEnterAnimation">@anim/slide_up</item>
    <item name="android:activityOpenExitAnimation">@android:anim/fade_out</item>
    <item name="android:activityCloseEnterAnimation">@android:anim/fade_in</item>
    <item name="android:activityCloseExitAnimation">@anim/slide_down</item>
</style>
```

Two new anim XML files will be created:
- `native/android/app/src/main/res/anim/slide_up.xml`
- `native/android/app/src/main/res/anim/slide_down.xml`

#### 2. `native/android/app/src/main/AndroidManifest.xml`
Change `TextProxyActivity` entry from:
```xml
android:theme="@android:style/Theme.NoTitleBar"
```
to:
```xml
android:theme="@style/TextViewerTheme"
```

Also add `android:noHistory="false"` to keep it in the back stack properly.

#### 3. `native/android/app/src/main/java/app/onetap/access/TextProxyActivity.java`
- Adopt the same `initializeThemeColors()` pattern from `WhatsAppProxyActivity`
- Wrap the WebView in a native `LinearLayout` that includes a proper top navigation bar built with native Android Views (a back/close button + title `TextView`) — no CDN dependency for this chrome
- Replace the CDN `<script src='marked.min.js'>` with a self-contained inline markdown renderer (a small pure-JS implementation — ~50 lines — that handles headers, bold, italic, inline code, and line breaks). This removes the network dependency.
- Add a `shortcut_name` extra for the title bar
- The checklist parsing switches from the `☐☑` symbol format to the `- [ ]` / `- [x]` format used in the React `TextViewer` (consistent with how text content is actually stored)

#### 4. `native/android/app/src/main/java/app/onetap/access/plugins/ShortcutPlugin.java`
Add a new `@PluginMethod`:

```java
@PluginMethod
public void openTextShortcut(PluginCall call) {
    String shortcutId = call.getString("shortcutId");
    String textContent = call.getString("textContent", "");
    boolean isChecklist = Boolean.TRUE.equals(call.getBoolean("isChecklist", false));
    String name = call.getString("name", "");

    Context context = getContext();
    Intent intent = new Intent(context, TextProxyActivity.class);
    intent.putExtra("shortcut_id", shortcutId);
    intent.putExtra("text_content", textContent);
    intent.putExtra("is_checklist", isChecklist);
    intent.putExtra("shortcut_name", name);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    context.startActivity(intent);

    JSObject result = new JSObject();
    result.put("success", true);
    call.resolve(result);
}
```

#### 5. `src/plugins/ShortcutPlugin.ts`
Add to the interface:
```typescript
openTextShortcut(options: {
  shortcutId: string;
  textContent: string;
  isChecklist: boolean;
  name: string;
}): Promise<{ success: boolean; error?: string }>;
```

#### 6. `src/plugins/shortcutPluginWeb.ts`
Add web stub:
```typescript
async openTextShortcut(options: { ... }): Promise<{ success: boolean; error?: string }> {
  // Web falls back gracefully — caller handles the navigate() fallback
  return { success: false, error: 'Not supported on web' };
}
```

#### 7. `src/components/MyShortcutsContent.tsx`
Update the `text` branch in `handleOpen`:

```typescript
} else if (shortcut.type === 'text') {
  if (Capacitor.isNativePlatform()) {
    await ShortcutPlugin.openTextShortcut({
      shortcutId: shortcut.id,
      textContent: shortcut.textContent || '',
      isChecklist: shortcut.isChecklist || false,
      name: shortcut.name,
    });
  } else {
    // Web fallback: in-app React route
    navigate(`/text/${shortcut.id}`, {
      state: {
        textContent: shortcut.textContent || '',
        isChecklist: shortcut.isChecklist || false,
        name: shortcut.name,
      },
    });
  }
}
```

### Summary

The WhatsApp chooser works instantly because `WhatsAppProxyActivity` is a pure-native dialog Activity that the Capacitor plugin starts via `startActivity` — the React WebView renders nothing. Text shortcuts need the same architecture. The plan adds an `openTextShortcut` plugin bridge method, gives `TextProxyActivity` a slide-up sheet animation and native header bar, and removes the CDN markdown dependency, making text shortcuts open just as instantly as WhatsApp choosers do — directly from the My Access Points list or from a home screen tap.
