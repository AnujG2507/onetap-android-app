

## Implement Play Store In-App Updates

Use the `@capawesome/capacitor-app-update` plugin to detect and prompt users when a new version is available on the Play Store.

### How It Works

When the app launches on Android, it checks the Play Store for a newer version. If one is found, a dialog prompts the user to update. The user can choose an immediate (full-screen blocking) update flow powered by Google Play's native in-app update API.

### Changes

**1. Install the plugin**

Add `@capawesome/capacitor-app-update` as a dependency.

**2. Create `src/hooks/useAppUpdate.ts`**

A new hook that:
- Runs once on app startup (only on Android native platform)
- Calls `AppUpdate.getAppUpdateInfo()` to check if an update is available
- If `updateAvailability === 2` (update available), calls `AppUpdate.performImmediateUpdate()` to show the native Play Store update screen
- Wraps everything in a try/catch so it silently fails on web or if the check errors

```
useEffect(() => {
  if (Capacitor.getPlatform() !== 'android') return;

  const checkForUpdate = async () => {
    const info = await AppUpdate.getAppUpdateInfo();
    if (info.updateAvailability === 2) {
      // 2 = UPDATE_AVAILABLE
      await AppUpdate.performImmediateUpdate();
    }
  };
  checkForUpdate().catch(() => {});
}, []);
```

**3. Wire into `src/pages/Index.tsx`**

Import and call `useAppUpdate()` at the top of the `Index` component so it fires on every app launch.

**4. Native sync required**

After pulling these changes, you will need to run:
```
npm install
npx cap sync android
```

The plugin automatically registers itself with Capacitor -- no changes needed to `MainActivity.java` or `ShortcutPlugin`.

### Technical Notes

- **Immediate update** blocks the app until the user completes the update -- this is the simplest and most reliable flow.
- The Play Store API only reports updates for production/internal testing tracks. You can test using [internal app sharing](https://developer.android.com/guide/playcore/in-app-updates/test).
- No UI components are needed on our side -- the update screen is rendered by Google Play Services natively.
- The check is a no-op on web since `Capacitor.getPlatform()` returns `'web'`.

