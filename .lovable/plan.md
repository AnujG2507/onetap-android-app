

# Inline Picker Buttons Redesign

## Overview

This plan updates the inline action picker buttons (One Tap Access / One Tap Reminder) on the Access tab to:
1. Change "Reminder" to "One Tap Reminder"
2. Redesign the layout to show description text to the right of icons
3. Improve the overall visual appearance

## Changes

### 1. Translation Update (`src/i18n/locales/en.json`)

**Line 113:**
- `reminder`: "Reminder" → "One Tap Reminder"

### 2. ActionModeButton Redesign (`src/components/ContentSourcePicker.tsx`)

**Current Layout (vertical):**
```text
┌─────────────────────┐
│   [icon] Label      │
│   Description       │
└─────────────────────┘
```

**New Layout (horizontal with description on right):**
```text
┌─────────────────────────────────────┐
│ [icon]  Label                       │
│         Description text here       │
└─────────────────────────────────────┘
```

**Design improvements:**
- Full-width horizontal cards instead of 2-column grid
- Icon on the left in a rounded container
- Label and description stacked on the right
- Enhanced visual styling with gradient backgrounds
- Improved shadow and hover effects
- Better spacing and alignment

### Technical Changes

**ActionModePicker (lines 240-253):**
- Change from `grid-cols-2` to `flex flex-col` for vertical stacking
- Adjust gap spacing

**ContactActionPicker (lines 315-328):**
- Same layout changes as ActionModePicker

**ActionModeButton (lines 341-362):**
- Restructure from vertical flex layout to horizontal
- Icon container on the left
- Text content (label + description) on the right
- Add gradient background and enhanced borders
- Improve hover and active states
- Add chevron indicator for discoverability

## Visual Design

**New ActionModeButton styling:**
- Horizontal flex layout with `items-center`
- Icon container: 40x40px, rounded-xl, gradient background
- Text section: flex-col with label on top, description below
- Full-width button spanning the container
- Subtle gradient: `from-card to-card/90`
- Border: `border-border/60` with `hover:border-primary/30`
- Shadow: `shadow-sm` default, `shadow-md` on hover
- Add right chevron icon to indicate action

## Files to Modify

| File | Changes |
|------|---------|
| `src/i18n/locales/en.json` | Update "Reminder" → "One Tap Reminder" |
| `src/components/ContentSourcePicker.tsx` | Redesign ActionModeButton layout and styling, update grid layout in pickers |

## Expected Result

The inline picker will display two stacked full-width buttons:
1. **One Tap Access** - "Add to home screen" (with Home icon)
2. **One Tap Reminder** - "Schedule for later" (with Bell icon)

Each button will have the icon on the left, with the label and description text aligned to the right, creating a cleaner and more scannable layout.

