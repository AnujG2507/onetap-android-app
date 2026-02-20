
## Interactive Checklist State — Local-Only with Reset

### What This Feature Does

When the user opens a checklist text shortcut, they can tap items to check/uncheck them — the item text gets a strikethrough and dims. The checked state is saved locally on the device, tied to the shortcut ID, and survives app restarts. A "Reset" action in the header lets them clear all checkmarks at once to start the daily task cycle fresh. The app is only opened when Edit is pressed (current behaviour, unchanged).

### What Already Exists

The current `TextProxyActivity` already has the skeleton of this:
- `ChecklistBridge.saveCheckboxState(key, checked)` — Java bridge saves to `SharedPreferences("checklist_state")`
- `localStorage` in the WebView stores state per `chk_{sid}_{index}`
- The `toggle(i)` JS function reads/writes `localStorage` and also calls the bridge
- `.ci.done label` CSS already applies `text-decoration: line-through; opacity: 0.45`

**The problem:** The checklist items are currently rendered once at page load from `localStorage`. When the user taps an item, `toggle()` updates `localStorage` and the DOM inline — this part works. However:
1. The `ChecklistBridge` saves to `SharedPreferences` as a backup but the checklist renderer on page load reads only `localStorage` — if `localStorage` is cleared by WebView storage GC, state is lost.
2. There is no Reset button.
3. The storage key format mixes `localStorage` (WebView) and `SharedPreferences` (Java) — they need to be reconciled under a single clean contract.

### The Clean Architecture

The source of truth will be **`SharedPreferences("checklist_state", MODE_PRIVATE)`** only — keyed as `chk_{shortcutId}_{lineIndex}`. 

Flow on open:
```
SharedPreferences → Java reads all keys for this shortcutId
                 → passes saved state into buildHtml() as a JSON map
                 → JS renders checklist with correct initial checked states
```

Flow on tap:
```
User taps item → JS toggle() → Android.saveCheckboxState(key, checked)
               → SharedPreferences updated
               → DOM updated (strikethrough / unstrikethrough)
```

Flow on Reset:
```
User taps Reset icon → Java clearChecklistState() removes all keys for shortcutId
                     → webView.evaluateJavascript("resetAllItems()") resets DOM
```

This keeps all state local, never synced, and cleanly separated by shortcut ID.

### Files Changed

| File | Change |
|---|---|
| `drawable/ic_checklist_reset.xml` | New: circular refresh/reset vector icon |
| `TextProxyActivity.java` | All logic changes — see below |

No manifest changes, no JS/TS changes, no Supabase changes.

---

### Detailed Changes to `TextProxyActivity.java`

#### 1. New `clearChecklistState()` method
Deletes all `SharedPreferences` entries whose key starts with `chk_{shortcutId}_`:

```java
private void clearChecklistState() {
    if (shortcutId == null) return;
    SharedPreferences prefs = getSharedPreferences(PREFS_CHECKLIST, MODE_PRIVATE);
    SharedPreferences.Editor editor = prefs.edit();
    String prefix = "chk_" + shortcutId + "_";
    for (String key : prefs.getAll().keySet()) {
        if (key.startsWith(prefix)) editor.remove(key);
    }
    editor.apply();
    // Tell the WebView to visually reset all items
    if (webView != null) {
        webView.evaluateJavascript("resetAllItems()", null);
    }
    Toast.makeText(this, "Checklist reset", Toast.LENGTH_SHORT).show();
}
```

#### 2. Reset `ImageButton` added to header (checklist mode only)

The Reset button is only shown when `isChecklist == true`. It uses the new `ic_checklist_reset` drawable with the same muted tint and circular ripple as Copy/Share:

```java
if (isChecklist) {
    ImageButton resetBtn = new ImageButton(this);
    resetBtn.setImageResource(R.drawable.ic_checklist_reset);
    resetBtn.setBackgroundResource(rippleRes);
    resetBtn.setColorFilter(colorTextMuted);
    resetBtn.setScaleType(ImageView.ScaleType.CENTER);
    resetBtn.setContentDescription("Reset checklist");
    resetBtn.setLayoutParams(new LinearLayout.LayoutParams(iconBtnSize, iconBtnSize));
    resetBtn.setOnClickListener(v -> clearChecklistState());
    headerRow.addView(resetBtn); // inserted before Share
}
```

Header layout for checklists:
```
[ Name (flex) ] [ Edit ] [ Copy ] [ Reset ] [ Share ]
```
Header layout for notes (unchanged):
```
[ Name (flex) ] [ Edit ] [ Copy ] [ Share ]
```

#### 3. Load saved state from SharedPreferences into HTML

`buildHtml()` receives a new `Map<String, Boolean> savedState` parameter. This map is built in Java before calling `buildHtml()`:

