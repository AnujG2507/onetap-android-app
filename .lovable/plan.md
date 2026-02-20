
## Fix: Shortcut Name Not Appearing in TextProxyActivity Header

### Root Cause

The shortcut name is missing from the header because it is not included in the Android home-screen shortcut intent. There are **two places** in `ShortcutPlugin.java` where the `TextProxyActivity` launch intent is built, and both are missing the `shortcut_name` extra:

**Place 1 — `createPinnedShortcut()` (~line 319–322)**
This is the intent stored inside the Android `ShortcutInfo` object that gets pinned to the home screen. When the user taps the shortcut from their home screen, Android replays this exact intent — and since `shortcut_name` was never added to it, `TextProxyActivity` receives a `null` name.

```java
// Current (missing shortcut_name):
textIntent.putExtra("shortcut_id", id);
if (finalTextContent != null) textIntent.putExtra("text_content", finalTextContent);
textIntent.putExtra("is_checklist", finalIsChecklist);
// ← shortcut_name is never added here
```

**Place 2 — `buildIntentForUpdate()` (~line 4896–4907)**
This is the intent rebuilt when a shortcut is edited/updated. It also omits `shortcut_name`, so after editing a text shortcut, the name would still be missing.

```java
// Current (missing shortcut_name):
intent.putExtra("shortcut_id", shortcutId);
if (textContent != null) intent.putExtra("text_content", textContent);
intent.putExtra("is_checklist", isChecklist != null && isChecklist);
// ← shortcut_name is never added here
```

**Why in-app tap works:** The `openTextShortcut()` plugin method (called when tapping from within the app) correctly adds `name` → `shortcut_name` at line 4249. Only the home-screen launch and update paths are broken.

### Fix — One File, Two Lines Added

**File:** `native/android/app/src/main/java/app/onetap/access/plugins/ShortcutPlugin.java`

**Change 1** — Add `shortcut_name` to the home-screen shortcut intent in `createPinnedShortcut()`:

```java
textIntent.putExtra("shortcut_id", id);
if (finalTextContent != null) textIntent.putExtra("text_content", finalTextContent);
textIntent.putExtra("is_checklist", finalIsChecklist);
textIntent.putExtra("shortcut_name", finalLabel);   // ← ADD THIS LINE
```

The variable `finalLabel` (the `final` captured copy of `label`) is already in scope at this point — `label` is read from the call at line 244 and captured as `finalLabel` at line 296.

**Change 2** — Add `shortcut_name` to the update intent in `buildIntentForUpdate()`:

```java
intent.putExtra("shortcut_id", shortcutId);
if (textContent != null) intent.putExtra("text_content", textContent);
intent.putExtra("is_checklist", isChecklist != null && isChecklist);
intent.putExtra("shortcut_name", label != null ? label : "");   // ← ADD THIS LINE
```

The variable `label` is already a parameter of `buildIntentForUpdate()` — it is passed in at the call site (line 4695).

### What Does Not Change

- `TextProxyActivity.java` — already reads `shortcut_name` correctly on line 82; no changes needed
- `openTextShortcut()` plugin method — already passes the name correctly; no changes needed
- All other shortcut types (file, link, WhatsApp, etc.) — untouched
- No JS/TS files, no manifests, no drawables — this is a pure Java fix
