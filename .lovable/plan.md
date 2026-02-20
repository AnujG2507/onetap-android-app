
## Fix: Minimum Height Floor + Correct Height Measurement Timing

### What Is Actually Wrong

Two bugs remain after reading the full code carefully:

---

### Bug 1 — Height Collapses: `onPageFinished` Fires Before JS Layout Completes

The flow in the current code is:

1. WebView starts at 75% height
2. `loadDataWithBaseURL(...)` is called — this loads the HTML document
3. `onPageFinished` fires — the browser signals "document loaded"
4. `evaluateJavascript` is run: `document.getElementById('content').offsetHeight`

The problem is at step 3–4. `onPageFinished` fires when the **HTML document** finishes loading, but the `<div id='content'>` is still empty at that point. The actual checklist content is inserted by `el.innerHTML = renderChecklist(...)` which runs in a `<script>` tag at the bottom of `<body>`. On Android WebView, the script runs, but the **layout reflow** (which calculates `offsetHeight`) happens asynchronously after the paint cycle. So when Java immediately calls `evaluateJavascript` in `onPageFinished`, `#content.offsetHeight` is still `0` (or very small before reflow), causing `finalHeight = 0 + dpToPx(40) = 40dp` — the WebView collapses to 40dp, showing only 1 item.

**Fix:** Delay the height measurement inside JS using `requestAnimationFrame` (fires after the next paint) wrapped in a `setTimeout(fn, 0)` as a double-buffer, to guarantee layout has happened before reading `offsetHeight`. Report the height back to Java via the `Android.onContentHeight` bridge instead of the `evaluateJavascript` return value.

The updated flow:
1. WebView loads HTML
2. Script runs, sets `innerHTML`, layout happens on next paint
3. `requestAnimationFrame → setTimeout` fires after paint → reads true `offsetHeight` → calls `Android.onContentHeight(height)`
4. Java receives the correct height and resizes

---

### Bug 2 — No Minimum Height Floor

The current code applies: `finalHeight = Math.min(contentPx + dpToPx(40), maxPx)` with no lower bound. For short checklists or if `offsetHeight` is briefly 0, the WebView shrinks to 40dp.

**Fix:** Apply a minimum height of `7 × 48dp = 336dp` worth of content plus the 40dp body padding = **~376dp minimum**. This guarantees at least 6–7 lines are always visible regardless of content length.

---

### Changes Required

**File:** `native/android/app/src/main/java/app/onetap/access/TextProxyActivity.java`

**Change 1 — Set `setMinimumHeight` on WebView** (after line 260):

```java
// Floor: ensure at least 7 checklist rows are always visible (7 × 48dp = 336dp + 40dp padding)
webView.setMinimumHeight(dpToPx(376));
```

**Change 2 — Set `initialWebHeight` with a floor as well** (line 255):

```java
int minWebHeight = dpToPx(376);  // 7 rows of 48dp + 40dp body padding
int initialWebHeight = Math.max(maxDialogHeight, minWebHeight); // always 75% since screen > 376dp
```

Actually the initial height stays at 75% (fine). The floor matters after `onPageFinished` shrinks it.

**Change 3 — Move height measurement from `evaluateJavascript` callback to JS-side `requestAnimationFrame`**

Remove the `evaluateJavascript` call from `onPageFinished` entirely (it races with layout). Instead rely on the `Android.onContentHeight` bridge which is called from JS after `requestAnimationFrame`.

Replace the `WebViewClient` from:
```java
webView.setWebViewClient(new WebViewClient() {
    @Override
    public void onPageFinished(WebView view, String url) {
        view.evaluateJavascript("(function(){ var el=...; return el ? el.offsetHeight : ...; })()", value -> { ... });
    }
});
```

With a minimal client that does nothing (height is handled purely via JS bridge):
```java
webView.setWebViewClient(new WebViewClient() {
    // Height measurement is done via Android.onContentHeight JS bridge
    // after requestAnimationFrame — which guarantees layout has completed.
    // evaluateJavascript in onPageFinished races with layout reflow and returns 0.
});
```

**Change 4 — Update the JS in `buildHtml` to use `requestAnimationFrame` for height reporting**

Replace the current `window.addEventListener('load', ...)` block:
```js
window.addEventListener('load', function(){
  if(window.Android && Android.onContentHeight){
    var el = document.getElementById('content');
    Android.onContentHeight(el ? el.offsetHeight : document.body.scrollHeight);
  }
});
```

With a double-buffered measurement that fires after paint:
```js
// Use requestAnimationFrame inside DOMContentLoaded to measure after layout reflow.
// 'load' fires too early on Android WebView — offsetHeight may still be 0 before paint.
document.addEventListener('DOMContentLoaded', function() {
  requestAnimationFrame(function() {
    setTimeout(function() {
      if (window.Android && Android.onContentHeight) {
        var el = document.getElementById('content');
        var h = el ? el.offsetHeight : document.body.scrollHeight;
        Android.onContentHeight(h);
      }
    }, 0);
  });
});
```

**Change 5 — Apply minimum height floor in `onContentHeight` bridge**

In `ChecklistBridge.onContentHeight`, change:
```java
int finalH = Math.min(height + dpToPx(40), maxPx);
```
To:
```java
int minH = dpToPx(376); // at least 7 rows of 48dp + 40dp body padding
int finalH = Math.max(Math.min(height + dpToPx(40), maxPx), minH);
```

---

### Summary

| # | Bug | Fix |
|---|---|---|
| 1 | `onPageFinished` + `evaluateJavascript` races with layout reflow → `offsetHeight = 0` → WebView collapses to 40dp | Remove `evaluateJavascript` from `onPageFinished`; measure in JS after `requestAnimationFrame + setTimeout(0)` and report via bridge |
| 2 | No minimum height floor → short checklists or race condition produces tiny dialog | Apply `376dp` floor (`7 × 48dp + 40dp`) in both `setMinimumHeight` and the bridge `finalH` calculation |

**File changed:** `native/android/app/src/main/java/app/onetap/access/TextProxyActivity.java` only.
