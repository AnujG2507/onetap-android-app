
# Contact Photo Logic Fix Plan

## Problem Analysis

The contact photo logic is not working. After examining the native Android code, I've identified the root cause:

**The code queries `PHOTO_URI` from the phone data URI but then tries to open it as a generic input stream. This is not the reliable way to access contact photos on Android.**

### Current Approach (Lines 720-758 in ShortcutPlugin.java)
```java
// Gets photoUri from query
String photoUri = cursor.getString(photoIndex);

// Then tries to open it
InputStream photoStream = resolver.openInputStream(Uri.parse(photoUri));
```

### Why It Fails
1. The `PHOTO_URI` column may return `null` for contacts that DO have photos (inconsistent across Android versions/manufacturers)
2. Even when `PHOTO_URI` is not null, opening it with `openInputStream()` may fail due to permission issues
3. The correct Android API for contact photos is `ContactsContract.Contacts.openContactPhotoInputStream()`, which handles the photo retrieval internally

---

## Solution

Replace the current photo retrieval logic with the official Android API: `ContactsContract.Contacts.openContactPhotoInputStream()`

### Part 1: Update pickContactResult in ShortcutPlugin.java

**Changes to make:**

1. Query the `CONTACT_ID` from the phone data URI (in addition to name and number)
2. Use the `CONTACT_ID` to build the proper contacts URI
3. Use `Contacts.openContactPhotoInputStream()` which is the official method
4. Fall back to the thumbnail if full-size photo fails

**New code approach:**
```java
// In the projection, add CONTACT_ID
String[] projection = {
    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
    ContactsContract.CommonDataKinds.Phone.NUMBER,
    ContactsContract.CommonDataKinds.Phone.CONTACT_ID  // Instead of PHOTO_URI
};

// After getting contactId from the cursor:
long contactId = cursor.getLong(contactIdIndex);

// Build the contact lookup URI
Uri contactContentUri = ContentUris.withAppendedId(
    ContactsContract.Contacts.CONTENT_URI, contactId);

// Use the official API to get photo stream
InputStream photoStream = ContactsContract.Contacts
    .openContactPhotoInputStream(resolver, contactContentUri, true);
    
if (photoStream == null) {
    // Try thumbnail as fallback
    photoStream = ContactsContract.Contacts
        .openContactPhotoInputStream(resolver, contactContentUri, false);
}
```

This approach:
- Uses the official Android API designed specifically for contact photos
- Handles permissions correctly
- Works consistently across Android versions
- Tries full-size photo first, then falls back to thumbnail

### Part 2: Add Required Import

Add the `ContentUris` import at the top of the file:
```java
import android.content.ContentUris;
```

---

## Technical Details

### File Changes

| File | Change |
|------|--------|
| `ShortcutPlugin.java` | Replace PHOTO_URI query + openInputStream with CONTACT_ID + openContactPhotoInputStream API |

### Code Location
Lines ~669-758 in `pickContactResult()` method

### Key Changes:
1. **Line ~669-673**: Update projection to use `CONTACT_ID` instead of `PHOTO_URI`
2. **Lines ~682-693**: Query `CONTACT_ID` instead of `PHOTO_URI`
3. **Lines ~720-758**: Replace the photo retrieval logic with the official API

### Testing After Fix:
1. Pick a contact WITH a photo → verify `photoBase64` is returned and displayed
2. Pick a contact WITHOUT a photo → verify graceful fallback to emoji icon
3. Verify the photo appears correctly in:
   - ContactShortcutCustomizer (contact info display + IconPicker)
   - ScheduledActionCreator (reminder destination)
   - ScheduledActionItem (reminder list)
   - ScheduledActionActionSheet (action sheet)
   - ScheduledActionEditor (editor view)
