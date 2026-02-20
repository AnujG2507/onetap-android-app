
## Summary

The `ShortcutEditSheet` is already fully implemented for text editing — the UI, state, and `onSave` prop type all include `textContent` and `isChecklist`. The only blocking gap is in `useShortcuts.ts` where `updateShortcut`'s `Partial<Pick<...>>` type does not include those two fields, causing a TypeScript type error at the call site. Two secondary gaps also need fixing.

---

## What Needs to Change

### 1. `src/hooks/useShortcuts.ts` — Three changes

**Change A — Add `textContent` and `isChecklist` to the `Partial<Pick<...>>` type (line 389)**

```diff
- updates: Partial<Pick<ShortcutData, 'name' | 'icon' | 'quickMessages' | 'phoneNumber' | 'resumeEnabled' | 'imageUris' | 'imageThumbnails' | 'autoAdvanceInterval' | 'contentUri' | 'syncState' | 'mimeType' | 'fileSize' | 'thumbnailData' | 'originalPath'>>
+ updates: Partial<Pick<ShortcutData, 'name' | 'icon' | 'quickMessages' | 'phoneNumber' | 'resumeEnabled' | 'imageUris' | 'imageThumbnails' | 'autoAdvanceInterval' | 'contentUri' | 'syncState' | 'mimeType' | 'fileSize' | 'thumbnailData' | 'originalPath' | 'textContent' | 'isChecklist'>>
```

**Change B — Add `'text'` to the `shortcutType` cast in the native update call (line 412)**

The `updatePinnedShortcut` call hard-casts `shortcut.type` to exclude `'text'`. This needs to include `'text'` so the TypeScript type is correct:

```diff
- shortcutType: shortcut.type as 'contact' | 'file' | 'link' | 'message' | 'slideshow',
+ shortcutType: shortcut.type as 'contact' | 'file' | 'link' | 'message' | 'slideshow' | 'text',
```

**Change C — Pass `textContent` and `isChecklist` to the native update call**

When updating a text shortcut, the new content must be sent to the native layer so the home screen shortcut's intent extras are rebuilt with the updated text. This is added alongside the existing extras in the native call:

```diff
  const result = await ShortcutPlugin.updatePinnedShortcut({
    id,
    label: shortcut.name,
    iconEmoji: shortcut.icon.type === 'emoji' ? shortcut.icon.value : undefined,
    iconText: shortcut.icon.type === 'text' ? shortcut.icon.value : undefined,
    iconData: shortcut.icon.type === 'thumbnail' ? shortcut.icon.value : undefined,
    shortcutType: shortcut.type as 'contact' | 'file' | 'link' | 'message' | 'slideshow' | 'text',
    phoneNumber: shortcut.phoneNumber,
    quickMessages: shortcut.quickMessages,
    messageApp: shortcut.messageApp,
    resumeEnabled: shortcut.resumeEnabled,
    contentUri: shortcut.contentUri,
    mimeType: shortcut.mimeType,
    contactName: shortcut.contactName || shortcut.name,
+   textContent: shortcut.textContent,
+   isChecklist: shortcut.isChecklist,
  });
```

### 2. `src/plugins/ShortcutPlugin.ts` — Two changes

**Change A — Add `'text'` to the `shortcutType` union (line 308)**

```diff
- shortcutType?: 'file' | 'link' | 'contact' | 'message' | 'slideshow';
+ shortcutType?: 'file' | 'link' | 'contact' | 'message' | 'slideshow' | 'text';
```

**Change B — Add `textContent` and `isChecklist` params to the `updatePinnedShortcut` interface**

```diff
  contactName?: string;
+ textContent?: string;
+ isChecklist?: boolean;
```

---

## What Is Already Correct — Do Not Touch

- `ShortcutEditSheet.tsx` line 31 — `onSave` prop type already includes `textContent` and `isChecklist`. No change needed.
- `ShortcutEditSheet.tsx` lines 146–154 — `handleSave` already builds the updates object with `textContent` and `isChecklist`. No change needed.
- `ShortcutEditSheet.tsx` lines 311–330 — Text editor overlay already works correctly. No change needed.
- `MyShortcutsContent.tsx` line 545 — `handleSaveEdit` delegates to `updateShortcut` via `Parameters<typeof updateShortcut>[1]` — the type will automatically widen once `useShortcuts` is fixed. No change needed.

---

## Native Java Note (Out of Scope — No Change Now)

`buildIntentForUpdate` in `ShortcutPlugin.java` has no `"text".equals(shortcutType)` branch. This means after save, the home screen shortcut will retain its original `text_content` intent extra (the old text). The user would need to re-add the shortcut to home screen to pick up new content.

This is a native build concern, not a TypeScript fix. For now:
- The JS-side fix ensures data is stored correctly in `localStorage` and cloud sync (the source of truth).
- The native intent will be stale until re-add. This is the same existing behaviour as other content changes (e.g. file reconnect → "Re-add to Home Screen" prompt).
- The `ShortcutEditSheet` already shows the "Re-add to Home Screen" button when `hasIconOrNameChanged` — however text content changes don't set `hasIconOrNameChanged`. A minor addition: text content changes should also trigger the re-add button visibility.

**Additional change in `ShortcutEditSheet.tsx`** — update `hasIconOrNameChanged` to also trigger on text content changes so the "Re-add to Home Screen" button appears when text is edited:

```diff
- setHasIconOrNameChanged(nameChanged || iconChanged || imagesChanged);
+ setHasIconOrNameChanged(nameChanged || iconChanged || imagesChanged || textChanged);
```

This ensures users are prompted to re-add when text content changes, updating the intent on the home screen.

---

## Files Changed

1. `src/hooks/useShortcuts.ts` — Add `textContent` and `isChecklist` to the `Partial<Pick>` type; add `'text'` to the type cast; pass the two new fields to `updatePinnedShortcut`.
2. `src/plugins/ShortcutPlugin.ts` — Add `'text'` to the `shortcutType` union; add `textContent` and `isChecklist` params.
3. `src/components/ShortcutEditSheet.tsx` — Set `hasIconOrNameChanged = true` when text content changes so the Re-add button surfaces.
