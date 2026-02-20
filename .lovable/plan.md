
# Fix: Native Checklist Viewer — Checkboxes Cannot Be Checked/Unchecked

## Root Cause Analysis

There are **four compounding bugs** in `TextProxyActivity.java` that together make checkboxes completely non-interactive.

### Bug 1 — Outer `ScrollView` Steals All Touch Events from the WebView

The current layout hierarchy is:

```text
AlertDialog
  └── ScrollView  ← outer container (steals vertical touch events)
        └── LinearLayout
              └── LinearLayout (contentLayout)
                    └── WebView (fixed height)  ← never receives touches
```

Android's touch dispatch works top-down. When a user taps a checkbox inside the `WebView`, the touch is a `DOWN` event. The `ScrollView` intercepts this because it cannot know yet whether it is a scroll or a tap. By the time it decides it's a tap, it has already consumed or delayed the event such that the `WebView` never sees it as a confirmed tap on the checkbox input.

**Fix:** The `ScrollView` must be replaced entirely. The dialog itself (`AlertDialog` with `MessageChooserDialog` style) already handles window-level scrolling of the dialog card. The content inside does not need a wrapping `ScrollView`. The `WebView` manages its own internal scroll.

### Bug 2 — WebView Has a Fixed Pixel Height That Truncates Content

```java
int maxWebViewHeight = (int) (dm.heightPixels * 0.60f);
// ...
LinearLayout.LayoutParams webParams = new LinearLayout.LayoutParams(
    LinearLayout.LayoutParams.MATCH_PARENT,
    maxWebViewHeight  // ← hard pixel cap
);
```

The WebView is given a rigid height of 60% of the screen regardless of content. For checklists with more items, the items at the bottom are rendered outside the visible clipping bounds. They appear invisible but are still in the DOM — tapping what seems like a visible item may actually hit a different, clipped item's coordinate. More importantly, this means the WebView's internal scroll conflicts with no-one since there is no outer scroll, causing erratic behavior.

**Fix:** Replace `maxWebViewHeight` with `WRAP_CONTENT` and let the WebView measure itself after page load using a JS bridge that reports the document height back to Java, which then resizes the WebView. This is the standard pattern for embedding a WebView in a scrollable dialog: the WebView gets its natural height, and the dialog itself becomes scrollable.

### Bug 3 — `WebViewClient` Blocks Touch Until Page Is Fully Loaded

The current code calls `webView.loadDataWithBaseURL(...)` synchronously during `onCreate`, then immediately calls `dialog.show()`. If the WebView has not finished layout, touches during the loading window are silently dropped.

**Fix:** Keep `loadDataWithBaseURL` but in the `WebViewClient.onPageFinished` callback, call a JS function that posts the document's `scrollHeight` back to Java via the `Android` bridge. Java then resizes the WebView to fit content and removes the fixed height constraint.

### Bug 4 — `onchange` Event on Checkbox Is Correct, But `WebSettings` Is Missing `setBuiltInZoomControls(false)` and `setDisplayZoomControls(false)`

Without explicitly disabling zoom controls, on some Android versions the WebView enables zoom gestures, which can interfere with single-tap recognition on small elements like checkboxes.

**Fix:** Add explicit `setBuiltInZoomControls(false)` and `setDisplayZoomControls(false)`.

---

## Solution: Replace `ScrollView` Wrapper with Native `ScrollView` _Around Only the Header+Content_, Keep WebView Unclipped

The cleanest fix is:

1. **Remove the outer `ScrollView` wrapper entirely.** The `AlertDialog` window itself constrains the dialog card; no outer scroll is needed.
2. **Use `WRAP_CONTENT` for the WebView height** with a maximum cap applied via `setMaxHeight` on a custom subclass, OR use a fixed height that is generous enough (80% of screen) and let the WebView scroll internally.
3. **Explicitly disable WebView zoom** so single taps on checkboxes are recognized cleanly.
4. **Add `webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY)`** to keep the scrollbar from occupying layout space.
5. **Pass `isChecklist` field** as an instance variable so `clearChecklistState()` and the bridge can access it without recapturing a local.

The simplest and most correct fix (avoiding a custom WebView subclass) is:

- Replace the outer `ScrollView` with a plain `LinearLayout` as the dialog root.
- Give the WebView a height of `MATCH_PARENT` inside a `LinearLayout` that has a `maxHeight`-equivalent enforced by setting the dialog window's max height.
- OR: Set the WebView's height to `WRAP_CONTENT` and use `WebViewClient.onPageFinished` + a JS bridge callback to measure `document.body.scrollHeight` and resize the WebView programmatically to that height (capped at 65% of screen height).

