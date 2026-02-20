
# Fix: Native Checklist Viewer — Checkboxes Still Non-Interactive + Height Too Small

## Root Cause Deep-Dive (After Full Code Review)

After reading the complete `TextProxyActivity.java` the previous fix removed the outer `ScrollView` (correct), but three new/remaining bugs keep the checkboxes broken and the dialog too small.

---

### Bug A — `WRAP_CONTENT` WebView Collapses to Minimum Height; Dialog Never Resizes

Setting `WebView` to `WRAP_CONTENT` inside a `LinearLayout` inside an `AlertDialog` is a known Android platform limitation: the WebView measures to 0px or the minimum height before content loads. The dialog window is already committed to a specific height by the time `onPageFinished` fires.

When `setLayoutParams` is later called from `onPageFinished`, it changes the WebView's layout params, but **the dialog window does not re-measure** unless `dialog.getWindow().setLayout(...)` is explicitly called again. This is why the WebView appears stuck at the `setMinimumHeight(120dp)` fallback.

**Fix:** Give the WebView a proper starting height of `(int)(dm.heightPixels * 0.72f)` (72% of screen) so the dialog lays out correctly on first pass. After `onPageFinished`, shrink it to content size if content is shorter. Also call `dialog.getWindow().setLayout(MATCH_PARENT, WRAP_CONTENT)` in the `onShowListener` so the dialog window respects the inner layout's actual measured height.

---

### Bug B — `onchange` on `<input type="checkbox">` Is Unreliable Inside an AlertDialog WebView

In a WebView hosted inside an `AlertDialog` (which is not a full `Activity` window), `input[type=checkbox]` `onchange` events frequently fail to fire on Android Chrome WebView versions 85–120. The reason: the WebView receives the touch `DOWN`, passes it to the checkbox, but the `AlertDialog`'s window touch interceptor re-evaluates whether to dismiss the dialog on `UP`, causing some WebView versions to see a cancelled touch sequence — the checkbox value changes visually but `onchange` never fires.

The reliable fix (used by all major Android WebView checklist implementations) is:
- **Remove `onchange` from the `<input>` element entirely**
- **Handle the tap on the `.ci` container div using `onclick`**
- **Manually toggle `cb.checked` in JS** and call the save bridge from the click handler

This avoids the browser's native checkbox change detection entirely and relies only on a JS click event on the parent container, which is far more reliable inside embedded WebViews.

---

### Bug C — Dialog Window Does Not Expand to Fill Measured Content

The `AlertDialog` with `MessageChooserDialog` style has `windowIsFloating=true`. For a floating dialog, Android sizes the window once at `show()` time. Any `setLayoutParams` changes on child views after that point won't propagate unless the window itself is told to re-measure with `window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)`.

---

## Changes Required — Single File

### `native/android/app/src/main/java/app/onetap/access/TextProxyActivity.java`

**Fix 1 — Give WebView a real starting height; add window re-layout after resize**

Replace:
```java
LinearLayout.LayoutParams webParams = new LinearLayout.LayoutParams(
    LinearLayout.LayoutParams.MATCH_PARENT,
    LinearLayout.LayoutParams.WRAP_CONTENT
);
webView.setMinimumHeight(dpToPx(120));
```

With:
```java
// Start at 72% screen height — dialog lays out properly on first pass.
// onPageFinished will shrink this to exact content height if content is shorter.
int initialWebHeight = (int)(dm.heightPixels * 0.72f);
LinearLayout.LayoutParams webParams = new LinearLayout.LayoutParams(
    LinearLayout.LayoutParams.MATCH_PARENT,
    initialWebHeight
);
```

And update `onPageFinished` to call `window.setLayout` after resizing:
```java
runOnUiThread(() -> {
    ViewGroup.LayoutParams lp = webView.getLayoutParams();
    lp.height = finalHeight;
    webView.setLayoutParams(lp);
    // Force dialog window to re-measure after inner height change
    if (dialog != null && dialog.getWindow() != null) {
        dialog.getWindow().setLayout(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
    }
});
```

