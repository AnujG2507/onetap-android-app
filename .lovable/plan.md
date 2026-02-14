

## Fix: "Add to Home Screen" Button Overlapping Android Navigation Bar

The global `.safe-bottom` class was recently changed to only use `env(safe-area-inset-bottom)`, which returns 0 on devices with 3-button navigation. The bottom nav bar looks correct with this, but the shortcut creation screens (which don't show the bottom nav) now have their action buttons sitting too close to the native navigation bar.

### Approach

Add a dedicated CSS utility class `.safe-bottom-action` that enforces a 16px minimum bottom padding, and apply it to the four screens that have bottom action buttons outside the bottom nav:

### Changes

**1. `src/index.css`** -- Add new utility class

Add a `.safe-bottom-action` class with a 16px minimum floor for screens where action buttons sit at the bottom edge without the bottom nav:

```css
.safe-bottom-action {
  padding-bottom: max(env(safe-area-inset-bottom, 0px), 16px);
}
```

**2. `src/components/ShortcutCustomizer.tsx`** (line 354)

Replace `safe-bottom` with `safe-bottom-action` on the button container.

**3. `src/components/ContactShortcutCustomizer.tsx`** (line 183)

Replace `safe-bottom` with `safe-bottom-action` on the scrollable content container.

**4. `src/components/SlideshowCustomizer.tsx`** (line 398)

Replace `safe-bottom` with `safe-bottom-action` on the fixed bottom button container.

**5. `src/components/UrlInput.tsx`** (line 282)

Replace `safe-bottom` with `safe-bottom-action` on the button container.

### What stays the same

The `BottomNav.tsx` continues using the existing `.safe-bottom` class (flush with the edge), which is the behavior you confirmed works well.

