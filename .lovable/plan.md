
## Change Chevron Animation to Spring

### Overview
Update the description expand/collapse chevron in `ScheduledActionItem.tsx` to use a spring-based animation instead of the current ease-in-out transition. This will provide a more natural, bouncy feel consistent with other animations in the app.

### Changes

**File: `src/components/ScheduledActionItem.tsx`**

Update the chevron's motion transition (around line 325):

**Current:**
```tsx
<motion.div
  animate={{ rotate: isDescriptionExpanded ? 180 : 0 }}
  transition={{ duration: 0.2, ease: 'easeInOut' }}
>
```

**New:**
```tsx
<motion.div
  animate={{ rotate: isDescriptionExpanded ? 180 : 0 }}
  transition={{ type: "spring", stiffness: 400, damping: 25 }}
>
```

### Why These Values
- `stiffness: 400` - Controls how snappy the animation feels (higher = faster)
- `damping: 25` - Controls how much the spring oscillates (lower = more bounce)

These values match the existing spring animation pattern used in `ScheduledTimingPicker.tsx` for consistent behavior across the app.
