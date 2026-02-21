# OneTap Shortcuts — Deployment Guide

> **Purpose of this document:** Explain how your code becomes an app on someone's phone, step by step, with no assumptions about prior Android or CI/CD experience.

---

## Table of Contents

1. [The Big Picture](#1-the-big-picture)
2. [Environments](#2-environments)
3. [Prerequisites (What You Need Installed)](#3-prerequisites-what-you-need-installed)
4. [Local Build: Step by Step](#4-local-build-step-by-step)
5. [What the Build Scripts Do](#5-what-the-build-scripts-do)
6. [CI/CD Pipeline: What Happens Automatically](#6-cicd-pipeline-what-happens-automatically)
7. [Signing Keys Explained](#7-signing-keys-explained)
8. [How Version Codes Work](#8-how-version-codes-work)
9. [How to Test Release Builds Safely](#9-how-to-test-release-builds-safely)
10. [Build Outputs](#10-build-outputs)
11. [Edge Functions Deployment](#11-edge-functions-deployment)
12. [Website Deployment (Vercel)](#12-website-deployment-vercel)
13. [Supabase Environment Setup](#13-supabase-environment-setup)
14. [Common Failures and Fixes](#14-common-failures-and-fixes)

---

## 1. The Big Picture

```
Your React code (src/)
        │
        ▼
    Vite bundles it into static files (dist/)
        │
        ▼
    Capacitor copies those files into an Android project
        │
        ▼
    The patch script adds your native Java code
        │
        ▼
    Gradle compiles everything into a signed .aab file
        │
        ▼
    The .aab is uploaded to Google Play Store
        │
        ▼
    Google Play distributes it to users' phones
```

**What is an AAB?** An Android App Bundle. It's the format Google Play requires. Google takes your AAB and generates optimized APKs for each device type.

**Important:** The app is never tested or deployed via web preview environments. All testing happens on physical Android devices.

---

## 2. Environments

| Environment | Purpose | How It Updates |
|-------------|---------|---------------|
| Android Debug | Testing on your phone via USB | Built locally with `npx cap run android` |
| Android Release | Production-quality build | Built locally or by CI |
| Google Play | Distribution to real users | Manual promotion between tracks |

**There is ONE Supabase backend project.** No staging/production split. See [SUPABASE.md](SUPABASE.md) for why.

---

## 3. Prerequisites (What You Need Installed)

Before you can build locally, install these tools:

| Tool | Version | How to Install | How to Verify |
|------|---------|---------------|---------------|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) | `node --version` → should show `v20.x` or higher |
| JDK | 21 | `sudo apt install openjdk-21-jdk` (Ubuntu) | `java -version` → should show `21.x` |
| Android Studio | Latest | [developer.android.com](https://developer.android.com/studio) | Open it → SDK Manager should show |
| Android SDK | API 36 | Android Studio → SDK Manager → install API 36 | `echo $ANDROID_HOME` → should show a path |
| Physical Android phone | 8.0+ | Enable USB debugging in Developer Options | `adb devices` → should list your device |

See [ANDROID_SETUP.md](ANDROID_SETUP.md) for detailed setup instructions.

---

## 4. Local Build: Step by Step

### The Fast Way (Recommended)

```bash
node scripts/android/clean-rebuild-android.mjs --run
```

This single command does everything: cleans, builds, patches, syncs, and deploys to your connected phone.

### The Manual Way (If You Want to Understand Each Step)

```bash
# Step 1: Build the web app
npm run build
# Expected: Creates a dist/ folder with your bundled app

# Step 2: Sync Capacitor
npx cap sync android
# Expected: Updates android/app/src/main/assets/public/

# Step 3: Apply native patches
node scripts/android/patch-android-project.mjs
# Expected: Prints messages about each file copied and setting applied

# Step 4: Run on your phone
npx cap run android
# Expected: App launches on your phone
```

### After Pulling Code Changes

```bash
git pull
npm install                                    # If dependencies changed
node scripts/android/clean-rebuild-android.mjs --run  # Rebuild and run
```

---

## 5. What the Build Scripts Do

### `clean-rebuild-android.mjs`

This is your main build script. It automates the full process:

1. Deletes the `android/` folder (starts fresh)
2. Runs `npx cap add android` (creates a new Android project)
3. Runs the patch script (copies native files, configures Gradle)
4. Runs `npx cap sync android` (copies web files into Android)

**Flags:**

| Flag | What It Does |
|------|-------------|
| `--run` | Also installs and launches on your phone |
| `--verify` | Also runs a Gradle build to check for errors |
| `--release` | Also builds a release AAB |
| `--warning-mode` | Shows Gradle deprecation warnings |
| `--skip-sync` | Skips the final sync step |

### `patch-android-project.mjs`

This script transforms the generic Capacitor Android project into OneTap. It:

- **Copies native files** from `native/android/` → `android/`
- **Updates Gradle** wrapper to version 8.13
- **Configures SDK versions:** minSdk=31, compileSdk=36, targetSdk=36
- **Adds dependencies:** ExoPlayer/Media3, SwipeRefreshLayout, RecyclerView
- **Configures release signing** using environment variables
- **Removes deprecated patterns:** old Gradle syntax, jcenter repository

---

## 6. CI/CD Pipeline: What Happens Automatically

The CI/CD pipeline lives in `.github/workflows/android-release.yml`.

### What CI Does (Automatic)

```
Tag push (v1.0.0)  ──or──  Manual workflow dispatch
         │
         ▼
    Set up environment (Node 20, JDK 21, Android SDK)
         │
         ▼
    Extract version from tag (v1.2.3 → versionName: 1.2.3, versionCode: 10203)
         │
         ▼
    npm ci + npm run build (build the web app)
         │
         ▼
    npx cap add android + npx cap sync android
         │
         ▼
    Apply patches (patch-android-project.mjs)
         │
         ▼
    Decode signing keystore from GitHub Secret
         │
         ▼
    ./gradlew bundleRelease (build signed AAB)
         │
         ▼
    Upload AAB as GitHub artifact (saved for 30 days)
         │
         ▼
    Upload to Google Play (internal track by default)
         │
         ▼
    Create GitHub Release (for tag pushes)
```

### What Humans Do (Manual)

- **Decide when to release:** Tag a version when you're ready
- **Test on internal track:** Install from Play Console on a physical device and verify
- **Promote to production:** Manually trigger the workflow with `track: production`, or promote in Play Console

### Required GitHub Secrets

These are stored in your GitHub repository → Settings → Secrets and Variables → Actions.

| Secret | What It Is | How to Get It |
|--------|-----------|--------------|
| `KEYSTORE_BASE64` | Your signing keystore, base64-encoded | `base64 -w0 onetap-release.jks > keystore_base64.txt` |
| `KEYSTORE_PASSWORD` | Password for the keystore | The password you chose when creating the keystore |
| `KEY_PASSWORD` | Password for the signing key | The password you chose for the key alias |
| `PLAY_SERVICE_ACCOUNT_JSON` | Google Play API credentials | Play Console → Setup → API access → Service account → JSON key |

⚠️ **DANGER:**
If you lose or leak these secrets, your signing pipeline breaks. The `KEYSTORE_BASE64` is especially critical — if you lose the original keystore file, you cannot update the app on Play Store. Keep a backup in a secure location (not in the repo).

---

## 7. Signing Keys Explained

### What is signing?

Every Android app must be "signed" with a cryptographic key before it can be installed. This proves the app comes from you and hasn't been tampered with.

### Two types of keys

| Key | Purpose | Where It Lives |
|-----|---------|---------------|
| **Upload key** | Used to sign the AAB you upload to Google Play | Your keystore file (`onetap-release.jks`) |
| **App signing key** | Used by Google Play to sign the final APK sent to users | Managed by Google (if enrolled in Play App Signing) |

**Recommended:** Enroll in Google Play App Signing. This means even if you lose your upload key, Google still has the app signing key and you can reset your upload key.

### Creating a keystore (one-time)

```bash
keytool -genkey -v -keystore onetap-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias onetap-key
```

⚠️ **DANGER:**
**Back up this file immediately.** Store it in a secure location outside of your repository (e.g., a password manager, encrypted cloud storage). If you lose it AND you didn't enroll in Play App Signing, you cannot update the app. Ever.

---

## 8. How Version Codes Work

Every Android app has two version identifiers:

| Identifier | Example | Purpose |
|-----------|---------|---------|
| `versionName` | `1.2.3` | Human-readable. Shown to users in Play Store. |
| `versionCode` | `10203` | Machine-readable. Must increase with every release. |

**The formula:** `major × 10000 + minor × 100 + patch`

---

## 9. How to Test Release Builds Safely

### Google Play has four "tracks" (release channels):

| Track | Who Can See It | Purpose |
|-------|---------------|---------|
| Internal | Only people you've added as testers | Quick testing before any public release |
| Alpha (Closed) | Invited testers only | Early access testing |
| Beta (Open) | Anyone who opts in | Wider testing |
| Production | Everyone | Public release |

### Safe testing process:

1. **Tag a version:** `git tag v1.0.0 && git push origin v1.0.0`
2. **Wait for CI:** Check GitHub Actions — the build should succeed and upload to the internal track
3. **Install from internal track:** Open Play Console → Internal testing → copy the test link → install on your **physical Android device**
4. **Test everything:** All shortcut types, reminders, sync, offline mode
5. **If it works:** Promote to production (see [RELEASE_PROCESS.md](RELEASE_PROCESS.md))
6. **If it's broken:** Fix the issue, tag a new patch version (`v1.0.1`), repeat

---

## 10. Build Outputs

| Output | Location | What It's For |
|--------|----------|--------------|
| Web assets | `dist/` | The bundled React app |
| Debug APK | `android/app/build/outputs/apk/debug/` | Testing on your phone |
| Release AAB | `android/app/build/outputs/bundle/release/` | Uploading to Play Store |
| ProGuard mapping | `android/app/build/outputs/mapping/release/` | Translating crash reports to readable code |

---

## 11. Edge Functions Deployment

Edge functions must be deployed manually using the Supabase CLI:

```bash
# Login to your Supabase account
npx supabase login

# Link to the external project
npx supabase link --project-ref xfnugumyjhnctmqgiyqm

# Deploy all functions
npx supabase functions deploy fetch-url-metadata
npx supabase functions deploy delete-account
```

| Function | Purpose |
|----------|---------|
| `fetch-url-metadata` | Fetches page title and favicon for URLs (bypasses CORS) |
| `delete-account` | Deletes user's cloud data and auth account |

---

## 12. Website Deployment (Vercel)

The marketing website is hosted on Vercel at `onetapapp.in`. This is a separate repository (`onetapapp.in`).

**Critical files hosted on the website domain:**

| File | Purpose | Why It Matters |
|------|---------|---------------|
| `/.well-known/assetlinks.json` | Android App Link verification | Without this, OAuth redirects open in browser instead of the app |
| `/privacy-policy.html` | Google Play policy compliance | Required for Play Store listing |
| `/auth-callback` | OAuth redirect landing | Intercepted by Android App Links before the page loads |

**When deploying to Vercel, ensure:**
1. The `assetlinks.json` file is served with correct MIME type (`application/json`)
2. The SHA-256 fingerprint in `assetlinks.json` matches your Play Store app signing certificate
3. The domain has a valid SSL certificate (required for App Links)

---

## 13. Supabase Environment Setup

> **Note:** The `.env` file is system-managed by Lovable Cloud and is **not used by the app** for Supabase connection. The app connects via hardcoded credentials in `src/lib/supabaseClient.ts` (external project `xfnugumyjhnctmqgiyqm`).

If deploying to a new Supabase project, update `src/lib/supabaseClient.ts` with the new project URL and anon key. Ensure the auth config includes `flowType: 'implicit'` (required for native Android OAuth — see [ARCHITECTURE.md](ARCHITECTURE.md) Section 6 for why).

### Supabase Dashboard Configuration

1. **Authentication → Providers → Google:** Enable and configure with your OAuth credentials
2. **Authentication → URL Configuration → Redirect URLs:** Add both:
   - `onetap://auth-callback` (required for native Android)
   - `https://onetapapp.in/auth-callback` (recommended App Links fallback)
3. **Edge Functions → Secrets:** Verify `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` exist

See [SUPABASE.md](SUPABASE.md) for full backend setup.

---

## 14. Common Failures and Fixes

| Problem | What You See | How to Fix |
|---------|-------------|-----------|
| **Device not found** | `adb devices` shows nothing | Enable USB debugging, try a different cable, run `adb kill-server && adb start-server` |
| **Java version wrong** | `Cannot find Java installation matching: {languageVersion=21}` | Install JDK 21: `sudo apt install openjdk-21-jdk` and set `JAVA_HOME` |
| **Gradle wrapper missing** | `spawn ./gradlew ENOENT` | Run: `cd android && gradle wrapper && cd ..` |
| **Build fails after code change** | Various Gradle errors | Run the clean rebuild: `node scripts/android/clean-rebuild-android.mjs` |
| **AAB not created** | CI step "Verify AAB" fails | Check the Gradle build log for errors (usually a Java compilation issue in native code) |
| **Play Store upload fails** | CI publish step fails | Check `PLAY_SERVICE_ACCOUNT_JSON` secret is correct and the service account has "Release manager" role |
| **Version code too low** | Play Store rejects upload | Your version tag must be higher than the last published version |
| **Signing error** | `keystore was tampered with, or password was incorrect` | Check `KEYSTORE_PASSWORD` and `KEY_PASSWORD` secrets match your keystore |

### If the CI pipeline itself breaks:

You can always build locally as a fallback:

```bash
npm run build
npx cap sync android
node scripts/android/patch-android-project.mjs
cd android && ./gradlew bundleRelease
# Upload the AAB manually via Play Console
```

---

*Last updated: February 2026*
