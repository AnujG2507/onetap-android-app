
## Drag-to-Reorder Checklist Items in Editor + State Reset Warning

### What This Feature Does

When a user opens a checklist shortcut for editing, they will be able to drag items to reorder them. As soon as any drag reorder occurs, a toast notification warns them that saving the new order will reset all check states on that checklist. When they save, if the item order has changed, the native `SharedPreferences` checklist state is automatically cleared so stale index-based keys don't corrupt the viewer.

The text viewer (`TextProxyActivity`) is read-only — no reorder UI is added there.

---

### Analysis of Current Code

**No reorder exists today:** `TextEditorStep.tsx` renders checklist items as a plain vertical list with `+` Add and `×` Remove buttons. There is no drag mechanism.

**State key contract:** Keys are `chk_{shortcutId}_{lineIndex}`. Moving item at index 0 to index 2 would cause the viewer to apply the wrong checked state to the wrong item unless the state is cleared on save.

**dnd-kit is already installed:** `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` are all in `package.json`. The exact same pattern used in `SlideshowPhotosEditor.tsx` can be applied to checklist items.

**Cross-layer clearing path:**
- The viewer clears state via `SharedPreferences` in `TextProxyActivity.java`
- The editor (React) needs to trigger the same clear via a new `ShortcutPlugin` Capacitor method
- Pattern: add `clearChecklistState({ id })` to Java plugin → TypeScript interface → web fallback → call from `ShortcutEditSheet` on save

**Edit flow:**
`TextProxyActivity` Edit button → stores pending_edit_shortcut_id → `ShortcutEditSheet` opens → "Edit" button in text section → `showTextEditor = true` → `TextEditorStep` overlays as inline screen → `onConfirm` returns `{ textContent, isChecklist }` back to sheet → `handleSave` calls `updateShortcut`

---

### Files Changed

| File | What Changes |
|---|---|
| `src/components/TextEditorStep.tsx` | Add `@dnd-kit` drag-to-reorder to checklist items; detect order changes and show toast warning |
| `src/components/ShortcutEditSheet.tsx` | On save, if checklist item order changed, call `ShortcutPlugin.clearChecklistState` before saving |
| `src/plugins/ShortcutPlugin.ts` | Add `clearChecklistState` to TypeScript interface |
| `src/plugins/shortcutPluginWeb.ts` | Add web no-op fallback for `clearChecklistState` |
| `native/android/app/src/main/java/app/onetap/access/plugins/ShortcutPlugin.java` | Add `@PluginMethod clearChecklistState` — reads SharedPreferences("checklist_state"), deletes all keys with prefix `chk_{id}_` |
| `src/i18n/locales/en.json` | Add `textEditor.reorderWarning` translation string |

---

### Detailed Technical Plan

#### 1. `TextEditorStep.tsx` — Drag-to-Reorder

Add drag handles to each checklist row using `@dnd-kit/sortable`. The pattern is identical to `SlideshowPhotosEditor.tsx`:

```tsx
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
```

Each checklist item becomes a `SortableChecklistItem` component:

```tsx
function SortableChecklistItem({ item, index, onUpdate, onRemove, onKeyDown, canRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className={cn("flex items-center gap-2", isDragging && "opacity-50")}>
      <button {...attributes} {...listeners} className="p-1.5 text-muted-foreground cursor-grab active:cursor-grabbing touch-none">
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-muted-foreground shrink-0 text-base">☐</span>
      <Input value={item.text} onChange={e => onUpdate(item.id, e.target.value)} ... />
      <button onClick={() => onRemove(item.id)} disabled={!canRemove} ...><X /></button>
    </div>
  );
}
```

The drag end handler uses `arrayMove` from `@dnd-kit/sortable`:

```tsx
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (over && active.id !== over.id) {
    setChecklistItems(prev => {
      const oldIndex = prev.findIndex(i => i.id === active.id);
      const newIndex = prev.findIndex(i => i.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      // Mark that order has changed — triggers warning toast
      setOrderChanged(true);
      return reordered;
    });
  }
};
```

**Order-change detection:**

A new state variable `orderChanged: boolean` is added to `TextEditorStep`. It is set to `true` inside `handleDragEnd` the first time a drag reorder occurs. The parent (`ShortcutEditSheet`) receives this flag via `onConfirm`:

```tsx
onConfirm: (data: {
  textContent: string;
  isChecklist: boolean;
  name: string;
  icon: ShortcutIcon;
  orderChanged: boolean;  // NEW
}) => void;
```

**Toast warning in `TextEditorStep`:**

The warning fires once per drag event (not per render) using a ref guard:

```tsx
const orderWarnedRef = useRef(false);

// Inside handleDragEnd, after setChecklistItems:
if (!orderWarnedRef.current) {
  orderWarnedRef.current = true;
  toast('Reordering will reset checklist check states when saved', {
    description: 'All checked items will be cleared on save',
    duration: 4000,
  });
}
```

