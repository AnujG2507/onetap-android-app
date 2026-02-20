
## Add Edit and Share Buttons to TextProxyActivity Header

### Goal

Replace the current centered title-only header with a three-part header row:
- **Title** (left-aligned, shortcut name)
- **Edit icon button** (opens the app, navigates to My Access Points, and opens the edit sheet for this shortcut)
- **Share icon button** (opens the native Android share sheet with the plain text content)

### How Each Button Works

**Edit button**

`ShortcutEditProxyActivity` already solves this perfectly — it stores the `shortcut_id` into SharedPreferences under `"onetap"` prefs key `"pending_edit_shortcut_id"`, then launches `MainActivity`. The JS hook `usePendingShortcutEdit` in the app detects this on launch and opens the edit sheet automatically.

The edit button in `TextProxyActivity` will replicate exactly that flow inline (no need to redirect through `ShortcutEditProxyActivity` as a second Activity):
1. Write `shortcut_id` to `SharedPreferences("onetap").pending_edit_shortcut_id`
2. Launch `MainActivity` with `FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TOP`
3. Dismiss and finish `TextProxyActivity`

**Share button**

Standard Android share sheet using `Intent.ACTION_SEND`:
```java
Intent shareIntent = new Intent(Intent.ACTION_SEND);
shareIntent.setType("text/plain");
shareIntent.putExtra(Intent.EXTRA_TEXT, textContent);
shareIntent.putExtra(Intent.EXTRA_SUBJECT, shortcutName); // pre-fills subject in email clients
startActivity(Intent.createChooser(shareIntent, "Share via"));
dismissDialog();
finish();
```

The raw `textContent` (markdown/checklist syntax) is shared as-is — it's the most portable plain text form, and most apps (Notes, Messages, WhatsApp) render it readably as plain text.

### Layout Change: Header Row

The current header is:
```
[        Title (centered)        ]
[      Subtitle (centered)       ]
```

The new header will be:
```
[ Title (left-flex) ] [ ✎ ] [ ↑ ]
[   Subtitle (centered)          ]
```

Specifically, a horizontal `LinearLayout` containing:
- `TextView` for the shortcut name — `layout_weight=1`, left-aligned, 17sp bold
- `TextView` edit button — pencil icon character `✎` (U+270E) or the text `"Edit"` — 32×32dp touchable, centered, indigo text
- `TextView` share button — share icon character `⬆` or text `"Share"` — 32×32dp touchable, centered, muted text

Since this is programmatic Android UI without a drawable library, the icons will be Unicode characters styled as icon buttons with circular ripple backgrounds:
- Edit: `✎` (U+270E pencil) or use text `"Edit"` if rendering is inconsistent
- Share: `⬆` or a cleaner approach — small labeled text buttons `"Edit"` and `"Share"` in caption style, indigo and muted respectively

Actually, for maximum clarity and premium feel: use small text labels styled as pill buttons, matching the pattern used in `addDoneButton()` but compact and side-by-side.

**Final header layout:**
```
┌────────────────────────────────┐
│████████ indigo bar ████████████│ ← 4dp
├────────────────────────────────┤
│  Shortcut Name         [✎][↑] │ ← title row (16dp v-padding)
│         Note / Checklist       │ ← subtitle (centered, muted)
├────────────────────────────────┤ ← divider
│         WebView content        │
├────────────────────────────────┤
│              Done              │
└────────────────────────────────┘
```

The `✎` (edit) and `↑` (share) icon buttons are 40×40dp touchable areas with `RippleDrawable` circular backgrounds, placed to the right of the title. They use Unicode symbols that render cleanly on all Android API levels (21+):
- Edit: `✏` (U+270F pencil, widely supported)
- Share: `⤴` or better — use the text symbols `•••` is too small. The cleanest approach for programmatic Android without vector drawables in the dialog context is to use the **material symbol font fallback characters**, but since we can't guarantee Noto Color Emoji, the most reliable is to use **short text labels** as secondary action buttons.

**Revised approach — text action buttons in header:**

```
[ Shortcut Name (flex)  ] [Edit] [Share]
```

Both `[Edit]` and `[Share]` are compact `TextView` buttons (no background box, just text):
- `"Edit"` in indigo (`#6366f1`), 13sp, semibold
- `"Share"` in muted color, 13sp
- Each has a `RippleDrawable` circular/rounded touch area padding of 8dp all sides

This matches the iOS-style subtle inline action buttons pattern that looks premium and is universally readable.

### Only One File Changes

**`TextProxyActivity.java`** — only changes:
1. Store `textContent` as an instance field (needed for share action)
2. Store `shortcutName` as an instance field (needed for share subject)
3. New `addHeaderRow()` method replacing the old separate title + subtitle adds
4. New `openEditInApp()` method (mirrors `ShortcutEditProxyActivity.onCreate()` logic)
5. New `shareText()` method using `Intent.ACTION_SEND`
6. Add two new imports: nothing new needed beyond what's already imported (`Intent`, `SharedPreferences` already present)

No changes to `AndroidManifest.xml`, `styles.xml`, `ShortcutPlugin.java`, or any JS/TS files — the `usePendingShortcutEdit` hook already handles the pending edit detection.

### Technical Details

**New imports needed:**
```java
import android.content.Intent;  // already implicitly available via Activity context
```
`Intent` is already used in `ShortcutEditProxyActivity` and `MainActivity`. In `TextProxyActivity` it's not yet imported — this needs to be added.

**`openEditInApp()` method:**
```java
private void openEditInApp() {
    if (shortcutId == null) return;
    // Store pending edit (same pattern as ShortcutEditProxyActivity)
    getSharedPreferences("onetap", MODE_PRIVATE)
        .edit()
        .putString("pending_edit_shortcut_id", shortcutId)
        .apply();
    // Launch main app
    Intent intent = new Intent(this, MainActivity.class);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    startActivity(intent);
    dismissDialog();
}
```

**`shareText()` method:**
```java
private void shareText() {
    Intent shareIntent = new Intent(Intent.ACTION_SEND);
    shareIntent.setType("text/plain");
    shareIntent.putExtra(Intent.EXTRA_TEXT, textContent);
    shareIntent.putExtra(Intent.EXTRA_SUBJECT, shortcutName);
    startActivity(Intent.createChooser(shareIntent, null));
    dismissDialog();
}
```

**`addHeaderRow()` replacing the old title+subtitle section:**
```java
// Horizontal row: [Title (flex)] [Edit btn] [Share btn]
LinearLayout headerRow = new LinearLayout(this);
headerRow.setOrientation(LinearLayout.HORIZONTAL);
headerRow.setGravity(Gravity.CENTER_VERTICAL);

TextView title = new TextView(...);  // weight=1, 17sp bold, left-aligned

TextView editBtn = new TextView(...); // "Edit", 13sp, indigo #6366f1, ripple touch target
editBtn.setOnClickListener(v -> openEditInApp());

TextView shareBtn = new TextView(...); // "Share", 13sp, muted, ripple touch target
shareBtn.setOnClickListener(v -> shareText());

// Subtitle stays centered below the row (unchanged)
```

### What Does Not Change

- `buildHtml()` — completely unchanged
- `ChecklistBridge` — completely unchanged
- `addDoneButton()` — completely unchanged
- `dismissDialog()`, `onBackPressed()`, `onDestroy()` — completely unchanged
- `initializeThemeColors()` — completely unchanged
- All styles, manifest entries, JS hooks — unchanged