**Chosen approach:** Use `onPageFinished` + JS measurement bridge. This is the most reliable pattern and avoids all touch interception issues.

---

## Changes Required

### `native/android/app/src/main/java/app/onetap/access/TextProxyActivity.java`

**Change 1 — Add `isChecklist` instance variable** (line 72 area):

```java
private boolean isChecklistMode; // stored for use in clearChecklistState + bridge
```

**Change 2 — Remove the outer `ScrollView`; use `LinearLayout` as dialog root** (line 143–283):

Replace:
```java
ScrollView scrollView = new ScrollView(this);
scrollView.setFillViewport(true);
scrollView.setBackgroundColor(colorBg);
// ...
builder.setView(scrollView);
```

With:
```java
// No outer ScrollView — WebView handles its own internal scrolling
// Outer ScrollView intercepts touch events and breaks checkbox interaction
builder.setView(mainLayout);
```

**Change 3 — Set WebView height to `WRAP_CONTENT` initially, resize after page load** (line 249–275):

Replace:
```java
LinearLayout.LayoutParams webParams = new LinearLayout.LayoutParams(
    LinearLayout.LayoutParams.MATCH_PARENT,
    maxWebViewHeight
);
```

With:
```java
// Start with WRAP_CONTENT; onPageFinished will resize to content height (capped at 65% screen)
LinearLayout.LayoutParams webParams = new LinearLayout.LayoutParams(
    LinearLayout.LayoutParams.MATCH_PARENT,
    LinearLayout.LayoutParams.WRAP_CONTENT
);
webView.setMinimumHeight(dpToPx(120)); // Prevent flash of zero-height
```

**Change 4 — Disable zoom controls** (around line 257):

```java
settings.setBuiltInZoomControls(false);
settings.setDisplayZoomControls(false);
settings.setSupportZoom(false);
```

**Change 5 — Override `WebViewClient.onPageFinished` to measure content height and resize WebView**:

```java
webView.setWebViewClient(new WebViewClient() {
    @Override
    public void onPageFinished(WebView view, String url) {
        // Measure real content height and resize WebView to fit, capped at 65% screen height
        view.evaluateJavascript(
            "(function(){ return document.body.scrollHeight; })()",
            value -> {
                try {
                    int contentHeight = Integer.parseInt(value);
                    int maxPx = (int)(dm.heightPixels * 0.65f);
                    int finalHeight = Math.min(contentHeight + dpToPx(16), maxPx);
                    runOnUiThread(() -> {
                        ViewGroup.LayoutParams lp = webView.getLayoutParams();
                        lp.height = finalHeight;
                        webView.setLayoutParams(lp);
                    });
                } catch (Exception ignored) {}
            }
        );
    }
});
```

**Change 6 — Add `onContentHeightReported` to `ChecklistBridge`** as a secondary signal (fallback for older WebViews that don't support `evaluateJavascript` callbacks):

```java
@JavascriptInterface
public void onContentHeight(int height) {
    int maxPx = (int)(dm.heightPixels * 0.65f);
    int finalH = Math.min(height + dpToPx(16), maxPx);
    runOnUiThread(() -> {
        ViewGroup.LayoutParams lp = webView.getLayoutParams();
        lp.height = finalH;
        webView.setLayoutParams(lp);
    });
}
```

And in the HTML JS, after render:
```js
window.addEventListener('load', function(){
  if(window.Android && Android.onContentHeight) {
    Android.onContentHeight(document.body.scrollHeight);
  }
});
```

**Change 7 — Add `setScrollBarStyle` and remove conflicting scroll settings**:

```java
webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
```

---

## Summary Table

| # | Root Cause | Fix |
|---|---|---|
| 1 | Outer `ScrollView` intercepts all touch events | Remove it; use plain `LinearLayout` as dialog root |
| 2 | Fixed pixel height clips content, misaligns tap targets | Replace with `WRAP_CONTENT` + JS-measured resize via `onPageFinished` |
| 3 | WebView zoom enabled, interferes with single-tap | `setBuiltInZoomControls(false)`, `setSupportZoom(false)` |
| 4 | Scrollbar occupies layout space | `setScrollBarStyle(SCROLLBARS_INSIDE_OVERLAY)` |

**File changed:** `native/android/app/src/main/java/app/onetap/access/TextProxyActivity.java` only. No XML, no other Java files.
