

# Fix: Mandatory Release Signing (No Debug Fallback)

## Root Cause

The `patchReleaseSigning()` function in `scripts/android/patch-android-project.mjs` generates a `signingConfigs.release` block that **falls back to the debug keystore** when environment variables are missing (lines 369-374). This means `./gradlew bundleRelease` always succeeds -- but produces a debug-signed AAB that Google Play rejects.

## Changes

### 1. `scripts/android/patch-android-project.mjs` -- Rewrite `patchReleaseSigning()`

Replace the current function (lines 328-401) with a strict version that:

- Reads `RELEASE_STORE_FILE`, `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD` from environment variables
- Throws a Gradle `GradleException` if **any** value is missing or the keystore file doesn't exist
- Uses only `=` assignment syntax (Gradle 9/10 safe)
- Never references `signingConfigs.debug`
- Sets `signingConfig = signingConfigs.release` in the `release` build type
- Does NOT touch `minifyEnabled`, `shrinkResources`, or any other build type property (those are handled by other functions)

Generated Gradle block:

```groovy
signingConfigs {
    release {
        def ksPath = System.getenv("RELEASE_STORE_FILE")
        if (ksPath == null || ksPath.isEmpty()) {
            throw new GradleException("RELEASE_STORE_FILE env var is required for release builds")
        }
        def ksFile = file(ksPath)
        if (!ksFile.exists()) {
            throw new GradleException("Keystore not found: " + ksFile.absolutePath)
        }
        storeFile = ksFile
        storePassword = System.getenv("RELEASE_STORE_PASSWORD") ?: { throw new GradleException("RELEASE_STORE_PASSWORD env var is required") }()
        keyAlias = System.getenv("RELEASE_KEY_ALIAS") ?: { throw new GradleException("RELEASE_KEY_ALIAS env var is required") }()
        keyPassword = System.getenv("RELEASE_KEY_PASSWORD") ?: { throw new GradleException("RELEASE_KEY_PASSWORD env var is required") }()
    }
}
```

The release build type injection will only set `signingConfig = signingConfigs.release` (no minifyEnabled/shrinkResources -- those are already handled by `patchBuildTypes()`).

### 2. `.github/workflows/android-release.yml` -- Align env var names

Update the "Build release AAB" step to pass the new env var names the Gradle script expects:

| Old env var | New env var |
|-------------|-------------|
| `KEYSTORE_PATH` | `RELEASE_STORE_FILE` |
| `KEYSTORE_PASSWORD` | `RELEASE_STORE_PASSWORD` |
| (missing) | `RELEASE_KEY_ALIAS` (set to `onetap-key`) |
| `KEY_PASSWORD` | `RELEASE_KEY_PASSWORD` |

### 3. `ANDROID_SETUP.md` / `ARCHITECTURE.md` -- Update signing docs

Update the documentation to reflect:
- The new mandatory env var names
- That release builds now **fail** if signing is not configured (no silent debug fallback)
- Local development note: `./gradlew assembleDebug` still works without any env vars

## What Does NOT Change

- No keystore files are created, modified, or deleted
- ProGuard, R8, and resource shrinking settings are untouched
- Debug signing is untouched
- No hardcoded secrets
- All other patch functions remain the same

## Success Criteria

- `./gradlew bundleRelease` **fails** if `RELEASE_STORE_FILE` is missing
- `./gradlew bundleRelease` **succeeds** and produces a Play-uploadable AAB when all 4 env vars are set
- No Gradle 9/10 deprecation warnings from the signing config
- CI pipeline passes with existing GitHub secrets (just mapped to new names)