```java
// Collect saved checklist state for this shortcut
Map<String, Boolean> savedState = new java.util.HashMap<>();
if (isChecklist && shortcutId != null) {
    SharedPreferences prefs = getSharedPreferences(PREFS_CHECKLIST, MODE_PRIVATE);
    String prefix = "chk_" + shortcutId + "_";
    for (Map.Entry<String, ?> entry : prefs.getAll().entrySet()) {
        if (entry.getKey().startsWith(prefix) && entry.getValue() instanceof Boolean) {
            savedState.put(entry.getKey(), (Boolean) entry.getValue());
        }
    }
}
String html = buildHtml(textContent, isChecklist, shortcutId, savedState);
```

In `buildHtml()`, the map is serialized to a JS JSON literal:
```java
// Build JS object: {"chk_abc_0": true, "chk_abc_2": true, ...}
StringBuilder savedJson = new StringBuilder("{");
for (Map.Entry<String, Boolean> e : savedState.entrySet()) {
    savedJson.append("\"").append(e.getKey()).append("\":").append(e.getValue()).append(",");
}
if (savedJson.length() > 1) savedJson.setLength(savedJson.length() - 1); // trim trailing comma
savedJson.append("}");
```

Then injected into the HTML as a JS constant:
```javascript
var savedState = { "chk_id_0": true, "chk_id_2": false };
```

The `renderChecklist` JS function then reads from `savedState` instead of `localStorage`:
```javascript
function renderChecklist(text, sid) {
    var lines = text.split('\n'), html = '';
    lines.forEach(function(line, i) {
        var m = line.match(/^- \[( |x)\] (.*)/i);
        if (m) {
            var key = 'chk_' + sid + '_' + i;
            var checked = (savedState[key] !== undefined) ? savedState[key] : (m[1].toLowerCase() === 'x');
            html += '<div class="ci' + (checked ? ' done' : '') + '" id="ci' + i + '" onclick="toggle(' + i + ')">';
            html += '<input type="checkbox" id="cb' + i + '"' + (checked ? ' checked' : '') + '>';
            html += '<label for="cb' + i + '">' + escHtml(m[2]) + '</label></div>';
        }
        // ...
    });
    return html;
}
```

#### 4. Add `resetAllItems()` JS function

Added to the HTML `<script>` block — called via `evaluateJavascript` from Java when Reset is tapped:
```javascript
function resetAllItems() {
    var items = document.querySelectorAll('.ci');
    items.forEach(function(item) {
        item.classList.remove('done');
        var cb = item.querySelector('input[type=checkbox]');
        if (cb) cb.checked = false;
    });
}
```

#### 5. Confirm Dialog before Reset

Rather than immediately clearing state (which is irreversible), tapping Reset shows a small Android `AlertDialog` with two choices — "Reset" (destructive, red) and "Cancel":

```java
private void clearChecklistState() {
    new AlertDialog.Builder(this)
        .setTitle("Reset checklist?")
        .setMessage("All checked items will be unchecked. This cannot be undone.")
        .setPositiveButton("Reset", (d, w) -> {
            // ...perform clear...
        })
        .setNegativeButton("Cancel", null)
        .show();
}
```

This matches standard Android UX for destructive confirmations and prevents accidental resets.

---

### New Drawable: `ic_checklist_reset.xml`

Material "refresh" icon (standard circular arrow, 24dp, white fill — tinted at runtime):

```xml
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M17.65,6.35C16.2,4.9 14.21,4 12,4c-4.42,0 -7.99,3.58 -7.99,8s3.57,8 7.99,8c3.73,0 6.84,-2.55 7.73,-6h-2.08c-0.82,2.33 -3.04,4 -5.65,4 -3.31,0 -6,-2.69 -6,-6s2.69,-6 6,-6c1.66,0 3.14,0.69 4.22,1.78L13,11h7V4l-2.35,2.35z"/>
</vector>
```

---

### What Does NOT Change

- `openEditInApp()` — unchanged; Edit button still opens the app to the edit sheet and dismisses the dialog
- `shareText()` — unchanged
- `copyText()` — copies raw `textContent` (the shortcut definition), unchanged
- `ChecklistBridge.saveCheckboxState()` — kept but now is the sole persistence path (localStorage removed from checklist rendering)
- Note mode rendering — entirely unchanged
- All sync/cloud backup logic — untouched; `SharedPreferences("checklist_state")` is never read by `cloudSync.ts` or any Supabase edge function

---

### Storage Key Contract (Final)

```
SharedPreferences name : "checklist_state"
Key format            : chk_{shortcutId}_{lineIndex}
Value type            : Boolean (true = checked)
Scope                 : Per shortcut, per checklist line
Reset                 : All keys matching prefix chk_{shortcutId}_ are deleted
Sync                  : Never — local device only
```

This is completely isolated from the cloud sync system in `src/lib/cloudSync.ts` which only reads from the Supabase `shortcuts` table columns — `text_content` and `is_checklist` — never `SharedPreferences`.
