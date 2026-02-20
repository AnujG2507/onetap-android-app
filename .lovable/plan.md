
## Update: Use App's True Primary Blue (#0080FF)

### What Changes (Color Only)

The previous plan used `#2196F3` (generic Android Material blue). The correct color is the app's own primary blue, which is defined in the design system as `--primary: 211 100% 50%` (HSL) — the equivalent hex is **`#0080FF`**. This is confirmed by two existing native drawables that already hardcode this value:

- `primary_option_bg.xml` — uses `#0080FF` for border/pressed stroke
- `message_card_bg.xml` — uses `#0080FF` for the left accent bar

### Two Lines Changed in TextProxyActivity.java

**Line 55 — COLOR_ACCENT constant:**
```java
// Before
private static final int COLOR_ACCENT = Color.parseColor("#6366f1");

// After
private static final int COLOR_ACCENT = Color.parseColor("#0080FF");
```
This affects: the top accent bar, the Edit button icon tint.

**Line 475 — inline accent string in buildHtml():**
```java
// Before
String accent = "#6366f1";

// After
String accent = "#0080FF";
```
This affects: inline CSS injected into the WebView for checklist checkbox tint, link colors, and any accent-coloured elements inside the rendered HTML.

### Everything Else Remains From the Approved Plan

The full footer-Reset layout plan is still intact:

- Reset button lives in the footer, to the left of Done (checklist mode only)
- Reset button text color uses `COLOR_ACCENT` — now correctly `#0080FF`
- Header simplified to three icons: Edit (blue tint), Copy (muted), Share (muted)
- Confirmation `AlertDialog` before clearing state
- `SharedPreferences("checklist_state")` as sole persistence — never synced
- `ic_checklist_reset.xml` drawable — unchanged

### Technical Summary

| Location | Before | After |
|---|---|---|
| `COLOR_ACCENT` constant (line 55) | `#6366f1` (indigo) | `#0080FF` (app primary blue) |
| `accent` CSS string in `buildHtml()` (line 475) | `#6366f1` | `#0080FF` |
| Reset button text color | `COLOR_ACCENT` (indigo) | `COLOR_ACCENT` (blue) — inherits the fix |
| Edit button icon tint | `COLOR_ACCENT` (indigo) | `COLOR_ACCENT` (blue) — inherits the fix |
| Top accent bar | `COLOR_ACCENT` (indigo) | `COLOR_ACCENT` (blue) — inherits the fix |
