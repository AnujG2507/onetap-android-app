
# Contact Photo Logic Fix Plan ✅ COMPLETED

## Problem Analysis

The contact photo logic was not working. After examining the native Android code, I identified the root cause:

**The code queried `PHOTO_URI` from the phone data URI but then tried to open it as a generic input stream. This is not the reliable way to access contact photos on Android.**

### Previous Approach (FIXED)
```java
// Gets photoUri from query
String photoUri = cursor.getString(photoIndex);

// Then tries to open it
InputStream photoStream = resolver.openInputStream(Uri.parse(photoUri));
```

### Why It Failed
1. The `PHOTO_URI` column may return `null` for contacts that DO have photos (inconsistent across Android versions/manufacturers)
2. Even when `PHOTO_URI` is not null, opening it with `openInputStream()` may fail due to permission issues
3. The correct Android API for contact photos is `ContactsContract.Contacts.openContactPhotoInputStream()`, which handles the photo retrieval internally

---

## Solution (APPLIED)

Replaced the current photo retrieval logic with the official Android API: `ContactsContract.Contacts.openContactPhotoInputStream()`

### Changes Made in ShortcutPlugin.java

1. ✅ Added `ContentUris` import at the top of the file
2. ✅ Updated projection to use `CONTACT_ID` instead of `PHOTO_URI`
3. ✅ Query `CONTACT_ID` from the cursor (as `long`)
4. ✅ Build contact URI using `ContentUris.withAppendedId()`
5. ✅ Use `openContactPhotoInputStream()` with `preferHighres=true` first
6. ✅ Fall back to thumbnail (`preferHighres=false`) if high-res unavailable

### New Code
```java
// Query CONTACT_ID instead of PHOTO_URI
String[] projection = {
    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
    ContactsContract.CommonDataKinds.Phone.NUMBER,
    ContactsContract.CommonDataKinds.Phone.CONTACT_ID
};

// Build contact URI and use official API
Uri contactContentUri = ContentUris.withAppendedId(
    ContactsContract.Contacts.CONTENT_URI, contactId);

InputStream photoStream = ContactsContract.Contacts
    .openContactPhotoInputStream(resolver, contactContentUri, true);
    
if (photoStream == null) {
    photoStream = ContactsContract.Contacts
        .openContactPhotoInputStream(resolver, contactContentUri, false);
}
```

---

## Testing After Fix

To verify the fix works:
1. Pick a contact WITH a photo → verify `photoBase64` is returned and displayed
2. Pick a contact WITHOUT a photo → verify graceful fallback to emoji icon
3. Verify the photo appears correctly in:
   - ContactShortcutCustomizer (contact info display + IconPicker)
   - ScheduledActionCreator (reminder destination)
   - ScheduledActionItem (reminder list)
   - ScheduledActionActionSheet (action sheet)
   - ScheduledActionEditor (editor view)

**Remember to run `npx cap sync` after pulling these changes.**
