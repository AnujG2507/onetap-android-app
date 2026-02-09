# OneTap Shortcuts - Deployment Guide

## Philosophy

> Automate boring, reversible steps. Never automate irreversible decisions.

CI builds and uploads. A human decides when to release.

---

## Environments

| Environment | Purpose | Notes |
|-------------|---------|-------|
| Lovable Preview | Web development & testing | Auto-deploys on code changes |
| Android Debug | Native testing on device | Built locally via `npx cap run android` |
| Android Release | Production builds | Built locally or via CI |
| Google Play | Distribution | Manual promotion between tracks |

There is **one** backend project. No staging/prod split.

---

## Local Development

### Prerequisites

- Node.js 20+
- JDK 21
- Android Studio + SDK (API 36)
- Physical Android device (8.0+) with USB debugging

See `ANDROID_SETUP.md` for detailed setup and `UBUNTU_SETUP.md` for Ubuntu-specific instructions.

### Build & Run

```bash
# Full clean rebuild (recommended)
node scripts/android/clean-rebuild-android.mjs --run

# Or manual steps:
npm run build
npx cap sync android
node scripts/android/patch-android-project.mjs
npx cap run android
```

### After Pulling Code Changes

```bash
git pull
npm install           # If dependencies changed
npm run build
npx cap sync android
node scripts/android/patch-android-project.mjs   # If native files changed
npx cap run android
```

---

## CI/CD Pipeline

### Workflow: `.github/workflows/android-release.yml`

**Triggers:**
- Push tag `v*` (e.g., `v1.0.0`) → builds + uploads to internal track
- Manual dispatch → choose track (internal/alpha/beta/production)

**Steps:**
1. Checkout + setup Node 20, JDK 21, Android SDK
2. Extract version from tag (`v1.2.3` → versionName `1.2.3`, versionCode `10203`)
3. `npm ci` + `npm run build`
4. `npx cap add android` + `npx cap sync android`
5. `node scripts/android/patch-android-project.mjs` (applies all native patches)
6. Decode keystore from secret
7. `./gradlew bundleRelease`
8. Upload AAB artifact (retained 30 days)
9. Upload mapping file (retained 90 days)
10. Publish to Google Play (if not `skip_upload`)
11. Create GitHub Release (for tag pushes)

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `KEYSTORE_BASE64` | Base64-encoded release keystore |
| `KEYSTORE_PASSWORD` | Keystore password |
| `KEY_PASSWORD` | Signing key password |
| `PLAY_SERVICE_ACCOUNT_JSON` | Google Play API service account JSON |

### Version Scheme

Version code is calculated: `major * 10000 + minor * 100 + patch`

| Tag | versionName | versionCode |
|-----|-------------|-------------|
| v1.0.0 | 1.0.0 | 10000 |
| v1.0.1 | 1.0.1 | 10001 |
| v1.2.3 | 1.2.3 | 10203 |

---

## Release Tracks

| Track | Purpose | Auto-upload |
|-------|---------|-------------|
| internal | Team testing | Yes (tag push) |
| alpha | Early access | Manual dispatch |
| beta | Wider testing | Manual dispatch |
| production | Public release | Manual dispatch only |

**Tag pushes always go to `internal`**. Promotion to production requires manual workflow dispatch with `track: production`.

---

## What the Patch Script Does

`scripts/android/patch-android-project.mjs`:

- Copies native files from `native/android/` → `android/`
- Updates Gradle wrapper to 8.13 (Gradle 9/10 compatible)
- Configures SDK: minSdk=31, compileSdk=36, targetSdk=36
- Uses modern Gradle DSL (`minSdk =` not `minSdkVersion`)
- Sets JDK 21 in gradle.properties
- Adds dependencies (ExoPlayer/Media3, SwipeRefreshLayout, etc.)
- Configures release signing from environment variables
- Removes deprecated patterns (jcenter, old configs)

---

## Build Outputs

| Output | Location | Notes |
|--------|----------|-------|
| Web assets | `dist/` | Built by Vite |
| Debug APK | `android/app/build/outputs/apk/debug/` | Local testing |
| Release AAB | `android/app/build/outputs/bundle/release/` | Play Store upload |
| ProGuard mapping | `android/app/build/outputs/mapping/release/` | For crash symbolication |

---

## Edge Functions

Edge functions deploy automatically when code is pushed to the Lovable project. No manual deployment needed.

| Function | Purpose |
|----------|---------|
| `fetch-url-metadata` | Fetches title/favicon for URLs (CORS bypass) |
| `delete-account` | Deletes user account + all cloud data |

---

## Recovery

### If a release is broken

1. Do NOT auto-rollback — assess first
2. Fix the issue in a `feature/*` branch
3. Tag a new patch version (e.g., `v1.0.1`)
4. CI builds and uploads to internal
5. Test on internal track
6. Manually promote to production

### If the build pipeline breaks

```bash
# Build locally
npm run build
npx cap sync android
node scripts/android/patch-android-project.mjs
cd android && ./gradlew bundleRelease
# Upload AAB manually via Play Console
```

---

*Last updated: February 2026*
