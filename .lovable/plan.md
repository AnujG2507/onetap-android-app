

## Fix: Settings Page Content Overlapped by App Navigation Bar

### Problem
The settings page content is cut off at the bottom because the scroll area's inner padding only accounts for the system navigation bar (`safe-bottom`) but not the app's own BottomNav bar (3.5rem tall).

### Solution
Change `safe-bottom` to `safe-bottom-with-nav` on the inner content div of the ScrollArea. This adds the BottomNav height (3.5rem in portrait, 2.5rem in landscape) to the bottom padding, ensuring all settings cards are fully visible when scrolled to the bottom.

### Change

**File: `src/components/SettingsPage.tsx`** (line 235)

```
Before: <div className="space-y-4 pb-8 safe-bottom">
After:  <div className="space-y-4 pb-8 safe-bottom-with-nav">
```

One line change, no other files affected.

