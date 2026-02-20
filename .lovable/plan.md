
## Fix: Enter Key Navigates to New Checklist Item

### Root Cause

`SortableChecklistItem` is a child component that calls `onAddNext()` when Enter is pressed. `onAddNext` calls `addChecklistItem` in the parent which appends a new `ChecklistItem` to state. However:

1. The parent has no ref to the new item's `<Input>` DOM element — it can't focus it
2. The new item's input doesn't exist in the DOM yet when `addChecklistItem` runs — focus must happen after React re-renders and the new input mounts

### Solution

**Three coordinated changes to `src/components/TextEditorStep.tsx`:**

---

#### Change 1 — Ref map in parent to track each input

Add a `useRef<Map<string, HTMLInputElement>>` that maps item ID → its `<input>` DOM node:

```ts
const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
```

---

#### Change 2 — Pass a ref-setter into `SortableChecklistItem`

Add an `inputRef` prop of type `(el: HTMLInputElement | null) => void` to `SortableChecklistItemProps`. Each item calls this on mount/unmount:

```tsx
<Input
  ref={el => {
    if (el) inputRefs.current.set(item.id, el);
    else inputRefs.current.delete(item.id);
  }}
  ...
/>
```

---

#### Change 3 — After adding a new item, focus its input in the next frame

Change `addChecklistItem` to return the new item's id and schedule a focus call after React commits the new input to the DOM:

```ts
const addChecklistItem = useCallback((focusNewItem = true) => {
  const newId = `item-${Date.now()}`;
  setChecklistItems(prev => [...prev, { id: newId, text: '' }]);
  if (focusNewItem) {
    // Wait for React to render + mount the new input before focusing
    requestAnimationFrame(() => {
      inputRefs.current.get(newId)?.focus();
    });
  }
}, []);
```

---

#### Change 4 — Update the `SortableChecklistItem` interface

Add `inputRef: (el: HTMLInputElement | null) => void` to `SortableChecklistItemProps` and wire it to the `<Input>` element's `ref` prop. The `Input` component from shadcn/ui already forwards refs via `React.forwardRef`, so this works directly.

---

### Files Changed

- `src/components/TextEditorStep.tsx` only

### Before / After

| | Before | After |
|---|---|---|
| Enter key | Appends new item; focus stays on current input | Appends new item; keyboard moves to new item's input |
| Ref tracking | None | `Map<string, HTMLInputElement>` registered on mount/unmount |
| Focus timing | N/A | `requestAnimationFrame` after state commit |
