

# Fix: Allow Debug Builds Without Release Signing Env Vars

## Problem

The current `signingConfigs.release` block throws `GradleException` during Gradle **configuration phase**, which runs for ALL tasks — including `assembleDebug`. This means developers cannot run debug builds locally without setting all 4 release signing env vars.

## Solution

Wrap the validation logic so it only triggers when a **release** build task is actually requested. Gradle evaluates `signingConfigs` eagerly, so we use a `gradle.taskGraph.whenReady` guard to defer the check.

### Change: `scripts/android/patch-android-project.mjs` — `patchReleaseSigning()`

Replace the current `signingConfig` Groovy block (lines 357-374) with a version that:

1. **Always defines** `signingConfigs.release` with the env var reads (no throws at config time)
2. **Defers validation** to `gradle.taskGraph.whenReady` — only checks when a release task is in the graph
3. If any env var is missing or keystore not found during a release build, throws `GradleException`
4. Debug builds (`assembleDebug`, `installDebug`, etc.) work without any env vars

New generated Groovy block:

```groovy
signingConfigs {
    release {
        def ksPath = System.getenv("RELEASE_STORE_FILE") ?: ""
        if (!ksPath.isEmpty()) {
            storeFile = file(ksPath)
            storePassword = System.getenv("RELEASE_STORE_PASSWORD") ?: ""
            keyAlias = System.getenv("RELEASE_KEY_ALIAS") ?: ""
            keyPassword = System.getenv("RELEASE_KEY_PASSWORD") ?: ""
        }
    }
}

gradle.taskGraph.whenReady { taskGraph ->
    def isRelease = taskGraph.allTasks.any { it.name.toLowerCase().contains("release") }
    if (isRelease) {
        def cfg = android.signingConfigs.release
        if (cfg.storeFile == null || !cfg.storeFile.exists()) {
            throw new GradleException("Release signing: RELEASE_STORE_FILE is missing or keystore not found. Set all 4 env vars for release builds.")
        }
        if (!cfg.storePassword || cfg.storePassword.isEmpty()) {
            throw new GradleException("Release signing: RELEASE_STORE_PASSWORD env var is required")
        }
        if (!cfg.keyAlias || cfg.keyAlias.isEmpty()) {
            throw new GradleException("Release signing: RELEASE_KEY_ALIAS env var is required")
        }
        if (!cfg.keyPassword || cfg.keyPassword.isEmpty()) {
            throw new GradleException("Release signing: RELEASE_KEY_PASSWORD env var is required")
        }
    }
}
```

The `buildTypes.release.signingConfig = signingConfigs.release` line stays unchanged.

### Update console log message

Change the success log from:
> "Added mandatory release signing configuration (no debug fallback)."

to:
> "Added release signing configuration (mandatory for release, optional for debug)."

## What Does NOT Change

- Release builds still **fail hard** if env vars are missing
- No debug fallback for release builds (signingConfigs.debug is never referenced)
- CI pipeline, keystore files, ProGuard, R8 settings are untouched
- Documentation already states debug builds work without env vars — no doc changes needed

## File Changes

| File | Change |
|------|--------|
| `scripts/android/patch-android-project.mjs` | Rewrite signing block to defer validation to taskGraph.whenReady |

