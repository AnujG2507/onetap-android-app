
# Fix: Platform Icon Shortcut Crash on My Shortcuts Page

## Problem Identified

The "My Shortcuts" page crashes when shortcuts with platform icons exist because of a **dynamic `require()` call inside a React component's render function**.

### The Bug Location

**File:** `src/components/MyShortcutsContent.tsx`, lines 94-106

```typescript
if (icon.type === 'platform') {
  // ❌ BUG: Using require() inside render function
  const { getPlatformColor } = require('@/lib/platformColors');
  const colorInfo = getPlatformColor(icon.value);
  return (
    <div 
      className="h-12 w-12 rounded-xl flex items-center justify-center text-lg"
      style={{ backgroundColor: colorInfo.bgColor, color: colorInfo.textColor }}
    >
      {colorInfo.letter}
    </div>
  );
}
```

### Why It Crashes

1. Vite uses ES Modules (ESM), not CommonJS
2. Dynamic `require()` inside React render functions is unsupported in ESM environments
3. When a shortcut has `icon.type === 'platform'`, this code executes and throws a runtime error
4. The ErrorBoundary catches it and displays the "Refresh App" error page
5. Deleting the shortcut from home screen → sync removes it from localStorage → no crash

---

## Solution

Replace the dynamic `require()` with a proper ES Module `import` statement at the top of the file.

### Change Required

**File:** `src/components/MyShortcutsContent.tsx`

**Before (line 94-96):**
```typescript
if (icon.type === 'platform') {
  const { getPlatformColor } = require('@/lib/platformColors');
  const colorInfo = getPlatformColor(icon.value);
```

**After:**
1. Add import at top of file:
```typescript
import { getPlatformColor } from '@/lib/platformColors';
```

2. Simplify the platform icon handling:
```typescript
if (icon.type === 'platform') {
  const colorInfo = getPlatformColor(icon.value);
```

---

## Additional Enhancement

While fixing this, I'll also add proper handling for the `favicon` icon type in the `ShortcutIcon` component, which was added but not rendered:

```typescript
if (icon.type === 'favicon') {
  return (
    <div className="h-12 w-12 rounded-xl bg-blue-500 flex items-center justify-center overflow-hidden">
      <img 
        src={icon.value} 
        alt="" 
        className="h-6 w-6 object-contain"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
    </div>
  );
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/MyShortcutsContent.tsx` | Add proper import for `getPlatformColor`, remove dynamic `require()`, add favicon icon handling |

---

## Summary

| Issue | Before | After |
|-------|--------|-------|
| Platform icon shortcuts | App crashes with "Refresh App" error | Works correctly |
| Import method | Dynamic `require()` (breaks in ESM) | Static ES Module `import` |
| Favicon icon type | Not rendered | Properly rendered with blue background |
