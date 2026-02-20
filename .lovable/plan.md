
# Make the Native Android "Reset Checklist" Confirmation Dialog Premium

## Problem

The only dialog triggered from the `TextProxyActivity` that looks non-premium is the **Reset confirmation** in `clearChecklistState()`. It uses a raw `AlertDialog.Builder` which renders a plain stock Android OS dialog — completely inconsistent with the surrounding premium centered card UI.

```java
new AlertDialog.Builder(this)
    .setTitle("Reset checklist?")
    .setMessage("All checked items will be unchecked. This cannot be undone.")
    .setPositiveButton("Reset", ...)
    .setNegativeButton("Cancel", null)
    .show();
```

This is the only "option" (dialog) triggered from the text viewer, and it sticks out badly.

## Solution

Replace the stock `AlertDialog.Builder` with a **custom-built premium confirmation dialog** that:

- Uses the same `MessageChooserDialog` style (already applied to the parent TextProxyActivity dialog) for the window chrome
- Overrides the window background with the same `GradientDrawable` (rounded corners, theme-aware bg, border) already used in `showPremiumDialog()`
- Has the same indigo accent bar at top
- Has a proper title + message using `colorText` / `colorTextMuted`, matching typography
- Has a footer with **two buttons** — "Cancel" (muted) and "Reset" (red/destructive accent) — using the same `RippleDrawable` rounded-corner pattern as the existing Done/Reset footer buttons
- Is theme-aware (dark/light) using the already-initialized color fields

## Implementation Detail

### File: `native/android/app/src/main/java/app/onetap/access/TextProxyActivity.java`

**Replace `clearChecklistState()` entirely.**

Instead of calling `AlertDialog.Builder`, we build a custom view programmatically (same pattern as `showPremiumDialog`) and show it via `AlertDialog.Builder` with `setView()` and the `MessageChooserDialog` style, then override the window background in `setOnShowListener`.

The confirmation dialog layout (built in code, no XML needed):

```
┌─────────────────────────────────────┐
│ ████████████████████████████████ ← 4dp indigo bar
│                                     │
│  Reset checklist?          [bold]   │
│  All checked items will be unchecked│
│  ─────────────────────────────────  │
│         Cancel  │  Reset            │
└─────────────────────────────────────┘
```

- The "Reset" button uses a **red/destructive** text color (`#EF4444`) to signal danger, consistent with premium product conventions
- "Cancel" uses `colorTextMuted` (matches the Done button style)
- Both buttons get the same `RippleDrawable` with proper rounded bottom corners
- No "Are you sure?" language (per Premium Experience Philosophy: prohibited)
- Title changed from "Reset checklist?" → **"Reset checklist"** (no question mark — more confident, premium)
- Message: **"All checked items will be unchecked"** (removed "This cannot be undone" — per philosophy: no redundant confirmation language)

### No new files, no XML changes needed

All styling is done programmatically, consistent with how the entire `TextProxyActivity` is built. The existing `colorBg`, `colorBorder`, `colorDivider`, `colorRipple`, `colorText`, `colorTextMuted`, `COLOR_ACCENT` fields are all reused.

## Summary

| What | Before | After |
|---|---|---|
| Confirmation style | Stock OS `AlertDialog` | Custom premium card matching parent dialog |
| Theme awareness | None (OS default) | Full dark/light using existing color fields |
| Button styling | OS default buttons | Ripple + rounded corners, destructive red for Reset |
| Language | "Are you sure?" style | Confident, direct (per Premium Philosophy) |
| File changes | — | `TextProxyActivity.java` only |
