
## Scope: Native Viewer Only — CSS Fixes for Text Wrapping & Multi-line Alignment

### What the User Wants

Check/uncheck should work **only** in the native viewer (`TextProxyActivity`), not in the creation editor. The editor is for writing items; the native dialog (opened by tapping the home screen shortcut) is where users check/uncheck items.

### Current State Assessment

**Creation editor (`TextEditorStep.tsx`):**
- The `☐` next to each input is a static, non-interactive `<span>` — this is correct and intentional. No changes needed here.
- `generateChecklistText` always emits `☐ text` (all unchecked) — correct, since editing resets checked state to unchecked for all items.

**Native viewer (`TextProxyActivity.java`) — check/uncheck already works:**
- Tapping a row toggles `cb.checked`, applies/removes the `done` CSS class, persists to `SharedPreferences` via the `Android.saveCheckboxState` JS bridge.
- Strikethrough is already implemented: `.ci.done span { text-decoration: line-through; opacity: 0.45 }` — correct.
- Reset button clears all state and reloads unchecked items.

**Two genuine CSS bugs in the native viewer that need fixing:**

### Bug 1 — Long Text Overflows Horizontally

Current CSS for the text span inside a checklist item:
```css
.ci span { line-height:1.5; flex:1; font-size:1em }
```

There is **no `word-break` or `overflow-wrap`**. A long unbroken word (e.g. a URL like `https://example.com/very/long/path`) will overflow the dialog's right edge on narrow screens.

**Fix:** Add `word-break:break-word; overflow-wrap:anywhere;` to `.ci span`.

### Bug 2 — Checkbox Misaligns With Multi-line Text

Current CSS for the row container:
```css
.ci { display:flex; align-items:center; gap:12px; ... }
```

`align-items:center` centres all children (including the checkbox) vertically against the **full height** of the row. For a 3-line item, the checkbox floats to the vertical middle of the text block instead of aligning with the first line — which looks wrong.

**Fix:** Change `.ci` to `align-items:flex-start` and add `margin-top:3px` to the checkbox so it optically aligns with the first text baseline.

---

### Changes Required

**File:** `native/android/app/src/main/java/app/onetap/access/TextProxyActivity.java`
**Method:** `buildHtml(...)` — specifically the `<style>` block inside the returned HTML string

**Line ~795 — change `.ci` alignment:**

From:
```java
+ ".ci{display:flex;align-items:center;gap:12px;margin:6px 0;min-height:48px;padding:4px 0;cursor:pointer}"
+ ".ci input[type=checkbox]{pointer-events:none;width:22px;height:22px;margin:0;accent-color:" + accent + ";flex-shrink:0}"
+ ".ci span{line-height:1.5;flex:1;font-size:1em}"
```

To:
```java
+ ".ci{display:flex;align-items:flex-start;gap:12px;margin:6px 0;min-height:48px;padding:4px 0;cursor:pointer}"
+ ".ci input[type=checkbox]{pointer-events:none;width:22px;height:22px;margin-top:3px;accent-color:" + accent + ";flex-shrink:0}"
+ ".ci span{line-height:1.5;flex:1;font-size:1em;word-break:break-word;overflow-wrap:anywhere}"
```

No other files are changed.

---

### Summary Table

| Area | Issue | Fix |
|---|---|---|
| Editor (`TextEditorStep.tsx`) | Interactive checkboxes during creation | None — static `☐` span is correct; no changes |
| Native viewer — check/uncheck | Already works | No changes needed |
| Native viewer — strikethrough | Already works via `.ci.done span` | No changes needed |
| Native viewer — long text overflow | No `word-break` on `.ci span` | Add `word-break:break-word;overflow-wrap:anywhere` |
| Native viewer — multi-line checkbox alignment | `align-items:center` centres checkbox mid-text | Change to `align-items:flex-start` + `margin-top:3px` on checkbox |

**Only one file changes:** `native/android/app/src/main/java/app/onetap/access/TextProxyActivity.java`
