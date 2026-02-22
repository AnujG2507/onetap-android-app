

## Fix Scroll in WhatsApp Shortcut Customizer

### Problem

When 2-3 quick messages are added, the content area grows taller than the screen. Although `overflow-y-auto` is set on the scrollable div (line 183), the parent uses `flex-1 flex flex-col` without `overflow-hidden`, so the content expands the parent instead of triggering scroll.

### Fix

**File: `src/components/ContactShortcutCustomizer.tsx`**

Apply `overflow-hidden` to the root container so the inner `overflow-y-auto` div is properly bounded and scrolls.

**Line 169** -- change:
```
<div className="flex-1 flex flex-col animate-fade-in">
```
to:
```
<div className="flex-1 flex flex-col animate-fade-in overflow-hidden">
```

This follows the project's existing layout-overflow strategy (used in Settings and other full-page views): the outer flex container gets `overflow-hidden` to cap its height, and the inner content div with `overflow-y-auto` becomes the scroll container.

Single line change, no new dependencies.