Also apply the same `window.setLayout` call in the `onShowListener` so the initial dialog window doesn't get clamped:
```java
dialog.setOnShowListener(d -> {
    if (dialog.getWindow() != null) {
        // Rounded card background
        GradientDrawable bg = ...;
        dialog.getWindow().setBackgroundDrawable(bg);
        // Allow dialog to grow/shrink to its measured content height
        dialog.getWindow().setLayout(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
    }
});
```

**Fix 2 — Replace `onchange` with reliable `onclick` on container div**

In `buildHtml`, the checklist renderer currently generates:
```html
<input type="checkbox" id="cb0" checked onchange="onCheck(0,this.checked)">
<label for="cb0">Item text</label>
```

Replace with a pattern that removes `onchange` from the input and instead handles taps on the `.ci` div:
```js
// OLD — unreliable inside AlertDialog WebView
html += '<input type="checkbox" id="cb'+i+'"'+(checked?' checked':'')+' onchange="onCheck('+i+',this.checked)">';

// NEW — reliable: onclick on container, manual toggle
html += '<input type="checkbox" id="cb'+i+'"'+(checked?' checked':'')+' onclick="event.stopPropagation()">';
// Container div has onclick that manually toggles state:
```

And change the container div from:
```html
<div class="ci done" id="ci0">
```
To one that has a click handler on the div itself:
```js
html += '<div class="ci'+(checked?' done':'\')+'" id="ci'+i+'" onclick="onCheck('+i+')">';
```

And update `onCheck` to toggle rather than accept a boolean:
```js
function onCheck(i) {
  var cb = document.getElementById('cb'+i);
  var item = document.getElementById('ci'+i);
  if(!cb || !item) return;
  cb.checked = !cb.checked;
  var checked = cb.checked;
  var key = 'chk_<sid>_'+i;
  savedState[key] = checked;
  item.className = 'ci' + (checked ? ' done' : '');
  if(window.Android && Android.saveCheckboxState) Android.saveCheckboxState(key, checked);
}
```

This removes all dependency on the native browser `onchange` event and handles everything through a JS `onclick` on the parent container, which is fully reliable in embedded Android WebViews.

**Fix 3 — CSS: make `.ci` touch target larger and remove pointer-events interference**

The current CSS sets `cursor:pointer` which is fine on desktop but on Android touch, the small 22px checkbox is the only real interactive target if `onchange` is used. With the new `onclick` on the div container, the entire row is tappable. Add `min-height:44px` and `align-items:center` to ensure the touch target meets Android's 48dp recommendation:
```css
.ci { display:flex; align-items:center; gap:12px; margin:6px 0; min-height:44px; padding:4px 0; }
.ci input[type=checkbox] { pointer-events:none; width:22px; height:22px; margin:0; accent-color:#0080FF; flex-shrink:0; }
```

Setting `pointer-events:none` on the checkbox itself (since the div now handles clicks) prevents any double-toggle issues.

---

## Summary Table

| # | Bug | Fix |
|---|---|---|
| A | `WRAP_CONTENT` WebView collapses; dialog not resized after `setLayoutParams` | Start at 72% height; call `window.setLayout(MATCH_PARENT, WRAP_CONTENT)` in both `onShowListener` and after `onPageFinished` resize |
| B | `onchange` on `<input type=checkbox>` unreliable inside `AlertDialog` WebView | Move handler to `onclick` on parent `.ci` div; manually toggle `cb.checked` in JS; set `pointer-events:none` on input |
| C | Dialog window clamps content height | Call `dialog.getWindow().setLayout(MATCH_PARENT, WRAP_CONTENT)` explicitly |

**File changed:** `native/android/app/src/main/java/app/onetap/access/TextProxyActivity.java` only.
