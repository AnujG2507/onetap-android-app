
## Redesigning the Native Text Viewer as a Premium Bottom Sheet Dialog

### Current Problem

`TextProxyActivity` is a full-screen Activity that slides up occupying 100% of the screen. This feels like navigating to a new screen rather than a lightweight, dismissible viewer. By contrast, `WhatsAppProxyActivity` presents as a floating, dimmed-background dialog with rounded corners and a polished card layout — it feels premium precisely because it sits *over* the current context without replacing it.

### Design Goal

Transform the text viewer into an `AlertDialog`-based bottom sheet, matching the WhatsApp chooser pattern:
- Floats over the blurred/dimmed home screen — no full-screen takeover
- Rounded top corners (20dp radius)
- A drag handle indicator at the top (the "pill" bar — universal Android sheet affordance)
- Shortcut name as a bold title
- The WebView (markdown/checklist content) embedded inside the dialog, capped at ~65% of screen height with scrolling
- A close/dismiss affordance at bottom (or via back-tap on dim area)
- Accent color treatment matching the app's `#6366f1` indigo palette

### Architecture: Dialog instead of Full-Screen Activity

The WhatsApp pattern uses `AlertDialog.Builder` with a custom view. The text viewer will adopt the same:

```text
TextProxyActivity (transparent Activity, no full-screen theme)
  └── AlertDialog (windowIsFloating=true, dim background)
        └── rounded container
              ├── drag handle pill (top)
              ├── title bar (shortcut name + close button)
              ├── divider
              └── WebView (max 65% screen height, scrollable)
```

### Files to Change

| File | Change |
|---|---|
| `TextProxyActivity.java` | Full redesign: remove full-screen layout, add AlertDialog with rounded sheet UI containing the WebView |
| `styles.xml` | Add `TextSheetDialog` style (floating, transparent window, dim background, slide-up animation) |
| `AndroidManifest.xml` | Change `TextProxyActivity` theme from `@style/TextViewerTheme` to `@android:style/Theme.Translucent.NoTitleBar` so the Activity window itself is transparent and the dialog floats above everything |

### Detailed Changes

**1. `styles.xml` — Add a new TextSheetDialog style**

Add a `TextSheetDialog` style next to the existing `MessageChooserDialog`. It inherits from `Theme.Material.Light.Dialog` and uses the same slide-up animation already in the project:

```xml
<style name="TextSheetDialog" parent="@android:style/Theme.Material.Light.Dialog">
    <item name="android:windowBackground">@android:color/transparent</item>
    <item name="android:windowIsFloating">true</item>
    <item name="android:windowNoTitle">true</item>
    <item name="android:backgroundDimEnabled">true</item>
    <item name="android:backgroundDimAmount">0.55</item>
    <item name="android:windowMinWidthMajor">100%</item>
    <item name="android:windowMinWidthMinor">100%</item>
    <item name="android:windowAnimationStyle">@style/TextSheetAnimation</item>
    <item name="android:windowElevation">24dp</item>
</style>

<style name="TextSheetAnimation">
    <item name="android:windowEnterAnimation">@anim/slide_up</item>
    <item name="android:windowExitAnimation">@anim/slide_down</item>
</style>
```

**2. `AndroidManifest.xml` — Change TextProxyActivity theme**

```xml
<!-- Before -->
android:theme="@style/TextViewerTheme"

<!-- After -->
android:theme="@android:style/Theme.Translucent.NoTitleBar"
```

This makes the Activity itself transparent so the dialog floats cleanly over the home screen with the dim layer behind it.

**3. `TextProxyActivity.java` — Full redesign**

Replace the full-screen `LinearLayout + setContentView` approach with an `AlertDialog` containing a premium sheet layout:

The new sheet structure (all built programmatically, matching WhatsApp's pattern):

```text
GradientDrawable (rounded top corners only — 20dp top, 0dp bottom)
  ├── [drag handle pill — centered, 40×4dp, muted color, 12dp margin top]
  ├── LinearLayout (title row, 16dp h-padding, 12dp v-padding)
  │     ├── TextView (shortcut name, bold, 17sp)
  │     └── TextView ("✕" close button, right-aligned, 20sp)
  ├── View (1px divider)
  └── WebView (maxHeight = 65% screen height, scrollable)
        └── [markdown/checklist HTML — same as today]
```

Key implementation details:
- The `AlertDialog` is anchored to the **bottom** of the screen using `window.setGravity(Gravity.BOTTOM)` and `window.setLayout(MATCH_PARENT, WRAP_CONTENT)`, which is how the WhatsApp dialog achieves its bottom sheet positioning within a full-width dialog.
- The background drawable uses **top-only rounded corners**: `cornerRadii = {20dp, 20dp, 0, 0, 0, 0, 0, 0}` (only top-left and top-right rounded).
- The WebView height is capped: measured as `(int)(displayMetrics.heightPixels * 0.65)` and set as `maxHeight` via a `ConstraintLayout` or by computing a fixed `LayoutParams` height — simpler to set a fixed pixel height based on the percentage.
- Theme colors are carried over from the existing `isDarkTheme()` logic — no change needed.
- The `ChecklistBridge` JS interface and all HTML rendering remain identical.
- `onBackPressed()` calls `dismissDialog()` then `finish()`.
- `setOnCancelListener` calls `finish()` so tapping the dim area closes the activity cleanly.

The drag handle pill adds a universal Android bottom-sheet affordance that immediately signals to users that this is swipe-dismissible content, not a new screen.

### Visual Comparison

```text
BEFORE (full-screen):              AFTER (bottom sheet dialog):
┌─────────────────────┐            ┌─────────────────────┐
│ [surfaceColor bar]  │            │                     │ ← dimmed home screen
│  ✕  Shortcut Name   │            │                     │
├─────────────────────┤            │                     │
│                     │            ├─────────────────────┤ ← rounded top
│                     │            │    ─────            │ ← drag pill
│  [full screen       │            │  ✕  Shortcut Name   │
│   markdown          │            ├─────────────────────┤
│   content]          │            │  [markdown content  │
│                     │            │   max 65% height    │
│                     │            │   scrollable]       │
│                     │            └─────────────────────┘ ← screen bottom
└─────────────────────┘
```

### No Impact On

- The checklist persistence logic (SharedPreferences + localStorage) — unchanged
- The HTML/CSS/JS rendering pipeline — unchanged
- Usage tracking via `NativeUsageTracker` — unchanged
- The `ShortcutPlugin.openTextShortcut()` method that launches the intent — unchanged
- Any other proxy activities

### Priority: High

This is a pure UI change with no logic impact and no risk to the checklist state machine. The three files are small and self-contained.
