
## Documentation Update Plan

This plan covers all changes needed to bring the four documentation files (`APP_SUMMARY.md`, `ARCHITECTURE.md`, `SUPABASE.md`, `PRODUCT_IDEOLOGY.md`) in sync with three batches of recent code changes:

1. **Text Viewer UX** — `TextProxyActivity`: blue accent (`#0080FF`), Reset button moved from header to footer, header simplified to Edit/Copy/Share only.
2. **Checklist state clearing** — New `clearChecklistState` Capacitor method (Java plugin, TS interface, web fallback) to clear `SharedPreferences` when checklist item order changes.
3. **Drag-to-reorder in editor** — `TextEditorStep` now has `@dnd-kit` drag handles on checklist items; a one-time toast warns on first reorder; `orderChanged` flag flows through to `ShortcutEditSheet` which calls `clearChecklistState` on save.

---

### Files Changed

| File | Sections Updated |
|------|-----------------|
| `APP_SUMMARY.md` | Text shortcuts description, Native Bridge table, Key Files |
| `ARCHITECTURE.md` | Section 3 (TextProxyActivity description), Checklist state persistence note, Section 13 intent table |
| `SUPABASE.md` | Checklist state note in `cloud_shortcuts` table |
| `PRODUCT_IDEOLOGY.md` | Section 6 Offline-First table (text shortcut row) |

---

### Precise Change Details

#### `APP_SUMMARY.md`

**Section "Core Features → 1. One Tap Access"** — update the text shortcut bullet to describe the new viewer UX (blue accent, footer Reset, no reorder) and editor (drag-to-reorder with state-clear warning):

Current:
> Text shortcuts: inline Markdown note or interactive checklist; rendered in a full-screen WebView via TextProxyActivity; checklist state persists on-device

New:
> Text shortcuts: inline Markdown note or interactive checklist; rendered in a floating dialog via TextProxyActivity (blue #0080FF accent, Edit / Copy / Share header icons); checklist state persists on-device (SharedPreferences + WebView); footer has Reset (left) and Done (right) for checklists, Done only for notes; reordering checklist items in the editor clears saved check state on save

**Section "Native Android Layer"** — update the `ShortcutPlugin.java` row to mention `clearChecklistState`:

Current:
> ShortcutPlugin.java: Home screen shortcut creation; routes app.onetap.OPEN_TEXT to TextProxyActivity

New:
> ShortcutPlugin.java: Home screen shortcut creation; routes app.onetap.OPEN_TEXT to TextProxyActivity; clearChecklistState clears SharedPreferences("checklist_state") prefix for a shortcut when item order changes

**Section "Key Files → Native Bridge"** — add `TextEditorStep.tsx` reference:

Add line:
> `src/components/TextEditorStep.tsx` — Checklist/note editor with @dnd-kit drag-to-reorder; emits orderChanged flag on confirm

---

#### `ARCHITECTURE.md`

**Section 3 — TextProxyActivity row in the proxy table:**

Current:
> TextProxyActivity | app.onetap.OPEN_TEXT | Renders markdown or checklist text shortcuts in a full-screen WebView

New:
> TextProxyActivity | app.onetap.OPEN_TEXT | Renders markdown or checklist text in a floating premium dialog. Header: Edit (blue tint), Copy, Share icons. Footer: checklist mode has Reset (left, blue) + Done (right, muted) split by a vertical divider; note mode has Done only. Accent colour: #0080FF (app primary blue).

**Section 3 — Checklist state persistence note** (just below the intent contract block):

Current:
> **Checklist state persistence:** Checkbox state is stored in two places simultaneously:
> - WebView `localStorage` — keyed as `chk_<shortcut_id>_<line_index>`, survives soft closes
> - Android `SharedPreferences` (`checklist_state`) — backup via the `ChecklistBridge` JS interface

Add new paragraph after this:
> **Checklist state clearing (reorder):** State keys are index-based (`chk_{id}_{lineIndex}`). If the user reorders checklist items in `TextEditorStep`, saved states for old indices would map to the wrong items. When a reorder is saved, `ShortcutPlugin.clearChecklistState({ id })` clears all keys with the prefix `chk_{id}_` from `SharedPreferences("checklist_state")`. The same clearing is performed by the native Reset button in the viewer footer.

**Section 3 — TextProxyActivity class row in the "Key classes" table:**

Current:
> (no row for TextProxyActivity)

Add a row:
> TextProxyActivity | Renders text shortcuts (Markdown or checklist) in a floating dialog; blue #0080FF accent; footer has Reset + Done (checklist) or Done (note)

**Section 13 — Intent table — `OPEN_TEXT` row:**

Current:
> app.onetap.OPEN_TEXT | TextProxyActivity — passes text_content (String) and is_checklist (boolean) as intent extras

New (add `shortcut_name` extra which is now used):
> app.onetap.OPEN_TEXT | TextProxyActivity — passes shortcut_name (String, dialog title), text_content (String), and is_checklist (boolean) as intent extras

---

#### `SUPABASE.md`

**Section 4 → `cloud_shortcuts` — note on `text_content` and checklist state:**

Current note at the bottom of the table:
> Note on text_content: ... Checklist checkbox state is not synced — it is stored locally (WebView localStorage + Android SharedPreferences) and is considered per-device interaction state.

Extend the note to mention the clearing behaviour:
> Note on text_content: ... Checklist checkbox state is not synced — it is stored locally (WebView localStorage + Android SharedPreferences, keyed as chk_{shortcutId}_{lineIndex}) and is considered per-device interaction state. When the user reorders checklist items and saves, ShortcutPlugin.clearChecklistState clears the stale index-keyed state from SharedPreferences so the viewer starts fresh with the correct item order.

---

#### `PRODUCT_IDEOLOGY.md`

**Section 6 — Offline-First table — text shortcuts row:**

Current:
> Text shortcuts | ✅ Yes | Rendered locally in a WebView; checklist state stored on-device (localStorage + SharedPreferences)

New:
> Text shortcuts | ✅ Yes | Rendered locally in a floating native dialog (TextProxyActivity); checklist state stored on-device (SharedPreferences + WebView localStorage, keyed by line index); state cleared automatically when item order is changed and saved in the editor

---

### Technical Summary

All changes are documentation-only (`.md` files). No source code is modified. The changes accurately reflect:

1. `COLOR_ACCENT = #0080FF` in `TextProxyActivity.java` (previously `#6366f1`)
2. Header now has only Edit (blue tint), Copy (muted), Share (muted) — no Reset icon
3. Footer layout: checklist → `[Reset (blue)] | [Done (muted)]`; note → `[Done (muted)]`
4. `ShortcutPlugin.clearChecklistState({ id })` — new Capacitor method that clears all `chk_{id}_*` keys from `SharedPreferences("checklist_state")`
5. `TextEditorStep` uses `@dnd-kit/sortable` drag handles on checklist items with `PointerSensor` + `TouchSensor`, emits `orderChanged: boolean` in `onConfirm`
6. `ShortcutEditSheet` calls `clearChecklistState` on save when `checklistOrderChangedRef.current` is true
7. State key contract `chk_{shortcutId}_{lineIndex}` is index-based — reordering without clearing produces wrong results, hence the mandatory state clear
