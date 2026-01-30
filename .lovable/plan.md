
# Plan: Simple, Bulletproof Overflow Fix for ShortcutListItem

## Problem Diagnosis

After reviewing the code, I've identified why the overflow persists:

1. **Tailwind's `truncate` class requires explicit width constraints** - It sets `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` but these only work when the element has a defined width (or is properly constrained by a flex parent with `min-w-0`).

2. **The current layout mixes `block` and `flex` incorrectly** - The title uses `block` inside a flex-col container, which can break width inheritance.

3. **The metadata line combines Type + Target in one span** - When the target (domain) is extremely long (like S3 URLs), the combined text can exceed boundaries.

## Root Cause

The flexbox chain is incomplete. For truncation to work in a flex container:
- Every ancestor from the constrained parent to the text element must have `min-w-0` (to allow shrinking below content size)
- The text element needs `overflow-hidden` AND either a fixed width or `max-width` relative to its container

The current code has:
```tsx
<button className="w-full flex ... overflow-hidden">
  <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
    <span className="font-medium truncate w-full block">  ← Issue: "block" + "truncate" without max-width
      {shortcut.name}
    </span>
    <div className="flex items-center gap-2 mt-0.5 overflow-hidden w-full">
      <span className="text-xs ... truncate flex-1 min-w-0">  ← Issue: flex-1 alone isn't enough
        {typeLabel}{target && ` · ${target}`}
      </span>
```

## Solution: Use Inline Styles with `max-width: 100%` + CSS calc()

The most reliable fix is to add explicit `max-width` constraints using CSS. This is simpler and guaranteed to work.

---

## Implementation

### File: `src/components/ShortcutsList.tsx`

**Replace the entire `ShortcutListItem` component (lines 119-168) with:**

```tsx
function ShortcutListItem({ 
  shortcut, 
  onTap, 
  t 
}: { 
  shortcut: ShortcutData; 
  onTap: (shortcut: ShortcutData) => void;
  t: (key: string) => string;
}) {
  const typeLabel = getShortcutTypeLabel(shortcut, t);
  const target = getShortcutTarget(shortcut);
  const usageCount = shortcut.usageCount || 0;
  
  return (
    <button
      onClick={() => onTap(shortcut)}
      className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card mb-2 hover:bg-muted/50 active:bg-muted transition-colors text-start shadow-sm"
      style={{ maxWidth: '100%', overflow: 'hidden' }}
    >
      {/* Icon - fixed 48px, never shrinks */}
      <div className="shrink-0">
        <ShortcutIcon shortcut={shortcut} />
      </div>
      
      {/* Text content - constrained width via calc */}
      <div 
        className="flex flex-col gap-0.5"
        style={{ 
          flex: '1 1 0%', 
          minWidth: 0, 
          maxWidth: 'calc(100% - 48px - 16px - 24px)', // 100% - icon - chevron - gaps
          overflow: 'hidden' 
        }}
      >
        {/* Title - single line with ellipsis */}
        <span 
          className="font-medium"
          style={{ 
            display: 'block',
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            whiteSpace: 'nowrap',
            maxWidth: '100%'
          }}
        >
          {shortcut.name}
        </span>
        
        {/* Metadata row: Type, Target (truncated), Badge */}
        <div 
          className="flex items-center gap-2"
          style={{ overflow: 'hidden', maxWidth: '100%' }}
        >
          {/* Type label - fixed, never truncates */}
          <span className="text-xs text-muted-foreground shrink-0">
            {typeLabel}
          </span>
          
          {/* Target - truncates if too long */}
          {target && (
            <span 
              className="text-xs text-muted-foreground"
              style={{ 
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap',
                flex: '1 1 0%',
                minWidth: 0
              }}
            >
              · {target}
            </span>
          )}
          
          {/* Usage badge - fixed, never shrinks */}
          <Badge 
            variant="outline" 
            className="shrink-0 text-[10px] px-1.5 py-0 h-5 font-semibold bg-primary/5 border-primary/20 text-primary whitespace-nowrap"
          >
            {usageCount} {usageCount === 1 ? t('shortcuts.tap') : t('shortcuts.taps')}
          </Badge>
        </div>
      </div>
      
      {/* Chevron - fixed, never shrinks */}
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 rtl:rotate-180" />
    </button>
  );
}
```

### Key Changes:

1. **Inline `style` for guaranteed width constraints**
   - The button gets `style={{ maxWidth: '100%', overflow: 'hidden' }}`
   - The text container gets `style={{ flex: '1 1 0%', minWidth: 0, maxWidth: 'calc(100% - 48px - 16px - 24px)', overflow: 'hidden' }}`
   - This explicitly calculates available width minus icon (48px), chevron (16px), and gaps (24px)

2. **Separate Type and Target into individual elements**
   - `typeLabel` is in its own `shrink-0` span (won't truncate)
   - `target` is in a separate span with inline truncation styles
   - This ensures the type is always visible and only the long domain gets truncated

3. **Inline styles for truncation instead of Tailwind `truncate`**
   - Direct CSS: `overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'`
   - This is more explicit and bypasses any Tailwind compilation issues

4. **Badge with `whitespace-nowrap`**
   - Ensures the badge text never wraps

---

## Why This Will Work

1. **CSS calc() provides explicit width** - Instead of relying on flexbox inheritance, we explicitly tell the text container exactly how much space it can use

2. **Inline styles override any conflicting CSS** - They have higher specificity and can't be affected by Tailwind class merging issues

3. **Separated Type + Target** - Type is always visible; only the domain truncates

4. **Guaranteed overflow clipping at multiple levels** - Button, content div, and individual text elements all have overflow: hidden

---

## Files to Change

| File | Changes |
|------|---------|
| `src/components/ShortcutsList.tsx` | Replace `ShortcutListItem` with new implementation using inline styles and separated Type/Target elements |

---

## Testing Checklist

After implementation:
- [ ] Short shortcut names display fully
- [ ] Long shortcut names (50+ chars) truncate with ellipsis
- [ ] Type label (e.g., "Link", "Photo", "WhatsApp") is always fully visible
- [ ] Long domains (S3 URLs) truncate with ellipsis after the type
- [ ] Badge is always visible and never wraps
- [ ] Chevron is always visible
- [ ] No horizontal scroll in portrait mode
- [ ] No horizontal scroll in landscape mode
- [ ] Tapping an item opens the action sheet correctly
