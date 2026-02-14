

## Fix: Phone Number Input Clearing on Manual Entry

### Problem

The `PhoneNumberInput` component has a feedback loop between the user's typing and the `useEffect` that syncs the `value` prop back into local state:

1. User types a digit into the national number field
2. `handleNationalNumberChange` formats and calls `onChange(e164, isValid)` to notify the parent
3. Parent stores the new value, which flows back as the `value` prop
4. The `useEffect` (line 54) reacts to `value` changing, re-parses it, and overwrites `nationalNumber`
5. For short US numbers (+1), parsing/formatting produces unexpected results, clearing the field

This is especially bad for +1 (US/CA) because short partial numbers like "+12" or "+123" may be ambiguous to the parser.

### Solution

Add a ref (`isInternalChange`) to track whether the `value` change originated from the user's own typing. When it did, skip the `useEffect` re-parse so the local `nationalNumber` state remains untouched.

### Changes

**File: `src/components/PhoneNumberInput.tsx`**

1. Add a `useRef` for tracking internal changes:
   ```typescript
   const isInternalChange = useRef(false);
   ```

2. In `handleNationalNumberChange`, set the ref to `true` before calling `onChange`:
   ```typescript
   isInternalChange.current = true;
   onChange(e164 || input, validation === 'valid');
   ```

3. Same in `handleCountryChange` and `handlePaste` -- set `isInternalChange.current = true` before calling `onChange`.

4. In the `useEffect` that watches `value` (line 54-70), skip processing if `isInternalChange` is true:
   ```typescript
   useEffect(() => {
     if (isInternalChange.current) {
       isInternalChange.current = false;
       return;
     }
     // ... existing parsing logic for external value changes (e.g., contact picker)
   }, [value]);
   ```

5. In `handleClear`, also set `isInternalChange.current = true` before calling `onChange`.

This preserves the existing behavior for external value changes (like picking a contact), while preventing the feedback loop during manual typing.

### Technical Detail

The `useEffect` watching `value` is still needed for cases where the parent sets the value externally (e.g., contact picker populates the phone number). The ref simply distinguishes between "value changed because user typed" vs "value changed because parent set it externally".

