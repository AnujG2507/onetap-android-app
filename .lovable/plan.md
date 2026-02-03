
# Fix Profile Page Overflow Issue

## Problem Analysis

The Profile page content is stretching outside the visible screen area, causing the "Weekly Activity" chart in the Usage Insights section to be cut off.

### Root Cause

In the **signed-out state** of `ProfilePage.tsx`, the layout structure has a conflict:

```tsx
<ScrollArea className="flex-1">
  <div className="flex flex-col pb-20">
    {/* Header */}
    <header className="ps-5 pe-5 pt-header-safe pb-4 ...">
    
    {/* Sign-in section - THIS IS THE PROBLEM */}
    <div id="tutorial-user-card" className="flex-1 flex flex-col items-center justify-center gap-6 ...">
```

The sign-in section uses `flex-1` which tries to expand to fill available space, but since it's inside a `ScrollArea`, this creates a conflict:
1. `ScrollArea` needs content to have a natural height to scroll
2. `flex-1` tries to expand infinitely
3. The content ends up stretching beyond the viewport without proper scrolling

### The Working Pattern

Looking at the **signed-in state** (lines 342-578), the structure is correct:
- No `flex-1` on internal content
- Natural content height flows properly
- `pb-20` provides clearance for the fixed bottom navigation

---

## Solution

Remove `flex-1` from the sign-in section container in the signed-out state. The content should have a natural height and let `ScrollArea` handle the scrolling. Also add horizontal padding (`px-5`) to the UsageInsights wrapper for visual consistency with the header.

### Before (Problematic)
```tsx
<div id="tutorial-user-card" className="flex-1 flex flex-col items-center justify-center gap-6 max-w-sm mx-auto text-center mb-6">
```

### After (Fixed)
```tsx
<div id="tutorial-user-card" className="flex flex-col items-center justify-center gap-6 max-w-sm mx-auto text-center px-5 py-8 mb-6">
```

Key changes:
1. **Remove `flex-1`** - This was causing the content to try to expand infinitely
2. **Add `py-8`** - Provides vertical spacing now that the section isn't trying to center-fill the viewport
3. **Add `px-5`** - Consistent horizontal padding matching the signed-in state
4. **Wrap UsageInsights in a padded div** - For consistent horizontal padding

---

## Implementation Details

### File: `src/components/ProfilePage.tsx`

**Change 1: Fix the sign-in section container (line 273)**

From:
```tsx
<div id="tutorial-user-card" className="flex-1 flex flex-col items-center justify-center gap-6 max-w-sm mx-auto text-center mb-6">
```

To:
```tsx
<div id="tutorial-user-card" className="flex flex-col items-center gap-6 max-w-sm mx-auto text-center px-5 py-8 mb-4">
```

**Change 2: Add padding wrapper for UsageInsights (line 308)**

From:
```tsx
{/* Usage Insights for signed-out users too */}
<UsageInsights />
```

To:
```tsx
{/* Usage Insights for signed-out users too */}
<div className="px-5">
  <UsageInsights />
</div>
```

---

## Visual Result

### Before
- Sign-in card and Usage Insights overflow the screen
- Weekly Activity chart cut off at bottom
- Content not properly scrollable

### After
- All content fits within scrollable area
- Weekly Activity chart fully visible
- Consistent padding matches signed-in state layout
- Proper clearance above bottom navigation (`pb-20`)

---

## Testing Checklist

- Verify signed-out Profile page scrolls properly
- Confirm Usage Insights card with Weekly Activity is fully visible
- Check that bottom navigation doesn't overlap content
- Verify signed-in Profile page is unaffected
- Test in both portrait and landscape orientations
