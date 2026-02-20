
# Add Text Destination Option to Scheduled Action Editor

## Problem

The "Change Destination" screen in `ScheduledActionEditor.tsx` (used when editing an existing scheduled action) shows 4 options: File, Link, Contact, and WhatsApp Message. The **Text** option is completely absent, even though:

- The `ScheduledActionCreator.tsx` (for creating new actions) already has a full Text sub-flow using `TextEditorStep`.
- The `ScheduledActionDestination` type fully supports `text`.
- All display helpers (`getDestinationIcon`, `getDestinationLabel`, `getDestinationTypeLabel`) in the Editor already handle `type: 'text'` correctly.

The Editor simply never wired up the Text option in the destination picker UI, nor imported the `TextEditorStep` component or managed text sub-step state.

## Changes Required

### `src/components/ScheduledActionEditor.tsx`

**1. Add text sub-step state**

Add a `TextSubStep` type and state variable, mirroring the pattern from `ScheduledActionCreator.tsx`:

```ts
type TextSubStep = 'editor' | null;
const [textSubStep, setTextSubStep] = useState<TextSubStep>(null);
const [textContent, setTextContent] = useState('');
const [textIsChecklist, setTextIsChecklist] = useState(false);
```

Pre-populate these when the editor opens — if the current `action.destination.type === 'text'`, seed `textContent` and `textIsChecklist` from it so the editor reopens with the existing content.

**2. Import `TextEditorStep` and the `AlignLeft` icon**

```ts
import { TextEditorStep } from '@/components/TextEditorStep';
import { ..., AlignLeft } from 'lucide-react';
```

**3. Update the `shouldInterceptBack` and `internalHandleBack` logic**

Include `textSubStep !== null` in `shouldInterceptBack`, and add a branch in `internalHandleBack` to clear text sub-step state on back:

```ts
const shouldInterceptBack =
  urlSubStep !== null ||
  textSubStep !== null ||   // ← add
  step !== 'main';

const internalHandleBack = useCallback(() => {
  if (urlSubStep) { ... }
  if (textSubStep) {         // ← add
    setTextSubStep(null);
    return;
  }
  if (step !== 'main') setStep('main');
}, [urlSubStep, textSubStep, step]);
```

**4. Render the `TextEditorStep` when `step === 'destination'` and `textSubStep === 'editor'`**

Before the main destination picker renders (at the top of the `step === 'destination'` block), add:

```tsx
if (textSubStep === 'editor') {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="bottom" className="h-[85vh] landscape:h-[95vh] rounded-t-3xl px-0 pb-0">
        <TextEditorStep
          showIconPicker={false}
          isReminder={true}
          initialText={textContent}
          initialIsChecklist={textIsChecklist}
          initialName={name}
          onBack={() => setTextSubStep(null)}
          onConfirm={(data) => {
            const dest: ScheduledActionDestination = {
              type: 'text',
              text: data.textContent,
              name: data.name || data.textContent.split('\n')[0].replace(/^[☐☑]\s*/, '').trim().slice(0, 40) || 'Text',
              isChecklist: data.isChecklist,
            };
            handleDestinationSelect(dest);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
```

**5. Add the Text option to the destination picker grid**

In the main destination selection `<div>` (currently a 4-item `landscape:grid-cols-3` grid), add a 5th `DestinationOption` for Text. Also update the landscape grid to `landscape:grid-cols-3` (keep as-is, wrapping naturally to two rows), or change to `landscape:grid-cols-2` to keep things tidy with 5 items:

```tsx
<DestinationOption
  icon={<AlignLeft className="h-5 w-5" />}
  label={t('scheduledActions.textTitle')}
  description={t('scheduledEditor.textDesc')}
  onClick={() => {
    // Seed from existing destination if it's already text
    if (destination.type === 'text') {
      setTextContent(destination.text);
      setTextIsChecklist(destination.isChecklist ?? false);
    } else {
      setTextContent('');
      setTextIsChecklist(false);
    }
    setTextSubStep('editor');
  }}
/>
```

**6. Add the missing translation key**

Add `"textDesc"` to `scheduledEditor` in `src/i18n/locales/en.json`:

```json
"textDesc": "Note or Checklist"
```

**7. Reset text state in `resetState()`**

```ts
const resetState = useCallback(() => {
  ...
  setTextSubStep(null);
  setTextContent('');
  setTextIsChecklist(false);
}, [action]);
```

## Summary

| File | Change |
|---|---|
| `src/components/ScheduledActionEditor.tsx` | Add text sub-step state, TextEditorStep render branch, Text destination option, back-handler support, resetState cleanup |
| `src/i18n/locales/en.json` | Add `scheduledEditor.textDesc` translation key |

No new dependencies or database changes required.
