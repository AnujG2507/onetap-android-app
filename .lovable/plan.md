
## Upgrade TextProxyActivity Header Buttons to Premium Icon Buttons

### What "Premium Like the PDF Viewer" Means

The PDF viewer uses `ImageButton` widgets with:
- White vector icon drawables (`ic_close_pdf.xml`, `ic_share.xml`, `ic_open_external.xml`)
- `ripple_circle` drawable as background — a circular oval ripple mask, same size as the touch target (48×48dp)
- `setColorFilter()` to tint icons at runtime
- `ScaleType.CENTER` so the icon is crisp at its native size inside the touch target

The current text proxy buttons are plain `TextView` labels ("Edit", "Copy", "Share") with a rectangular `RippleDrawable` — no icon, no circular ripple, no visual weight. This is the gap to close.

### Files That Change

**New drawable files (3 new vector XML files):**
- `native/android/app/src/main/res/drawable/ic_text_edit.xml` — pencil/edit icon (24×24dp, white fill)
- `native/android/app/src/main/res/drawable/ic_text_copy.xml` — clipboard icon (24×24dp, white fill)  
- `native/android/app/src/main/res/drawable/ic_text_share.xml` — share icon (24×24dp, white fill) — can reuse `ic_share.xml` paths but sized correctly for the dialog context

**One Java file:**
- `native/android/app/src/main/java/app/onetap/access/TextProxyActivity.java` — replace three `TextView` action buttons with `ImageButton` widgets

### Icon Drawables

**`ic_text_edit.xml`** — standard Material pencil (24dp, white paths):
```xml
<vector android:width="24dp" android:height="24dp"
        android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFF"
          android:pathData="M3,17.25V21h3.75L17.81,9.94l-3.75,-3.75L3,17.25z
                            M20.71,7.04c0.39,-0.39 0.39,-1.02 0,-1.41l-2.34,-2.34
                            c-0.39,-0.39 -1.02,-0.39 -1.41,0l-1.83,1.83 3.75,3.75 1.83,-1.83z"/>
</vector>
```

**`ic_text_copy.xml`** — Material content-copy clipboard (24dp, white paths):
```xml
<vector android:width="24dp" android:height="24dp"
        android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFF"
          android:pathData="M16,1H4c-1.1,0 -2,0.9 -2,2v14h2V3h12V1z
                            M19,5H8c-1.1,0 -2,0.9 -2,2v14c0,1.1 0.9,2 2,2h11
                            c1.1,0 2,-0.9 2,-2V7c0,-1.1 -0.9,-2 -2,-2z
                            M19,21H8V7h11v14z"/>
</vector>
```

**`ic_text_share.xml`** — reuse the same paths from `ic_share.xml` (already exists with white fill, 24×24dp) — no need to create a new file, reference `R.drawable.ic_share` directly.

### Java Changes in `showPremiumDialog()`

Replace the three `TextView` button blocks with `ImageButton` blocks following the exact PDF viewer pattern:

```java
int iconBtnSize = dpToPx(40); // 40dp touch target (slightly smaller than PDF's 48dp, proportional to dialog)

// Edit button
ImageButton editBtn = new ImageButton(this);
editBtn.setImageResource(R.drawable.ic_text_edit);
editBtn.setBackgroundResource(R.drawable.ripple_circle);
editBtn.setColorFilter(COLOR_ACCENT);         // indigo tint for Edit
editBtn.setScaleType(ImageView.ScaleType.CENTER);
editBtn.setLayoutParams(new LinearLayout.LayoutParams(iconBtnSize, iconBtnSize));
editBtn.setOnClickListener(v -> openEditInApp());
headerRow.addView(editBtn);

// Copy button
ImageButton copyBtn = new ImageButton(this);
copyBtn.setImageResource(R.drawable.ic_text_copy);
copyBtn.setBackgroundResource(R.drawable.ripple_circle);
copyBtn.setColorFilter(colorTextMuted);       // muted tint for Copy
copyBtn.setScaleType(ImageView.ScaleType.CENTER);
copyBtn.setLayoutParams(new LinearLayout.LayoutParams(iconBtnSize, iconBtnSize));
copyBtn.setOnClickListener(v -> copyText());
headerRow.addView(copyBtn);

// Share button
ImageButton shareBtn = new ImageButton(this);
shareBtn.setImageResource(R.drawable.ic_share); // reuse existing
shareBtn.setBackgroundResource(R.drawable.ripple_circle);
shareBtn.setColorFilter(colorTextMuted);       // muted tint for Share
shareBtn.setScaleType(ImageView.ScaleType.CENTER);
shareBtn.setLayoutParams(new LinearLayout.LayoutParams(iconBtnSize, iconBtnSize));
shareBtn.setOnClickListener(v -> shareText());
headerRow.addView(shareBtn);
```

The `ripple_circle` drawable uses `#40FFFFFF` as its ripple color. For the light-theme dialog where the background is `#FFFFFF`, this white ripple won't be visible. The fix is to create a second ripple drawable `ripple_circle_dark.xml` that uses a dark ripple (`#30000000`) so it shows on white backgrounds. The correct drawable is selected at runtime:

```java
editBtn.setBackgroundResource(isDarkTheme ? R.drawable.ripple_circle : R.drawable.ripple_circle_dark);
```

**New `ripple_circle_dark.xml`** (4th new file):
```xml
<?xml version="1.0" encoding="utf-8"?>
<ripple xmlns:android="http://schemas.android.com/apk/res/android"
    android:color="#30000000">
    <item android:id="@android:id/mask">
        <shape android:shape="oval">
            <solid android:color="#FFFFFF"/>
        </shape>
    </item>
</ripple>
```

### New Import Needed

```java
import android.widget.ImageButton;
import android.widget.ImageView;
```

### What the Header Looks Like After

```
┌────────────────────────────────────┐
│█████████ indigo bar ███████████████│ ← 4dp accent
├────────────────────────────────────┤
│  Shortcut Name (flex)  [✏] [⎘] [↑] │ ← 40dp icon buttons, circular ripple
│          Note / Checklist           │ ← subtitle
├────────────────────────────────────┤
│            WebView                  │
├────────────────────────────────────┤
│              Done                   │
└────────────────────────────────────┘
```

- **Edit** `[✏]` — indigo (`#6366f1`) tinted pencil icon, circular ripple
- **Copy** `[⎘]` — muted-tinted clipboard icon, circular ripple
- **Share** `[↑]` — muted-tinted share icon, circular ripple (reuses existing `ic_share.xml`)

### Summary of Files Changed

| File | Change |
|------|--------|
| `drawable/ic_text_edit.xml` | New: pencil vector icon |
| `drawable/ic_text_copy.xml` | New: clipboard vector icon |
| `drawable/ripple_circle_dark.xml` | New: dark-ripple circular ripple for light theme |
| `TextProxyActivity.java` | Replace 3 `TextView` buttons → 3 `ImageButton`; add 2 imports |

`ic_share.xml` already exists and is reused directly — no new share icon needed.

### What Stays the Same

- `openEditInApp()`, `copyText()`, `shareText()` — unchanged
- `buildHtml()`, `ChecklistBridge`, `addDoneButton()` — unchanged
- All theme color logic — unchanged
- `ripple_circle.xml` — unchanged (still used in dark theme)
