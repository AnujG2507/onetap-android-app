

# Fix Drag-to-Reorder in Slideshow Customizer

## Problem Analysis

The slideshow drag-to-reorder functionality in `SlideshowCustomizer.tsx` and `SlideshowPhotosEditor.tsx` is not working properly. After comparing with the working `BookmarkLibrary.tsx` implementation, I've identified **two critical issues**:

### Issue 1: DndContext Inside ScrollArea

In both slideshow components, the `DndContext` is placed **inside** the `ScrollArea`:

```tsx
// PROBLEMATIC - Current implementation
<ScrollArea className="w-full whitespace-nowrap">
  <DndContext sensors={sensors} ...>
    <SortableContext items={...}>
      <div className="flex gap-3 pb-4">
        {/* items */}
      </div>
    </SortableContext>
  </DndContext>
  <ScrollBar />
</ScrollArea>
```

The Radix ScrollArea creates an intermediate viewport element that **captures touch/pointer events** before they reach the dnd-kit sensors. This prevents drag activation.

**BookmarkLibrary.tsx works because** its DndContext wraps the entire scrollable area at a higher level, not inside ScrollArea's viewport.

### Issue 2: Drag Handle Has No Touch Area Isolation

The drag handle in slideshow components uses `{...attributes}` and `{...listeners}` but:
1. The touch target is very small (12x12 pixels with tiny icon)
2. The parent container's touch events may interfere
3. No `touch-none` class on the handle to prevent scroll interference

---

## Solution

### Approach A: Move DndContext Outside ScrollArea

The cleanest fix is to move `DndContext` outside the `ScrollArea` and use a plain `div` with `overflow-x-auto` for horizontal scrolling:

```tsx
// FIXED - DndContext outside scroll container
<DndContext sensors={sensors} ...>
  <SortableContext items={...}>
    <div 
      className="overflow-x-auto pb-2" 
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="flex gap-3 w-max">
        {/* items */}
      </div>
    </div>
  </SortableContext>
</DndContext>
```

### Approach B: Improve Drag Handle Touch Target

Additionally, we need to:
1. Add `touch-none` class to the drag handle to prevent scroll interference
2. Increase the touch target size for better mobile usability
3. Ensure the handle properly isolates drag events from the parent

---

## Implementation Details

### 1. SlideshowCustomizer.tsx

**Change the reorderable thumbnail strip section (lines 246-273):**

```tsx
{/* Reorderable thumbnail strip */}
<div>
  <label className="text-sm text-muted-foreground mb-2 block">
    {t('slideshow.reorder', 'Drag to reorder')}
  </label>
  <DndContext
    sensors={sensors}
    collisionDetection={closestCenter}
    onDragEnd={handleDragEnd}
  >
    <SortableContext items={files.map(f => f.id)} strategy={horizontalListSortingStrategy}>
      <div 
        className="overflow-x-auto pb-4 -mx-1 px-1"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="flex gap-3 w-max">
          {files.map((file, index) => (
            <SortableImage
              key={file.id}
              id={file.id}
              index={index}
              thumbnail={file.thumbnail}
              onRemove={handleRemoveImage}
            />
          ))}
        </div>
      </div>
    </SortableContext>
  </DndContext>
</div>
```

**Update the SortableImage drag handle (lines 91-98):**

```tsx
{/* Drag handle */}
<div
  {...attributes}
  {...listeners}
  className="absolute bottom-1 left-1 p-1.5 bg-black/60 rounded cursor-grab active:cursor-grabbing touch-none select-none"
>
  <GripVertical className="h-4 w-4 text-white" />
</div>
```

---

### 2. SlideshowPhotosEditor.tsx

Apply the same fixes:

**Change the scroll container (lines 197-219):**

```tsx
<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragEnd={handleDragEnd}
>
  <SortableContext items={images.map(img => img.id)} strategy={horizontalListSortingStrategy}>
    <div 
      className="overflow-x-auto pb-2 -mx-1 px-1"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="flex gap-2 w-max">
        {images.map((image, index) => (
          <SortableImage
            key={image.id}
            id={image.id}
            index={index}
            thumbnail={image.thumbnail}
            onRemove={handleRemoveImage}
            canRemove={canRemove}
          />
        ))}
      </div>
    </div>
  </SortableContext>
</DndContext>
```

**Update SortableImage drag handle (lines 91-98):**

```tsx
{/* Drag handle */}
<div
  {...attributes}
  {...listeners}
  className="absolute bottom-0.5 left-0.5 p-1 bg-black/60 rounded cursor-grab active:cursor-grabbing touch-none select-none"
>
  <GripVertical className="h-3 w-3 text-white" />
</div>
```

---

## Technical Notes

### Why BookmarkLibrary Works

In `BookmarkLibrary.tsx`, the structure is:

```tsx
<ScrollArea className="flex-1">
  <div ref={scrollContainerRef} className="...">
    <DndContext sensors={sensors} ...>
      {/* But actually the DndContext wraps BEFORE the ScrollArea in the 
          full component - the drag happens on the whole list not inside */}
    </DndContext>
  </div>
</ScrollArea>
```

Looking more carefully at BookmarkLibrary (lines 330-345), the sensors include a `TouchSensor` with:
- `delay: 200` - longer delay for activation
- `tolerance: 5` - small movement tolerance

The slideshow uses `delay: 150` which may be too short. We should align:

```tsx
const sensors = useSensors(
  useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  }),
  useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  }),
  useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  })
);
```

### Key CSS Classes

- `touch-none` - Prevents browser default touch handling (essential for drag)
- `select-none` - Prevents text selection during drag
- `cursor-grab` / `active:cursor-grabbing` - Visual feedback
- `w-max` - Ensures flex container doesn't shrink items

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/SlideshowCustomizer.tsx` | Replace ScrollArea with native overflow div, update drag handle styling, adjust sensor delay |
| `src/components/SlideshowPhotosEditor.tsx` | Same changes as above |

---

## Testing Checklist

- [ ] Select 4+ photos and open Slideshow Customizer
- [ ] Touch and hold the grip handle on any thumbnail
- [ ] Drag left/right and verify the image moves with your finger
- [ ] Drop on a new position and verify order updates
- [ ] Verify index badges update correctly after reorder
- [ ] Test horizontal scrolling still works (scroll without touching handles)
- [ ] Test on both portrait and landscape orientations
- [ ] Verify BookmarkLibrary drag-to-reorder still works (regression test)

