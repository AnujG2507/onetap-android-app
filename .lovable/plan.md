

## Grid Icon Behavior for 2-3 Images

### Current Behavior (Problem)

The current implementation always creates a 2x2 grid with 4 tiles. When there are only 2 or 3 images:
- **2 images**: Shows 2 photos + 2 gray placeholder tiles
- **3 images**: Shows 3 photos + 1 gray placeholder tile

This looks unfinished and suggests "incomplete collection" rather than "intentional set."

---

### Proposed Behavior

Adapt the grid layout based on the actual image count to create intentional, complete-looking icons:

| Image Count | Layout | Description |
|-------------|--------|-------------|
| **2 images** | Side-by-side (1x2) | Two images stacked vertically, each taking half the icon height |
| **3 images** | 1 top + 2 bottom | First image spans full width on top, two images split the bottom row |
| **4+ images** | Standard 2x2 grid | Current behavior, first 4 images |

---

### Visual Representation

**2 Images:**
```text
┌─────────────┐
│      A      │
├─────────────┤
│      B      │
└─────────────┘
```

**3 Images:**
```text
┌─────────────┐
│      A      │
├──────┬──────┤
│  B   │  C   │
└──────┴──────┘
```

**4 Images (unchanged):**
```text
┌──────┬──────┐
│  A   │  B   │
├──────┼──────┤
│  C   │  D   │
└──────┴──────┘
```

---

### Technical Changes

**File: `src/lib/slideshowIconGenerator.ts`**

Modify `generateGridIcon` function to:

1. Check `thumbnails.length` to determine layout strategy
2. For 2 images: Use positions that create vertical stack (full width, half height each)
3. For 3 images: First image gets full width top half, images 2-3 split the bottom
4. For 4+ images: Keep current 2x2 behavior
5. Remove the placeholder-filling loop (lines 100-105) since all layouts will be complete

---

### Why This Matters

- **No visual "incompleteness"**: Every icon looks intentional, not unfinished
- **Honest representation**: The icon accurately reflects the content count
- **Maintains identity**: Each slideshow still has a unique, content-based icon
- **Aligns with calm UX**: No cognitive dissonance from seeing "empty slots"

---

### Edge Case: Exactly 2 Images (Minimum)

The app requires a minimum of 2 images for a slideshow. The vertical stack layout ensures this minimum case still produces a visually complete, professional icon rather than a half-empty grid.

