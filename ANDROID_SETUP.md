# OneTap - Android Setup Guide

## Prerequisites

- **Node.js** v18+
- **JDK 21** (recommended for Android/Gradle)
- **Android Studio** with Android SDK
- **Android phone** (8.0+) with USB debugging enabled

## Quick Start

### 1. Export & Clone

```bash
# Export from Lovable to GitHub, then:
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
npm install
npx cap add android
npm run build
npx cap sync android
```

### 2. Apply Native Patches

Run the patch script to copy native Java files and configure Gradle:

```bash
node scripts/android/patch-android-project.mjs
```

This script:
- Copies custom Java files from `native/android/` to `android/`
- Updates Gradle wrapper to 8.13
- Sets minSdk=31, compileSdk=36, targetSdk=36
- Configures JDK 21

### 3. Configure OAuth (Required for Google Sign-In)

The app uses **Android App Links** for OAuth callback. This requires HTTPS URLs.

**Backend Setup:**
1. Open your Lovable project
2. Go to **Cloud → Users → Auth Settings → URL Configuration**
3. Add to "URI allow list": `https://id-preview--2fa7e10e-ca71-4319-a546-974fcb8a4a6b.lovable.app/auth-callback`

**Domain Verification (assetlinks.json):**

The file `public/.well-known/assetlinks.json` must contain your app's signing certificate fingerprint:

```bash
# Get your debug keystore fingerprint:
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android | grep SHA256

# Get your release keystore fingerprint:
keytool -list -v -keystore your-release.keystore -alias your-alias | grep SHA256
```

Update `public/.well-known/assetlinks.json` with your fingerprint(s).

### 4. Run on Device

```bash
# Enable USB debugging on your phone first
npx cap run android
```

Or open in Android Studio: `npx cap open android`

## After Code Changes

```bash
git pull
npm run build
npx cap sync android
node scripts/android/patch-android-project.mjs  # If native files changed
npx cap run android
```

## Environment Check

```bash
java -version      # Should be 21.x
echo $JAVA_HOME    # Should point to JDK 21
echo $ANDROID_HOME # Should be set
adb devices        # Should list your device
```

## OAuth Deep Link Flow (App Links)

The app uses Android App Links for native OAuth:

1. User taps "Sign in with Google"
2. App opens Google OAuth in Chrome Custom Tab
3. After authentication, Google redirects to `https://id-preview--2fa7e10e-ca71-4319-a546-974fcb8a4a6b.lovable.app/auth-callback?code=...`
4. Android intercepts this HTTPS URL (via verified App Link in AndroidManifest.xml)
5. App exchanges the code for a session token
6. User is signed in

**Files involved:**
- `public/.well-known/assetlinks.json` - Domain verification for App Links
- `native/android/app/src/main/AndroidManifest.xml` - App Links intent-filter with `autoVerify="true"`
- `src/hooks/useDeepLink.ts` - Handles `appUrlOpen` events
- `src/hooks/useAuth.ts` - Native OAuth flow with `skipBrowserRedirect`

**Testing App Links:**

```bash
# Check if Android verified the domain
adb shell pm get-app-links app.onetap.shortcuts

# Test the deep link manually
adb shell am start -W -a android.intent.action.VIEW \
  -d "https://id-preview--2fa7e10e-ca71-4319-a546-974fcb8a4a6b.lovable.app/auth-callback?code=test"
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Device not detected | Enable USB debugging, check cable |
| Java version error | Install JDK 21, set as default |
| Build fails | Run `npx cap sync android` |
| Shortcuts not working | Requires Android 8.0+ |
| `spawn ./gradlew ENOENT` | See Gradlew fix below |
| OAuth goes to browser | Check assetlinks.json and App Links verification |
| "ES256 invalid signing" | Backend redirect URL not configured |

### Gradlew Not Found Fix

If you get `spawn ./gradlew ENOENT` error:

```bash
cd android
gradle wrapper
cd ..
npx cap run android
```

If `gradle` command not found, install it first:
```bash
sudo apt install gradle -y  # Ubuntu/Debian
brew install gradle         # macOS
```

### Java Toolchain Error (Looking for Java 21)

If you see an error like:

- `Cannot find a Java installation ... matching: {languageVersion=21 ...}`

**Fix:** Install JDK 21 and re-run the patch script:

```bash
# Ubuntu/Debian
sudo apt install openjdk-21-jdk -y
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64

# Then re-patch
node scripts/android/patch-android-project.mjs
npm run build
npx cap sync android
npx cap run android
```

### App Links Not Working

If Google sign-in completes but opens in the browser instead of the app:

1. **Check assetlinks.json is accessible:**
   Visit `https://id-preview--2fa7e10e-ca71-4319-a546-974fcb8a4a6b.lovable.app/.well-known/assetlinks.json` in a browser

2. **Verify fingerprint matches:**
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android | grep SHA256
   ```
   Compare with the fingerprint in `assetlinks.json`

3. **Check App Links verification status:**
   ```bash
   adb shell pm get-app-links app.onetap.shortcuts
   ```
   Look for `verified` status

4. **Force re-verification:**
   ```bash
   adb shell pm verify-app-links --re-verify app.onetap.shortcuts
   ```

5. **Use Auth Debug panel:** In dev builds, tap the "Auth" button to see platform info and last received deep link

### Clean Rebuild

```bash
rm -rf android
npx cap add android
node scripts/android/patch-android-project.mjs
npm run build
npx cap sync android
npx cap run android
```

## Release APK

1. `npx cap open android`
2. Build → Generate Signed Bundle/APK → APK
3. Find APK in `android/app/release/`

**Important:** Add your release keystore SHA256 fingerprint to `public/.well-known/assetlinks.json` before releasing.
