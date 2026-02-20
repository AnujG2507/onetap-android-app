
## Root Cause: Format Mismatch Between Editor and Native Renderer

### The Problem

The editor and the native viewer speak completely different formats. This is why checkboxes never appear and check/uncheck never works:

**Editor output** (`generateChecklistText` in `TextEditorStep.tsx`):
```
☐ Buy milk
☐ Call the dentist
☐ Submit report
```

**Native renderer regex** (`buildHtml` in `TextProxyActivity.java`):
```javascript
line.match(/^- \[( |x)\] (.*)/i)
```

This regex looks for `- [ ] text` or `- [x] text`. It **never matches** `☐ text`. Every line falls through to the `else if(line.trim()!=='')` branch and is rendered as a plain `<p>` tag — not as a `.ci` checkbox row. No `.ci` divs are ever created, so `onCheck()` is never triggered and no strikethrough can ever appear.

The CSS fixes from the previous change are correct and already in place. The only thing broken is this format mismatch.

---

### The Fix — Two Files

#### File 1: `src/components/TextEditorStep.tsx`

**A. Change `generateChecklistText`** to emit standard markdown format:

```typescript
// Before
function generateChecklistText(items: ChecklistItem[]): string {
  return items.map(item => `☐ ${item.text}`).join('\n');
}

// After
function generateChecklistText(items: ChecklistItem[]): string {
  return items.map(item => `- [ ] ${item.text}`).join('\n');
}
```

All new and edited checklists will now save in `- [ ] text` format, which the native renderer's existing regex matches perfectly.

**B. Update `parseChecklistItems`** to handle both formats — the new `- [ ]` format and the old `☐`/`☑` format (for backward compatibility with any shortcuts that were already saved in the old format):

```typescript
// Before
function parseChecklistItems(text: string): ChecklistItem[] {
  if (!text.trim()) return [];
  return text.split('\n')
    .filter(line => line.trim())
    .map((line, i) => ({
      id: `item-${i}`,
      text: line.replace(/^[☐☑]\s?/, '').trim(),
    }));
}

// After
function parseChecklistItems(text: string): ChecklistItem[] {
  if (!text.trim()) return [];
  return text.split('\n')
    .filter(line => line.trim())
    .map((line, i) => {
      // New standard markdown format: - [ ] text or - [x] text
      const mdMatch = line.match(/^- \[[ xX]\] (.*)/);
      if (mdMatch) return { id: `item-${i}`, text: mdMatch[1].trim() };
      // Legacy Unicode format: ☐ text or ☑ text (backward compat)
      return { id: `item-${i}`, text: line.replace(/^[☐☑]\s?/, '').trim() };
    });
}
```

#### File 2: `native/android/app/src/main/java/app/onetap/access/TextProxyActivity.java`

The native renderer's existing regex `^- \[( |x)\] (.*)` already matches the new format. **No change needed** to the Java file for the core fix.

However, for backward compatibility with any shortcuts saved in the old `☐`/`☑` format before this fix, we should also update the native renderer's regex to match both formats:

```javascript
// Before (only matches markdown format)
var m = line.match(/^- \[( |x)\] (.*)/i);

// After (also matches legacy ☐/☑ format)
var m = line.match(/^- \[( |x)\] (.*)/i) || line.match(/^([☐☑]) (.*)/);
if (m) {
  var checked = ...
  // For the old format, m[1] is '☑' or '☐' (not ' ' or 'x')
  // Handle both: m[1].toLowerCase() === 'x' OR m[1] === '☑'
}
```

This requires refactoring the renderer JS slightly to handle the two regex shapes. The cleaner approach is to normalise in a small helper before matching:

Update the `renderChecklist` JS function in `buildHtml()` so the line-matching handles both old and new formats:

```java
+ "  lines.forEach(function(line,i){"
+ "    var m=line.match(/^- \\[( |x)\\] (.*)/i);"
+ "    var isChecked=false,itemText=null;"
+ "    if(m){isChecked=m[1].toLowerCase()==='x';itemText=m[2];}"
+ "    else{var m2=line.match(/^([☐☑]) (.*)/);if(m2){isChecked=m2[1]==='☑';itemText=m2[2];}}"
+ "    if(itemText!==null){"
// ... rest of row rendering using isChecked and itemText
```

---

### Summary

| What | Before | After |
|---|---|---|
| Editor saves format | `☐ item text` | `- [ ] item text` |
| Parser reads format | `☐` and `☑` only | Both `- [ ]` and `☐`/`☑` (backward compat) |
| Native renderer matches | `- [ ] text` only | Both `- [ ]` and `☐`/`☑` (backward compat) |
| Check/uncheck in viewer | Never works (wrong format) | Works |
| Strikethrough | Never appears | Appears on checked items |
| Existing saved shortcuts | Broken (old format) | Still work (backward compat parser) |

### Files Changed
- `src/components/TextEditorStep.tsx` — `generateChecklistText` and `parseChecklistItems`
- `native/android/app/src/main/java/app/onetap/access/TextProxyActivity.java` — `renderChecklist` JS inside `buildHtml()`
