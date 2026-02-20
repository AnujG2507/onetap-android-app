
## Documentation Update Plan

### What Changed Since the Docs Were Last Accurate

Since the documentation was authored, the following features have been fully implemented and merged but are not yet reflected anywhere in the docs:

1. **Text shortcut type** — a new 7th tile in `ContentSourcePicker` (alongside Photo, Video, Audio, Document, Contact, Link). Supports two modes: Note (Markdown) and Checklist.
2. **`TextEditorStep` component** — full-screen inline editor with Markdown toolbar (Bold, Italic, H1, H2, Divider), Checklist mode with add/remove items, name field, icon picker.
3. **`TextProxyActivity.java`** — new native Android Activity that renders text shortcuts. Uses an embedded WebView, loads `marked.js` for Markdown rendering, and persists checklist checkbox state in both `localStorage` (WebView) and `SharedPreferences` (Android backup).
4. **`ShortcutPlugin.java` update** — handles the new `app.onetap.OPEN_TEXT` intent action; routes home-screen taps to `TextProxyActivity` with `text_content` and `is_checklist` extras.
5. **`cloud_shortcuts` schema extension** — two new nullable columns: `text_content TEXT` and `is_checklist BOOLEAN DEFAULT false`.
6. **Content picker layout restructure** — the grid is now explicitly 4+3 (portrait) using `grid-cols-4` / `grid-cols-3` sub-rows, dissolving to `landscape:grid-cols-7` in landscape via `display:contents`.
7. **Type system expansion** — `ShortcutType` now includes `'text'`; `ScheduledActionDestinationType` includes `'text'`; new `TextDestination` interface; new fields `textContent?: string` and `isChecklist?: boolean` on `ShortcutData`.

---

### Files to Update

**1. `APP_SUMMARY.md`**

- Section "Core Features → 1. One Tap Access" — add `'text'` as a supported shortcut type.
- Section "Data Model → Cloud Schema" — add `text_content` and `is_checklist` columns to the `cloud_shortcuts` block.
- Section "Technical Architecture → Native Android Layer" — add `TextProxyActivity.java` to the list of key classes.

**2. `ARCHITECTURE.md`**

- Section 3 "Native Android Layer" — add `TextProxyActivity` to the Proxy Activities table with the description "Renders markdown or checklist text shortcuts in a full-screen WebView".
- Section 5 "How Data Flows → Data Ownership" — note `text_content` and `is_checklist` as synced fields on `cloud_shortcuts`.
- Section 5 "Dormant Access Points" — add a note that `text` type shortcuts are **never dormant** (self-contained, no local file dependency), citing `isFileDependentType()`.
- Section 9 "Navigation Structure" — no tab change, but note the `TextEditorStep` inline sub-flow triggered from the Access tab.
- Section 10 "Project Structure" — `TextEditorStep.tsx` already lives in `src/components/`, no structural change needed; just clarify it in the key components list if helpful.
- Section 13 "Home Screen ↔ App Sync Contract" — `OPEN_TEXT` intent is now a recognized intent action in `ShortcutPlugin.java`; mention it alongside the existing proxy routing.

**3. `SUPABASE.md`**

- Section 4 "Database Tables — `cloud_shortcuts`" — add two rows to the column table:
  - `text_content | TEXT | Raw markdown or checklist text for text shortcuts | No`
  - `is_checklist | BOOLEAN | Whether text is rendered as interactive checklist (default: false) | No (default: false)`
- Section 4, Privacy Boundaries table — note that `text_content` **is** synced (unlike binary data) because it is self-contained text.

**4. `ARCHITECTURE.md` Section 5 — Intent Action Table** (inline in the proxy section)

Add `TextProxyActivity` row: intent `app.onetap.OPEN_TEXT`, extras `text_content` (String), `is_checklist` (boolean), `shortcut_id` (String for usage tracking + checklist state key).

**5. `RELEASE_PROCESS.md` — Pre-Release Checklist**

- Section 4 "Testing on Physical Android Device" — add two checklist items:
  - `[ ] Text note shortcuts render markdown correctly`
  - `[ ] Text checklist shortcuts toggle checkboxes and persist state`

**6. `PRODUCT_IDEOLOGY.md`**

- Section 6 "Offline-First" table — add a row:
  - `Text shortcuts | ✅ Yes | Rendered locally in WebView; checklist state stored on device`
- No ideology changes are needed — text shortcuts are fully local-first, offline-capable, and self-contained.

---

### Technical Details to Capture

**Text shortcut intent contract (for ARCHITECTURE.md Section 3):**

```text
Intent action:  app.onetap.OPEN_TEXT
Activity:       TextProxyActivity
Extras:
  shortcut_id   String   — usage tracking + checklist state key
  text_content  String   — raw markdown or checklist source text (max 2000 chars)
  is_checklist  Boolean  — true → render as interactive checklist; false → render as Markdown
```

**Checklist state persistence model (for ARCHITECTURE.md):**

Checkbox state is stored in two places simultaneously:
- **WebView localStorage** — keyed as `chk_<shortcut_id>_<line_index>`, survives soft closes
- **Android SharedPreferences** (`checklist_state`) — backup via the `ChecklistBridge` JS interface, survives WebView cache clears

**Grid layout change note (minor, no doc needed in .md files):**

The `ContentSourcePicker` layout refactor is a pure CSS change (4+3 portrait rows via `display:contents` trick). No user-facing behavior changed; no documentation update required beyond the already-accurate component list.

**`isFileDependentType` guard:**

`src/types/shortcut.ts` already documents: `// text is self-contained (inline), never dormant`. This should be echoed in ARCHITECTURE.md's "Dormant Access Points" section for clarity.

---

### Implementation Order

1. Update `APP_SUMMARY.md` (smallest, highest-level)
2. Update `SUPABASE.md` Section 4 (database schema accuracy)
3. Update `ARCHITECTURE.md` Sections 3, 5, 13 (technical reference)
4. Update `RELEASE_PROCESS.md` Section 4 (pre-release checklist)
5. Update `PRODUCT_IDEOLOGY.md` Section 6 (offline-first table)

---

### What Is NOT Changing

- `DEPLOYMENT.md` — build pipeline is unchanged; no new edge functions; no new secrets.
- `ANDROID_SETUP.md` — no new SDK or tool dependencies.
- `PRODUCT_IDEOLOGY.md` core principles — text shortcuts are fully consistent with all existing ideology.
- `SUPABASE.md` Sections 5–10 — RLS, OAuth, edge functions, and migration process are unchanged.
- `RELEASE_PROCESS.md` Sections 1–3, 5–11 — branching and versioning process unchanged.
