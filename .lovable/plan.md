
## Contact Photo Integration Plan

This plan adds the ability to use a contact's photo as the shortcut or reminder icon when selecting a contact from the picker.

---

### Current Behavior

1. The native Android contact picker already retrieves `photoUri` (a content:// URI to the contact's photo)
2. This URI is passed to the JS layer but is NOT used
3. Users must manually pick an emoji or text icon even though the contact has a photo

### Proposed Behavior

1. When a contact with a photo is selected, convert the photo to base64
2. Automatically suggest the contact photo as the default icon option
3. Display it in the IconPicker's "Image" tab (using the existing `thumbnail` prop)
4. For scheduled reminders, store the photo URI for display purposes

---

### Changes Overview

| File | Change |
|------|--------|
| `ShortcutPlugin.java` | Convert contact photo to base64 and return as `photoBase64` |
| `ShortcutPlugin.ts` | Add `photoBase64` to pickContact return type |
| `shortcutPluginWeb.ts` | Update type signature |
| `ContactShortcutCustomizer.tsx` | Use photo as default thumbnail icon |
| `ScheduledActionCreator.tsx` | Pass photo to destination for display |
| `scheduledAction.ts` | Already has `photoUri` field (no change needed) |

---

### Part 1: Native Android - Convert Photo to Base64

**File:** `native/android/app/src/main/java/app/onetap/shortcuts/plugins/ShortcutPlugin.java`

After retrieving `photoUri` from the contact picker, add logic to:

1. Open an InputStream from the contact photo URI
2. Decode it as a Bitmap
3. Scale it down to a reasonable size (e.g., 200x200) to keep the base64 string small
4. Encode the scaled bitmap to base64
5. Return both `photoUri` (original) and `photoBase64` (for immediate use)

```text
pickContactResult method addition:

if (photoUri != null) {
    try {
        // Open photo and convert to base64
        InputStream photoStream = resolver.openInputStream(Uri.parse(photoUri));
        if (photoStream != null) {
            Bitmap photoBitmap = BitmapFactory.decodeStream(photoStream);
            photoStream.close();
            
            if (photoBitmap != null) {
                // Scale to max 200x200 for icon use
                int maxSize = 200;
                int width = photoBitmap.getWidth();
                int height = photoBitmap.getHeight();
                float scale = Math.min((float)maxSize/width, (float)maxSize/height);
                
                if (scale < 1) {
                    int scaledW = Math.round(width * scale);
                    int scaledH = Math.round(height * scale);
                    photoBitmap = Bitmap.createScaledBitmap(photoBitmap, scaledW, scaledH, true);
                }
                
                // Encode to base64
                ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                photoBitmap.compress(Bitmap.CompressFormat.JPEG, 85, outputStream);
                String base64 = Base64.encodeToString(outputStream.toByteArray(), Base64.NO_WRAP);
                ret.put("photoBase64", "data:image/jpeg;base64," + base64);
            }
        }
    } catch (Exception e) {
        Log.w("ShortcutPlugin", "Could not load contact photo: " + e.getMessage());
    }
}
```

---

### Part 2: TypeScript Interface Update

**File:** `src/plugins/ShortcutPlugin.ts`

Update the `pickContact` return type:

```typescript
pickContact(): Promise<{
  success: boolean;
  name?: string;
  phoneNumber?: string;
  photoUri?: string;
  photoBase64?: string;  // NEW: base64-encoded contact photo for icon
  error?: string;
}>;
```

**File:** `src/plugins/shortcutPluginWeb.ts`

Update the web fallback interface to match.

---

### Part 3: ContactShortcutCustomizer - Use Photo as Icon

**File:** `src/components/ContactShortcutCustomizer.tsx`

Changes:

1. Store `photoBase64` in state when contact is picked
2. Pass it to `IconPicker` as the `thumbnail` prop
3. Set the default icon to the photo thumbnail when available

```typescript
// State addition
const [contactPhoto, setContactPhoto] = useState<string | null>(null);

// In handlePickContact:
if (result.photoBase64) {
  setContactPhoto(result.photoBase64);
  // Set thumbnail as default icon
  setIcon({ type: 'thumbnail', value: result.photoBase64 });
}

// Pass to IconPicker:
<IconPicker
  thumbnail={contactPhoto || undefined}
  selectedIcon={icon}
  onSelect={setIcon}
/>
```

Also update the contact info display to show the actual contact photo:

```typescript
// In the contact info display section:
<div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
  {contactPhoto ? (
    <img src={contactPhoto} alt="" className="h-full w-full object-cover" />
  ) : mode === 'dial' ? (
    <Phone className="h-6 w-6 text-primary" />
  ) : (
    <WhatsAppIcon className="h-6 w-6 text-primary" />
  )}
</div>
```

---

### Part 4: ScheduledActionCreator - Store Photo for Reminders

**File:** `src/components/ScheduledActionCreator.tsx`

Update the contact picker handler to include the photo:

```typescript
const handleContactSelect = async () => {
  triggerHaptic('light');
  try {
    const result = await ShortcutPlugin.pickContact();
    if (result.success && result.phoneNumber) {
      handleDestinationSelect({
        type: 'contact',
        phoneNumber: result.phoneNumber,
        contactName: result.name || 'Contact',
        photoUri: result.photoBase64 || result.photoUri,  // Store photo for display
      });
    }
  } catch (error) {
    console.warn('Contact picker failed:', error);
  }
};
```

The `ContactDestination` type already has `photoUri?: string`, so this will work without schema changes.

---

### Part 5: Display Contact Photo in Reminder UI (Optional Enhancement)

If desired, the reminder item display could show the contact photo. This would be in components that render scheduled actions, but is optional for this initial implementation.

---

### Technical Notes

- **Photo quality**: JPEG at 85% quality, scaled to max 200x200 keeps base64 under 20KB
- **Fallback**: If photo loading fails, the system falls back to emoji/text icons
- **Permissions**: Contact photo access uses the same temporary permission granted by the picker
- **Web fallback**: The web plugin will continue to return `undefined` for `photoBase64`

---

### Testing Recommendations

1. Pick a contact WITH a photo → verify photo appears in IconPicker's Image tab
2. Pick a contact WITHOUT a photo → verify emoji icon is default
3. Create a shortcut with contact photo → verify icon appears correctly on home screen
4. Create a reminder with contact → verify photo is stored and displayable
