
## Add Copy Button to TextProxyActivity Header

### What Changes

One file only: `TextProxyActivity.java`

Two additions:
1. Import `android.content.ClipboardManager` and `android.content.ClipData` at the top of the file
2. A new "Copy" button inserted in the header row between "Share" and the end (or after "Share") with a `copyText()` handler method

### Exact Layout After Change

```
[ Shortcut Name (flex) ] [ Edit ] [ Copy ] [ Share ]
```

- **Edit** — indigo (`#6366f1`), bold, opens app to edit sheet
- **Copy** — muted text, copies plain text to clipboard + shows Toast
- **Share** — muted text, opens native share sheet

The order keeps Edit first (most important action), then Copy (quick one-tap utility), then Share (secondary action that opens another sheet).

### New `copyText()` Method

Uses `ClipboardManager` — the standard Android clipboard API available since API 11:

```java
private void copyText() {
    android.content.ClipboardManager clipboard =
        (android.content.ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
    if (clipboard != null) {
        android.content.ClipData clip =
            android.content.ClipData.newPlainText(shortcutName, textContent);
        clipboard.setPrimaryClip(clip);
    }
    android.widget.Toast.makeText(this, "Copied to clipboard", android.widget.Toast.LENGTH_SHORT).show();
    // Does NOT dismiss the dialog — user stays in the viewer after copying
}
```

Key design decision: **Copy does NOT dismiss the dialog**. Unlike Edit (which opens the app) and Share (which opens the system sheet), Copy is a lightweight action — the user may want to read the content again or do something else after copying. Keeping the dialog open is the right UX here, matching how most Android apps handle clipboard copy actions.

### New imports needed

```java
import android.content.ClipData;
import android.content.ClipboardManager;
import android.widget.Toast;
```

### Copy Button Layout (matching Share button style)

The Copy button follows the exact same pattern as the Share and Edit buttons — same `13sp` size, same `8dp` padding, same `RippleDrawable` background, muted text color:

```java
TextView copyBtn = new TextView(this);
copyBtn.setText("Copy");
copyBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
copyBtn.setTextColor(colorTextMuted);
copyBtn.setGravity(Gravity.CENTER);
copyBtn.setPadding(btnPad, btnPad, btnPad, btnPad);
GradientDrawable copyContent = new GradientDrawable();
copyContent.setColor(android.graphics.Color.TRANSPARENT);
copyContent.setCornerRadius(dpToPx(8));
android.content.res.ColorStateList copyRipple = android.content.res.ColorStateList.valueOf(colorRipple);
copyBtn.setBackground(new android.graphics.drawable.RippleDrawable(copyRipple, copyContent, copyContent));
copyBtn.setClickable(true);
copyBtn.setFocusable(true);
copyBtn.setOnClickListener(v -> copyText());
headerRow.addView(copyBtn);  // inserted between editBtn and shareBtn
```

### File Changes Summary

| Change | Lines Affected |
|---|---|
| Add 3 imports (`ClipData`, `ClipboardManager`, `Toast`) | Lines 1–30 |
| Add Copy button in header row (after Edit, before Share) | ~Line 199 |
| Add `copyText()` method (after `shareText()`) | ~Line 357 |

### What Stays the Same

- `buildHtml()` — unchanged
- `ChecklistBridge` — unchanged  
- `addDoneButton()` — unchanged
- `initializeThemeColors()` — unchanged
- `openEditInApp()` and `shareText()` — unchanged
- `AndroidManifest.xml` and `styles.xml` — unchanged

No permissions are required — clipboard write access is available to all Android apps without declaring a permission in the manifest.
