
## Redesign TextProxyActivity: WhatsApp-Style Centered Floating Dialog

### What Needs to Change

The current TextProxyActivity is a bottom sheet (Gravity.BOTTOM, 100% width, slide-up). The user wants the same experience as the WhatsApp quick message dialog — a centered, floating premium card that appears over the dimmed screen, matching `WhatsAppProxyActivity` exactly.

Three additional issues are fixed simultaneously:
1. **Theme key mismatch bug** — `TextProxyActivity` reads `"resolved_theme"` but `WhatsAppProxyActivity` (the correct reference) reads `"resolvedTheme"` (camelCase). This means the text dialog always falls through to its hardcoded light fallback, completely ignoring the app's dark mode setting.
2. **System theme fallback missing** — WhatsApp's `initializeThemeColors()` has a proper fallback to the system night mode when no preference is stored; TextProxyActivity does not.
3. **Color palette divergence** — TextProxyActivity uses its own hardcoded color set. It should use the same carefully tuned palette as WhatsApp (dark: `#1A1A1A` bg, `#252525` surface, `#F5F5F5` text; light: `#FFFFFF` bg, `#FAFAFA` surface, `#1A1A1A` text).

### Files to Change: Only `TextProxyActivity.java`

No manifest or styles.xml changes are needed. The dialog builder style is switched to `R.style.MessageChooserDialog` (already in `styles.xml`) programmatically via the constructor, and the window gravity/layout are changed. The `TextSheetDialog` and `TextSheetAnimation` styles in styles.xml can remain (they are harmless).

### Detailed Changes in `TextProxyActivity.java`

**1. Theme initialization — mirror WhatsAppProxyActivity exactly**

Replace the simple `isDarkTheme()` single-method approach with the same `initializeThemeColors()` pattern used in WhatsApp:

```java
// Read from "resolvedTheme" (camelCase) — same key ShortcutPlugin.syncTheme writes
SharedPreferences prefs = getSharedPreferences("app_settings", Context.MODE_PRIVATE);
String resolvedTheme = prefs.getString("resolvedTheme", null);

if (resolvedTheme == null) {
    // System fallback
    int nightModeFlags = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
    isDarkTheme = (nightModeFlags == Configuration.UI_MODE_NIGHT_YES);
} else {
    isDarkTheme = "dark".equals(resolvedTheme);
}
```