`sonner` is already imported in the project (`import { toast } from 'sonner'`).

---

#### 2. `ShortcutEditSheet.tsx` — Clear State on Save if Order Changed

The `onConfirm` handler in the `TextEditorStep` overlay now receives `orderChanged`. Store it in a local ref:

```tsx
const checklistOrderChangedRef = useRef(false);

// In the TextEditorStep onConfirm handler:
onConfirm={(data) => {
  setTextContent(data.textContent);
  setIsChecklist(data.isChecklist);
  if (data.orderChanged) checklistOrderChangedRef.current = true;
  setShowTextEditor(false);
}}
```

In `handleSave`, after `onSave` resolves but before `onClose`:

```tsx
// Clear native checklist state if item order was changed
if (shortcut.type === 'text' && checklistOrderChangedRef.current && Capacitor.isNativePlatform()) {
  try {
    await ShortcutPlugin.clearChecklistState({ id: shortcut.id });
    console.log('[ShortcutEditSheet] Cleared checklist state after reorder');
  } catch (e) {
    console.warn('[ShortcutEditSheet] Failed to clear checklist state:', e);
  }
  checklistOrderChangedRef.current = false;
}
```

Also reset the ref when the sheet closes/opens:

```tsx
// Inside useEffect that runs when shortcut changes:
checklistOrderChangedRef.current = false;
```

---

#### 3. `ShortcutPlugin.ts` — New Interface Method

```typescript
// Clear local checklist check state for a shortcut (SharedPreferences).
// Called when checklist item order changes to prevent stale index-keyed state.
clearChecklistState(options: { id: string }): Promise<{ success: boolean; error?: string }>;
```

---

#### 4. `shortcutPluginWeb.ts` — Web No-Op Fallback

```typescript
async clearChecklistState(options: { id: string }): Promise<{ success: boolean; error?: string }> {
  console.log('[ShortcutPluginWeb] clearChecklistState called (web fallback)', options.id);
  // On web, checklist state is stored in localStorage — clear the prefix
  const prefix = `chk_${options.id}_`;
  Object.keys(localStorage)
    .filter(k => k.startsWith(prefix))
    .forEach(k => localStorage.removeItem(k));
  return { success: true };
}
```

---

#### 5. `ShortcutPlugin.java` — New @PluginMethod

Added immediately after `openTextShortcut`:

```java
/**
 * Clears all local checklist check states for a given shortcut.
 * Called by JS layer when the user reorders checklist items during editing,
 * since state keys are index-based and reordering invalidates them.
 * SharedPreferences("checklist_state") is NOT synced to cloud.
 */
@PluginMethod
public void clearChecklistState(PluginCall call) {
    String shortcutId = call.getString("id");
    if (shortcutId == null || shortcutId.isEmpty()) {
        JSObject result = new JSObject();
        result.put("success", false);
        result.put("error", "Missing shortcut id");
        call.resolve(result);
        return;
    }
    try {
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences("checklist_state", Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        String prefix = "chk_" + shortcutId + "_";
        for (String key : new java.util.HashSet<>(prefs.getAll().keySet())) {
            if (key.startsWith(prefix)) editor.remove(key);
        }
        editor.apply();
        android.util.Log.d("ShortcutPlugin", "Cleared checklist state for: " + shortcutId);
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    } catch (Exception e) {
        JSObject result = new JSObject();
        result.put("success", false);
        result.put("error", e.getMessage());
        call.resolve(result);
    }
}
```

---

#### 6. `en.json` — Translation String

```json
"textEditor": {
  ...existing keys...
  "reorderWarning": "Reordering items will reset all checked states when saved"
}
```

Used in `TextEditorStep` via `t('textEditor.reorderWarning')` as the toast message.

---

### What Does NOT Change

- `TextProxyActivity.java` — no drag UI added to the viewer; it remains read-only
- The `SharedPreferences` key contract — `chk_{shortcutId}_{lineIndex}` — unchanged
- The Reset button in the viewer footer — unchanged
- Cloud sync — `SharedPreferences("checklist_state")` is never read by Supabase/cloudSync
- All other shortcut types — no changes outside `type === 'text'` code paths

---

### User Experience Flow

```text
User edits a checklist shortcut
  → Taps "Edit" in ShortcutEditSheet → TextEditorStep overlay opens
  → Drags item to new position
  → Toast appears: "Reordering items will reset all checked states when saved"
  → User continues editing (or not)
  → User taps Continue → returns to ShortcutEditSheet with orderChanged=true
  → User taps Save
  → clearChecklistState called on native → SharedPreferences cleared for this shortcut
  → updateShortcut saves new textContent with new item order
  → Next time user opens the checklist → fresh state, all unchecked, items in new order ✓
```
