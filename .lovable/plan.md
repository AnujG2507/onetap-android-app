

## Add Native Battery Optimization Exemption Handling

### Goal
Programmatically request Android's battery optimization exemption so the OS (and OEM skins like Samsung, Xiaomi, Huawei) are less likely to kill the app or defer its alarms/notifications.

### What Changes

**1. AndroidManifest.xml -- Add permission**

Add the `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` permission. This allows the app to show the system dialog asking the user to whitelist the app from Doze mode.

**2. ShortcutPlugin.java -- Add two new methods**

- `checkBatteryOptimization()` -- Returns whether the app is already exempted from battery optimization using `PowerManager.isIgnoringBatteryOptimizations()`.
- `requestBatteryOptimization()` -- Launches the system `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` intent, which shows a one-tap system dialog to the user (no Play Store policy issue since the app relies on exact alarms for scheduled actions).

**3. ShortcutPlugin.ts -- Add TypeScript interface**

Add the two new methods to the `ShortcutPluginInterface`:
- `checkBatteryOptimization(): Promise<{ exempted: boolean }>`
- `requestBatteryOptimization(): Promise<{ success: boolean; error?: string }>`

**4. shortcutPluginWeb.ts -- Add web stubs**

Return `{ exempted: false }` and `{ success: false }` respectively.

**5. BatteryOptimizationHelp.tsx -- Add auto-request**

Update the "Open App Settings" button to first call `requestBatteryOptimization()` (shows the native system dialog) instead of `openAlarmSettings()`. This is a much more direct path -- one tap to whitelist vs navigating through settings manually.

**6. ScheduledActionCreator.tsx (or wherever scheduled actions are first created) -- Proactive check**

When a user creates their first scheduled action, call `checkBatteryOptimization()`. If not exempted, call `requestBatteryOptimization()` to show the system dialog proactively. This ensures the app gets whitelisted before the user relies on scheduled reminders.

### Technical Details

**New manifest permission:**
```xml
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
```

**Native Java (ShortcutPlugin.java):**
```java
@PluginMethod
public void checkBatteryOptimization(PluginCall call) {
    PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
    boolean exempted = pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    JSObject result = new JSObject();
    result.put("exempted", exempted);
    call.resolve(result);
}

@PluginMethod
public void requestBatteryOptimization(PluginCall call) {
    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
    intent.setData(Uri.parse("package:" + getContext().getPackageName()));
    getActivity().startActivity(intent);
    JSObject result = new JSObject();
    result.put("success", true);
    call.resolve(result);
}
```

### What This Does NOT Do

- This does **not** add a foreground service. Foreground services are heavy, drain battery, show a persistent notification, and are unnecessary here -- the app already uses `AlarmManager` exact alarms which work independently.
- OEM-specific deep sleep (Xiaomi MIUI, Samsung auto-optimization) cannot be bypassed programmatically. The existing `BatteryOptimizationHelp` component with OEM-specific instructions remains the guide for those cases. However, the standard Android battery optimization exemption covers the majority of scenarios.

### Files Modified
- `native/android/app/src/main/AndroidManifest.xml` -- 1 line added
- `native/android/app/src/main/java/app/onetap/access/plugins/ShortcutPlugin.java` -- ~25 lines added
- `src/plugins/ShortcutPlugin.ts` -- 2 methods added to interface
- `src/plugins/shortcutPluginWeb.ts` -- 2 stub methods added
- `src/components/BatteryOptimizationHelp.tsx` -- Updated button action
- `src/components/ScheduledActionCreator.tsx` -- Proactive exemption check on first schedule