**Color palette** (matching WhatsApp's):
```java
// Dark theme
colorBg       = Color.parseColor("#1A1A1A");
colorSurface  = Color.parseColor("#252525");
colorBorder   = Color.parseColor("#3A3A3A");
colorText     = Color.parseColor("#F5F5F5");
colorTextMuted= Color.parseColor("#9CA3AF");
colorDivider  = Color.parseColor("#3A3A3A");
colorCodeBg   = Color.parseColor("#2C2C2E");
colorAccent   = Color.parseColor("#6366f1"); // app accent (same both themes)

// Light theme
colorBg       = Color.parseColor("#FFFFFF");
colorSurface  = Color.parseColor("#FAFAFA");
colorBorder   = Color.parseColor("#E5E5E5");
colorText     = Color.parseColor("#1A1A1A");
colorTextMuted= Color.parseColor("#6B7280");
colorDivider  = Color.parseColor("#E0E0E0");
colorCodeBg   = Color.parseColor("#F4F4F4");
colorAccent   = Color.parseColor("#6366f1");
```

**2. Dialog structure — switch from bottom-sheet to centered card**

Replace the current `showBottomSheet()` method with `showPremiumDialog()`:

```text
ScrollView (fills dialog, background = colorBg)
  └── LinearLayout (vertical)
        ├── View (accent bar — 4dp tall, indigo #6366f1, full width)
        ├── LinearLayout (content, padding 20dp)
        │     ├── TextView (shortcut name, 20sp bold, centered)
        │     ├── TextView (type label: "Checklist" or "Note", 14sp muted, centered)
        │     ├── View (1dp divider)
        │     └── WebView (markdown/checklist content, max 60% screen height)
        └── TextView (Done/Close button — centered, muted, with ripple)
```

The dialog is built with `R.style.MessageChooserDialog` which already gives:
- 90% min width
- 20dp rounded corners via `dialog_rounded_bg` drawable
- `backgroundDimAmount=0.6`
- Fade in/out animation

The background drawable is then overridden in `setOnShowListener` (same pattern as WhatsApp) to respect the dark/light `colorBg` and `colorBorder`:
```java
dialog.setOnShowListener(d -> {
    if (dialog.getWindow() != null) {
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(colorBg);
        bg.setCornerRadius(dpToPx(20));
        bg.setStroke(dpToPx(1), colorBorder);
        dialog.getWindow().setBackgroundDrawable(bg);
    }
});
```

**3. The indigo accent bar at the top**

Matching the WhatsApp green bar, but using the app's `#6366f1` indigo:
```java
View accentBar = new View(this);
accentBar.setBackgroundColor(Color.parseColor("#6366f1"));
accentBar.setLayoutParams(new LinearLayout.LayoutParams(MATCH_PARENT, dpToPx(4)));
```

**4. Header section**

```java
// Title: shortcut name, 20sp bold, centered
// Subtitle: "Checklist" or "Note", 14sp muted, centered, 20dp bottom margin
```

**5. WebView — same HTML engine, new container**

The WebView is embedded with a `maxHeight` of `60%` of screen height. The `buildHtml()` method is updated to use the matched color variables instead of its own hardcoded color strings, so dark/light renders correctly:
- `bg` → `colorBg` hex
- `fg` → `colorText` hex
- `codeBg` → `colorCodeBg` hex
- `hrColor` → `colorDivider` hex
- `accent` → `#6366f1` (unchanged)

**6. Close button at bottom (matching WhatsApp's Cancel button)**

```java
// "Done" button — centered, muted text, subtle ripple, 16dp padding
// Same RippleDrawable pattern as WhatsApp's addCancelButton()
```

**7. Gravity: centered (not bottom)**

Remove `window.setGravity(Gravity.BOTTOM)` and `window.setLayout(MATCH_PARENT, WRAP_CONTENT)`. The `MessageChooserDialog` style handles centering natively.

### New Class Structure

```text
TextProxyActivity
  Fields:
    - isDarkTheme: boolean
    - colorBg, colorSurface, colorBorder, colorText, colorTextMuted,
      colorDivider, colorCodeBg, colorAccent: int
    - webView: WebView
    - dialog: AlertDialog
    - shortcutId: String

  Methods:
    + onCreate()                         — reads extras, calls initThemeColors(), showDialog()
    + initThemeColors()                  — reads "resolvedTheme" from SharedPreferences, system fallback
    + showPremiumDialog(name, content, isChecklist)
    + buildHtml(text, isChecklist, sid)  — now uses instance color fields
    + dismissDialog()
    + onBackPressed()
    + onDestroy()
    + dpToPx(int)
    + ChecklistBridge (inner class)      — unchanged
```

### What Stays the Same (No Risk)

- `ChecklistBridge` JS interface — completely unchanged
- `buildHtml()` logic (markdown renderer, checklist renderer, toggle function) — logic unchanged, only color variables updated to use instance fields
- `NativeUsageTracker.recordTap()` — unchanged
- AndroidManifest.xml — unchanged (already `Theme.Translucent.NoTitleBar` which is correct)
- `styles.xml` — unchanged (MessageChooserDialog already exists)

### Visual Result

```text
                ┌────────────────────┐
                │████ indigo bar ████│ ← 4dp #6366f1 accent
                ├────────────────────┤
                │   My Grocery List  │ ← 20sp bold, centered
                │       Note         │ ← 14sp muted, centered
                ├────────────────────┤ ← 1dp divider
                │                    │
                │  - [ ] Milk        │
                │  - [x] Eggs        │ ← WebView (max 60% height)
                │  - [ ] Bread       │
                │                    │
                ├────────────────────┤
                │        Done        │ ← muted, ripple, centered
                └────────────────────┘
                  Dimmed background (0.6 opacity)
```

Theme-aware: dark mode shows `#1A1A1A` card bg, `#F5F5F5` text — synced from the app's actual theme setting, not the system theme (unless no preference is stored).
