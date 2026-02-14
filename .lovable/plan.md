

# Fix CALL_PHONE Permission Request Across All OEMs

## Problem

The current `requestCallPermission` in `ShortcutPlugin.java` has two bugs:

1. **`CALL_PHONE` is not registered** in the `@CapacitorPlugin` permissions annotation, so Capacitor's built-in permission callback system cannot manage it
2. **The method resolves immediately** with `granted: false` after calling `ActivityCompat.requestPermissions`, instead of waiting for the user to respond to the system dialog

On Samsung, this happens to work because the shortcut creation proceeds anyway and `ContactProxyActivity` handles the fallback. But on OnePlus, Xiaomi, OPPO, and Vivo, the permission dialog may appear briefly or not at all, and the JS layer never learns the user granted permission.

## Solution

### Part 1 -- Register CALL_PHONE in Capacitor permissions (ShortcutPlugin.java)

Add a new permission alias `"callPhone"` to the `@CapacitorPlugin` annotation:

```text
@Permission(
    alias = "callPhone",
    strings = { Manifest.permission.CALL_PHONE }
)
```

### Part 2 -- Use Capacitor's callback system for requestCallPermission (ShortcutPlugin.java)

Replace the current `requestCallPermission` method that uses raw `ActivityCompat.requestPermissions` and resolves immediately. Instead, use Capacitor's `requestPermissionForAlias` with a `@PermissionCallback`, following the same pattern already used by `storagePermissionCallback`:

```text
@PluginMethod
public void requestCallPermission(PluginCall call) {
    if (getPermissionState("callPhone") == PermissionState.GRANTED) {
        JSObject result = new JSObject();
        result.put("granted", true);
        call.resolve(result);
    } else {
        requestPermissionForAlias("callPhone", call, "callPermissionCallback");
    }
}

@PermissionCallback
private void callPermissionCallback(PluginCall call) {
    JSObject result = new JSObject();
    result.put("granted", getPermissionState("callPhone") == PermissionState.GRANTED);
    call.resolve(result);
}
```

This ensures the JS `await ShortcutPlugin.requestCallPermission()` only resolves **after** the user has responded to the system permission dialog.

### Part 3 -- Update checkCallPermission to use Capacitor state (ShortcutPlugin.java)

Simplify `checkCallPermission` to use the same Capacitor permission state:

```text
@PluginMethod
public void checkCallPermission(PluginCall call) {
    JSObject result = new JSObject();
    result.put("granted", getPermissionState("callPhone") == PermissionState.GRANTED);
    call.resolve(result);
}
```

### No JS changes needed

The existing code in `shortcutManager.ts` (lines 191-207) already:
- Checks permission before creating a contact shortcut
- Requests permission if not granted
- Continues regardless of result (fallback to dialer)

The only issue was the native side resolving immediately. With the Capacitor callback fix, the `await` will now properly wait for the user's response.

## Files Changed

| File | Change |
|------|--------|
| `ShortcutPlugin.java` (annotation, line 99-121) | Add `callPhone` permission alias |
| `ShortcutPlugin.java` (requestCallPermission, line 3417-3453) | Use `requestPermissionForAlias` + callback |
| `ShortcutPlugin.java` (checkCallPermission, line 3399-3415) | Use `getPermissionState` |

## Why This Fixes All OEMs

- Capacitor's `requestPermissionForAlias` uses the standard Android permission flow and hooks into the activity result lifecycle correctly
- The `@PermissionCallback` ensures the JS promise only resolves after the system dialog is dismissed
- This is the same proven pattern used for storage and notification permissions in the same file, which already work across all OEMs

