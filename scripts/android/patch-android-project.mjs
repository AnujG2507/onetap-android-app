#!/usr/bin/env node
/**
 * Patch the generated Capacitor Android project for:
 * - Copy custom native files from native/android/ to android/
 * - Java / Gradle compatibility (update Gradle wrapper)
 * - Minimum Android version (minSdkVersion = 31 / Android 12)
 * - Release signing configuration
 * - Version code and version name for releases
 *
 * Usage:
 *   node scripts/android/patch-android-project.mjs
 *
 * Optional env vars:
 *   JAVA_HOME_21=/path/to/jdk21   (recommended)
 *   ONETAP_VERSION_CODE=1         (for release builds)
 *   ONETAP_VERSION_NAME=1.0.0     (for release builds)
 *   KEYSTORE_PATH=path/to/keystore.jks (for CI signing)
 *   KEYSTORE_PASSWORD=xxx         (for CI signing)
 *   KEY_PASSWORD=xxx              (for CI signing)
 */

import fs from "node:fs";
import path from "node:path";

const ANDROID_DIR = path.resolve("android");
const NATIVE_ANDROID_DIR = path.resolve("native/android");
const MIN_SDK = 31; // Android 12
const COMPILE_SDK = 36;
const TARGET_SDK = 36;
// Use Gradle 8.13 with JDK 21 for latest compatibility.
const GRADLE_VERSION = "8.13";
const JAVA_TOOLCHAIN = 21;
const AGP_VERSION = "8.9.1"; // Required for compileSdk 36 + recent AndroidX

// Version configuration - can be overridden by environment variables
const VERSION_CODE = parseInt(process.env.ONETAP_VERSION_CODE || "1", 10);
const VERSION_NAME = process.env.ONETAP_VERSION_NAME || "1.0.0";

function fileExists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readFile(p) {
  return fs.readFileSync(p, "utf8");
}

function writeFile(p, content) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content, "utf8");
}

function upsertLine(content, startsWith, line) {
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.startsWith(startsWith));
  if (idx >= 0) lines[idx] = line;
  else lines.push(line);
  return lines.join("\n");
}

function replaceNumberAssignment(content, key, value) {
  // Matches: key = 22  OR  key=22  OR key 22 (deprecated)
  const assignmentRe = new RegExp(`(^\\s*${key}\\s*=\\s*)\\d+`, "m");
  const deprecatedRe = new RegExp(`(^\\s*${key}\\s+)(\\d+)`, "m");
  
  if (assignmentRe.test(content)) {
    return content.replace(assignmentRe, `$1${value}`);
  } else if (deprecatedRe.test(content)) {
    // Convert deprecated syntax to modern assignment syntax
    return content.replace(deprecatedRe, `$1= ${value}`);
  }
  return content;
}

function patchGradleWrapper() {
  const wrapperProps = path.join(
    ANDROID_DIR,
    "gradle",
    "wrapper",
    "gradle-wrapper.properties",
  );

  if (!fileExists(wrapperProps)) {
    console.log(
      `[patch-android] Skipping Gradle wrapper: not found at ${wrapperProps}. (Did you run 'npx cap add android'?)`,
    );
    return;
  }

  const desired = `distributionUrl=https\\://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip`;
  const before = readFile(wrapperProps);
  let after = before;

  after = upsertLine(after, "distributionUrl=", desired);

  if (after !== before) {
    writeFile(wrapperProps, after);
    console.log(`[patch-android] Updated Gradle wrapper to ${GRADLE_VERSION}.`);
  } else {
    console.log(`[patch-android] Gradle wrapper already set.`);
  }
}

/**
 * Patch SDK versions by directly injecting explicit values into app/build.gradle
 * This avoids relying on variables.gradle ext properties which cause AGP 8+ issues
 * 
 * CRITICAL: This function completely rewrites SDK configuration to avoid:
 * - "Cannot get property 'compileSdkVersion' on extra properties" errors
 * - Any reference to rootProject.ext or variables.gradle
 */
function patchSdkVersions() {
  const appBuildGradle = path.join(ANDROID_DIR, "app", "build.gradle");
  const variablesGradle = path.join(ANDROID_DIR, "variables.gradle");
  
  if (!fileExists(appBuildGradle)) {
    console.log(`[patch-android] Skipping SDK patch: app/build.gradle not found.`);
    return;
  }

  const before = readFile(appBuildGradle);
  let after = before;

  // ============================================================
  // STEP 1: Remove ALL references to ext/rootProject properties
  // ============================================================
  
  // Remove any rootProject.ext references (these cause the error)
  after = after.replace(/rootProject\.ext\.compileSdkVersion/g, String(COMPILE_SDK));
  after = after.replace(/rootProject\.ext\.compileSdk\w*/g, String(COMPILE_SDK));
  after = after.replace(/rootProject\.ext\.minSdkVersion/g, String(MIN_SDK));
  after = after.replace(/rootProject\.ext\.minSdk\w*/g, String(MIN_SDK));
  after = after.replace(/rootProject\.ext\.targetSdkVersion/g, String(TARGET_SDK));
  after = after.replace(/rootProject\.ext\.targetSdk\w*/g, String(TARGET_SDK));
  
  // Remove extra["..."] kotlin DSL references
  after = after.replace(/extra\["compileSdkVersion"\]/g, String(COMPILE_SDK));
  after = after.replace(/extra\["compileSdk"\]/g, String(COMPILE_SDK));
  after = after.replace(/extra\["minSdkVersion"\]/g, String(MIN_SDK));
  after = after.replace(/extra\["minSdk"\]/g, String(MIN_SDK));
  after = after.replace(/extra\["targetSdkVersion"\]/g, String(TARGET_SDK));
  after = after.replace(/extra\["targetSdk"\]/g, String(TARGET_SDK));

  // ============================================================
  // STEP 2: Replace deprecated *SdkVersion with modern *Sdk = X
  // ============================================================
  
  // Pattern: compileSdkVersion 34 or compileSdkVersion = 34 -> compileSdk = 36
  after = after.replace(/\bcompileSdkVersion\s*=?\s*\d+/g, `compileSdk = ${COMPILE_SDK}`);
  after = after.replace(/\bminSdkVersion\s*=?\s*\d+/g, `minSdk = ${MIN_SDK}`);
  after = after.replace(/\btargetSdkVersion\s*=?\s*\d+/g, `targetSdk = ${TARGET_SDK}`);

  // ============================================================
  // STEP 3: Normalize existing modern properties to correct values
  // ============================================================
  
  // compileSdk = XX -> compileSdk = COMPILE_SDK
  after = after.replace(/\bcompileSdk\s*=\s*\d+/g, `compileSdk = ${COMPILE_SDK}`);
  after = after.replace(/\bminSdk\s*=\s*\d+/g, `minSdk = ${MIN_SDK}`);
  after = after.replace(/\btargetSdk\s*=\s*\d+/g, `targetSdk = ${TARGET_SDK}`);

  // ============================================================
  // STEP 4: Inject compileSdk if completely missing
  // ============================================================
  
  if (!after.includes("compileSdk")) {
    after = after.replace(
      /(android\s*\{)/,
      `$1\n    compileSdk = ${COMPILE_SDK}`
    );
    console.log(`[patch-android] Injected compileSdk = ${COMPILE_SDK} (was missing).`);
  }

  // ============================================================
  // STEP 5: Ensure namespace is set with proper assignment syntax
  // ============================================================
  
  if (!after.includes('namespace')) {
    after = after.replace(
      /(android\s*\{)/,
      `$1\n    namespace = "app.onetap.shortcuts"`
    );
    console.log(`[patch-android] Injected namespace (was missing).`);
  } else {
    // Ensure namespace uses = syntax
    after = after.replace(/(\bnamespace)\s+(['"])/g, "$1 = $2");
  }

  if (after !== before) {
    writeFile(appBuildGradle, after);
    console.log(
      `[patch-android] Patched SDK versions in app/build.gradle (compileSdk=${COMPILE_SDK}, minSdk=${MIN_SDK}, targetSdk=${TARGET_SDK}).`,
    );
  }

  // ============================================================
  // STEP 6: Update variables.gradle if it exists (for plugins that still read it)
  // ============================================================
  
  if (fileExists(variablesGradle)) {
    const varBefore = readFile(variablesGradle);
    let varAfter = varBefore;
    
    // Update the ext block values - use space assignment since these ARE ext properties
    varAfter = varAfter.replace(/minSdkVersion\s*=\s*\d+/g, `minSdkVersion = ${MIN_SDK}`);
    varAfter = varAfter.replace(/compileSdkVersion\s*=\s*\d+/g, `compileSdkVersion = ${COMPILE_SDK}`);
    varAfter = varAfter.replace(/targetSdkVersion\s*=\s*\d+/g, `targetSdkVersion = ${TARGET_SDK}`);
    
    if (varAfter !== varBefore) {
      writeFile(variablesGradle, varAfter);
      console.log(`[patch-android] Updated variables.gradle SDK values.`);
    }
  }
}

/**
 * Add required AndroidX dependencies to app/build.gradle
 */
function patchAppDependencies() {
  const appBuildGradle = path.join(ANDROID_DIR, "app", "build.gradle");
  
  if (!fileExists(appBuildGradle)) {
    console.log(`[patch-android] Skipping dependencies patch: app/build.gradle not found.`);
    return;
  }

  const before = readFile(appBuildGradle);
  let after = before;

  // Dependencies to add
  const dependencies = [
    // SwipeRefreshLayout for DesktopWebViewActivity
    { name: "swiperefreshlayout", dep: 'implementation "androidx.swiperefreshlayout:swiperefreshlayout:1.2.0"' },
    // ExoPlayer for NativeVideoPlayerActivity (Media3)
    { name: "media3-exoplayer", dep: 'implementation "androidx.media3:media3-exoplayer:1.5.1"' },
    { name: "media3-ui", dep: 'implementation "androidx.media3:media3-ui:1.5.1"' },
    { name: "media3-common", dep: 'implementation "androidx.media3:media3-common:1.5.1"' },
    // ExifInterface for reading image orientation metadata (used for slideshow thumbnails)
    { name: "exifinterface", dep: 'implementation "androidx.exifinterface:exifinterface:1.3.7"' },
    // RecyclerView for NativePdfViewerActivity (virtualized page scrolling)
    { name: "recyclerview", dep: 'implementation "androidx.recyclerview:recyclerview:1.3.2"' },
  ];

  for (const { name, dep } of dependencies) {
    if (!after.includes(name)) {
      // Find the dependencies block and add the dependency
      const dependenciesMatch = after.match(/dependencies\s*\{/);
      if (dependenciesMatch) {
        const insertPos = dependenciesMatch.index + dependenciesMatch[0].length;
        after = after.slice(0, insertPos) + 
                `\n    ${dep}` + 
                after.slice(insertPos);
      }
    }
  }

  if (after !== before) {
    writeFile(appBuildGradle, after);
    console.log(`[patch-android] Added dependencies to app/build.gradle (SwipeRefreshLayout, ExoPlayer/Media3, RecyclerView).`);
  } else {
    console.log(`[patch-android] All dependencies already present.`);
  }
}

/**
 * Configure version code and version name in app/build.gradle
 * Uses modern Gradle assignment syntax (= operator)
 */
function patchVersionInfo() {
  const appBuildGradle = path.join(ANDROID_DIR, "app", "build.gradle");
  
  if (!fileExists(appBuildGradle)) {
    console.log(`[patch-android] Skipping version patch: app/build.gradle not found.`);
    return;
  }

  const before = readFile(appBuildGradle);
  let after = before;

  // Update versionCode - handle both deprecated and modern syntax
  const versionCodeDeprecatedRe = /versionCode\s+(\d+)/;
  const versionCodeModernRe = /versionCode\s*=\s*\d+/;
  
  if (versionCodeModernRe.test(after)) {
    after = after.replace(versionCodeModernRe, `versionCode = ${VERSION_CODE}`);
  } else if (versionCodeDeprecatedRe.test(after)) {
    after = after.replace(versionCodeDeprecatedRe, `versionCode = ${VERSION_CODE}`);
  } else {
    // Insert after defaultConfig {
    after = after.replace(
      /(defaultConfig\s*\{)/,
      `$1\n        versionCode = ${VERSION_CODE}`
    );
  }

  // Update versionName - handle both deprecated and modern syntax
  const versionNameDeprecatedRe = /versionName\s+["']([^"']+)["']/;
  const versionNameModernRe = /versionName\s*=\s*["'][^"']+["']/;
  
  if (versionNameModernRe.test(after)) {
    after = after.replace(versionNameModernRe, `versionName = "${VERSION_NAME}"`);
  } else if (versionNameDeprecatedRe.test(after)) {
    after = after.replace(versionNameDeprecatedRe, `versionName = "${VERSION_NAME}"`);
  } else {
    // Insert after versionCode
    after = after.replace(
      /(versionCode\s*=\s*\d+)/,
      `$1\n        versionName = "${VERSION_NAME}"`
    );
  }

  if (after !== before) {
    writeFile(appBuildGradle, after);
    console.log(`[patch-android] Set versionCode=${VERSION_CODE}, versionName="${VERSION_NAME}".`);
  } else {
    console.log(`[patch-android] Version info already set.`);
  }
}

/**
 * Configure release signing in app/build.gradle
 * Uses modern Gradle DSL with explicit = assignments (Gradle 9/10 safe)
 * 
 * MANDATORY: Release builds MUST have all 4 env vars set:
 *   RELEASE_STORE_FILE, RELEASE_STORE_PASSWORD, RELEASE_KEY_ALIAS, RELEASE_KEY_PASSWORD
 * If any are missing, the Gradle build will throw GradleException and fail.
 * Debug builds are unaffected.
 */
function patchReleaseSigning() {
  const appBuildGradle = path.join(ANDROID_DIR, "app", "build.gradle");
  
  if (!fileExists(appBuildGradle)) {
    console.log(`[patch-android] Skipping signing patch: app/build.gradle not found.`);
    return;
  }

  const before = readFile(appBuildGradle);
  let after = before;

  // Check if signing config already exists and is properly configured
  if (after.includes("signingConfigs {") && after.includes("release {") && after.includes("storeFile")) {
    console.log(`[patch-android] Signing config already present.`);
    return;
  }

  // STRATEGY: Define release signing config that reads env vars without throwing at config time.
  // Validation is deferred to gradle.taskGraph.whenReady so debug builds work without env vars.
  // Release builds still fail hard if any env var is missing.
  const signingConfig = `
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
`;

  // Insert signingConfigs after android {
  after = after.replace(
    /(android\s*\{)/,
    `$1${signingConfig}`
  );

  // Update release buildType to use the release signing config
  // Only sets signingConfig — minifyEnabled/shrinkResources are handled by patchBuildTypes()
  const buildTypesRe = /(buildTypes\s*\{[\s\S]*?release\s*\{)/;
  if (buildTypesRe.test(after)) {
    after = after.replace(
      buildTypesRe,
      `$1
            signingConfig = signingConfigs.release`
    );
  }

  if (after !== before) {
    writeFile(appBuildGradle, after);
    console.log(`[patch-android] Added release signing configuration (mandatory for release, optional for debug).`);
  }
}

function patchJavaVersionsInText(content) {
  let out = content;

  // Common Gradle/AGP patterns - upgrade older versions to 21
  const javaVersions = [17, 18, 19, 20];
  for (const v of javaVersions) {
    out = out.replaceAll(`JavaVersion.VERSION_${v}`, `JavaVersion.VERSION_${JAVA_TOOLCHAIN}`);
    out = out.replaceAll(`JavaLanguageVersion.of(${v})`, `JavaLanguageVersion.of(${JAVA_TOOLCHAIN})`);
    out = out.replaceAll(`jvmTarget = "${v}"`, `jvmTarget = "${JAVA_TOOLCHAIN}"`);
    out = out.replaceAll(`jvmTarget = '${v}'`, `jvmTarget = '${JAVA_TOOLCHAIN}'`);
  }

  // sourceCompatibility / targetCompatibility patterns
  out = out.replace(/sourceCompatibility\s*=?\s*JavaVersion\.VERSION_\d+/g, `sourceCompatibility = JavaVersion.VERSION_${JAVA_TOOLCHAIN}`);
  out = out.replace(/targetCompatibility\s*=?\s*JavaVersion\.VERSION_\d+/g, `targetCompatibility = JavaVersion.VERSION_${JAVA_TOOLCHAIN}`);

  return out;
}

function patchAgpVersion() {
  const candidateFiles = [
    path.join(ANDROID_DIR, "build.gradle"),
    path.join(ANDROID_DIR, "build.gradle.kts"),
    path.join(ANDROID_DIR, "settings.gradle"),
    path.join(ANDROID_DIR, "settings.gradle.kts"),
  ];

  const classpathRe = /classpath\s*['"]com\.android\.tools\.build:gradle:[\d.]+['"]/g;
  const pluginsKtsRe = /id\(\s*["']com\.android\.(application|library)["']\s*\)\s*version\s*["'][\d.]+["']/g;
  const pluginsGroovyRe = /id\s+["']com\.android\.(application|library)["']\s+version\s+["'][\d.]+["']/g;

  let touched = false;

  for (const filePath of candidateFiles) {
    if (!fileExists(filePath)) continue;

    const before = readFile(filePath);
    let after = before;

    // Legacy buildscript classpath
    after = after.replace(classpathRe, `classpath 'com.android.tools.build:gradle:${AGP_VERSION}'`);

    // Plugins DSL (KTS and Groovy)
    after = after.replace(pluginsKtsRe, (m) => m.replace(/version\s*["'][\d.]+["']/, `version "${AGP_VERSION}"`));
    after = after.replace(pluginsGroovyRe, (m) => m.replace(/version\s+["'][\d.]+["']/, `version '${AGP_VERSION}'`));

    if (after !== before) {
      writeFile(filePath, after);
      console.log(`[patch-android] Updated Android Gradle Plugin references in ${path.relative(process.cwd(), filePath)} to ${AGP_VERSION}.`);
      touched = true;
    }
  }

  if (!touched) {
    console.log(`[patch-android] No AGP version references found to patch.`);
  }
}

function patchJavaVersions() {
  if (!fileExists(ANDROID_DIR)) return;

  const exts = new Set([".gradle", ".gradle.kts", ".properties"]);

  /** @param {string} dir */
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip build outputs
        if (entry.name === "build" || entry.name === ".gradle") continue;
        walk(full);
        continue;
      }

      const ext = path.extname(entry.name);
      if (!exts.has(ext)) continue;

      const before = readFile(full);
      const after = patchJavaVersionsInText(before);
      if (after !== before) {
        writeFile(full, after);
        console.log(
          `[patch-android] Patched Java toolchain references in ${path.relative(process.cwd(), full)} (-> ${JAVA_TOOLCHAIN}).`,
        );
      }
    }
  }

  walk(ANDROID_DIR);
}

function detectJdk21Home() {
  if (process.env.JAVA_HOME_21 && process.env.JAVA_HOME_21.trim()) {
    return process.env.JAVA_HOME_21.trim();
  }

  const fromJavaHome = process.env.JAVA_HOME?.trim();
  if (fromJavaHome && fromJavaHome.includes("java-21")) return fromJavaHome;

  // Common Ubuntu/Debian paths
  const ubuntuDefault = "/usr/lib/jvm/java-21-openjdk-amd64";
  if (fileExists(ubuntuDefault)) return ubuntuDefault;

  // macOS paths
  const macosDefault = "/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home";
  if (fileExists(macosDefault)) return macosDefault;

  return null;
}

function patchGradleJavaHome() {
  const gradleProps = path.join(ANDROID_DIR, "gradle.properties");

  const jdk21 = detectJdk21Home();
  if (!jdk21) {
    console.log(
      `[patch-android] Skipping org.gradle.java.home: JDK 21 not detected. Install OpenJDK 21 or set JAVA_HOME_21, then re-run this script.`,
    );
    return;
  }

  const before = fileExists(gradleProps) ? readFile(gradleProps) : "";
  let after = before;

  // Set Java home
  after = upsertLine(after, "org.gradle.java.home=", `org.gradle.java.home=${jdk21}`);

  // Enable toolchain auto-provisioning for dependencies that might need it
  after = upsertLine(after, "org.gradle.java.installations.auto-download=", "org.gradle.java.installations.auto-download=true");

  // Suppress compileSdk warning when targeting newer SDKs than the tested AGP range
  after = upsertLine(after, "android.suppressUnsupportedCompileSdk=", `android.suppressUnsupportedCompileSdk=${COMPILE_SDK}`);

  // Android-specific properties for better compatibility
  after = upsertLine(after, "android.useAndroidX=", "android.useAndroidX=true");
  after = upsertLine(after, "android.enableJetifier=", "android.enableJetifier=true");

  if (after !== before) {
    writeFile(gradleProps, after.endsWith("\n") ? after : after + "\n");
    console.log(
      `[patch-android] Set org.gradle.java.home to JDK 21 (${jdk21}).`,
    );
  } else {
    console.log(`[patch-android] org.gradle.java.home already set.`);
  }
}

/**
 * Recursively copy files from source to destination
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 */
function copyDirRecursive(src, dest) {
  if (!fileExists(src)) return;
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      ensureDir(destPath);
      copyDirRecursive(srcPath, destPath);
    } else {
      ensureDir(path.dirname(destPath));
      fs.copyFileSync(srcPath, destPath);
      console.log(`[patch-android] Copied: ${path.relative(process.cwd(), destPath)}`);
    }
  }
}

/**
 * Copy custom native files from native/android/ to android/
 * This merges our custom Java files, manifest, and resources into the generated project
 */
function copyNativeFiles() {
  if (!fileExists(NATIVE_ANDROID_DIR)) {
    console.log(`[patch-android] No native/android/ directory found, skipping native file copy.`);
    return;
  }
  
  console.log(`[patch-android] Copying custom native files from native/android/ to android/...`);
  copyDirRecursive(NATIVE_ANDROID_DIR, ANDROID_DIR);
  console.log(`[patch-android] Native files copied successfully.`);
}

/**
 * Modernize Gradle DSL syntax project-wide for Gradle 9/10 compatibility
 * 
 * This function performs a comprehensive sweep of ALL Gradle files to:
 * - Remove deprecated jcenter() repository
 * - Fix ALL deprecated property assignment syntax (space -> =)
 * - Update deprecated dependency configurations
 * - Fix lintOptions -> lint migration
 * - Remove flatDir usage warnings
 * - Fix shrinkResources/minifyEnabled configuration
 * - Ensure ALL boolean and string properties use = assignment
 */
function patchGradleModernization() {
  if (!fileExists(ANDROID_DIR)) return;

  const exts = new Set([".gradle", ".gradle.kts"]);
  let patchedCount = 0;

  function modernizeGradleContent(content, filePath) {
    let out = content;

    // ============================================================
    // REPOSITORY CLEANUP
    // ============================================================
    
    // Remove deprecated jcenter() repository
    out = out.replace(/\s*jcenter\(\)\s*\n?/g, "\n");
    
    // ============================================================
    // DEPENDENCY CONFIGURATION MODERNIZATION
    // ============================================================
    
    // Fix deprecated dependency configurations
    out = out.replace(/\bcompile\s+(['"])/g, "implementation $1");
    out = out.replace(/\btestCompile\s+(['"])/g, "testImplementation $1");
    out = out.replace(/\bandroidTestCompile\s+(['"])/g, "androidTestImplementation $1");
    out = out.replace(/\bprovided\s+(['"])/g, "compileOnly $1");
    out = out.replace(/\bapk\s+(['"])/g, "runtimeOnly $1");
    
    // ============================================================
    // BLOCK NAME MIGRATIONS (AGP 8+)
    // ============================================================
    
    // Fix deprecated lintOptions -> lint
    out = out.replace(/\blintOptions\s*\{/g, "lint {");
    
    // Fix deprecated packagingOptions -> packaging (AGP 8+)
    out = out.replace(/\bpackagingOptions\s*\{/g, "packaging {");
    
    // Fix deprecated dexOptions -> removed in AGP 8+ (usually can be deleted)
    // We'll comment it out rather than delete to preserve any settings
    
    // ============================================================
    // SDK VERSION PROPERTIES (CRITICAL)
    // ============================================================
    
    // Replace rootProject.ext references with explicit values
    out = out.replace(/rootProject\.ext\.compileSdkVersion/g, String(COMPILE_SDK));
    out = out.replace(/rootProject\.ext\.compileSdk\w*/g, String(COMPILE_SDK));
    out = out.replace(/rootProject\.ext\.minSdkVersion/g, String(MIN_SDK));
    out = out.replace(/rootProject\.ext\.minSdk\w*/g, String(MIN_SDK));
    out = out.replace(/rootProject\.ext\.targetSdkVersion/g, String(TARGET_SDK));
    out = out.replace(/rootProject\.ext\.targetSdk\w*/g, String(TARGET_SDK));
    
    // Replace extra["..."] Kotlin DSL references
    out = out.replace(/extra\["compileSdkVersion"\]/g, String(COMPILE_SDK));
    out = out.replace(/extra\["compileSdk"\]/g, String(COMPILE_SDK));
    out = out.replace(/extra\["minSdkVersion"\]/g, String(MIN_SDK));
    out = out.replace(/extra\["minSdk"\]/g, String(MIN_SDK));
    out = out.replace(/extra\["targetSdkVersion"\]/g, String(TARGET_SDK));
    out = out.replace(/extra\["targetSdk"\]/g, String(TARGET_SDK));
    
    // Replace deprecated SDK property names with modern equivalents
    // compileSdkVersion NUMBER -> compileSdk = NUMBER
    out = out.replace(/\bcompileSdkVersion\s+(\d+)/g, `compileSdk = $1`);
    out = out.replace(/\bminSdkVersion\s+(\d+)/g, `minSdk = $1`);
    out = out.replace(/\btargetSdkVersion\s+(\d+)/g, `targetSdk = $1`);
    
    // Also handle deprecated names with = sign
    out = out.replace(/\bcompileSdkVersion\s*=\s*(\d+)/g, `compileSdk = $1`);
    out = out.replace(/\bminSdkVersion\s*=\s*(\d+)/g, `minSdk = $1`);
    out = out.replace(/\btargetSdkVersion\s*=\s*(\d+)/g, `targetSdk = $1`);
    
    // ============================================================
    // STRING PROPERTY ASSIGNMENTS (must use =)
    // ============================================================
    
    // applicationId "..." -> applicationId = "..."
    out = out.replace(/(\bapplicationId)\s+(['"])(?!\s*=)/g, "$1 = $2");
    // namespace "..." -> namespace = "..."
    out = out.replace(/(\bnamespace)\s+(['"])(?!\s*=)/g, "$1 = $2");
    // testInstrumentationRunner "..." -> testInstrumentationRunner = "..."
    out = out.replace(/(\btestInstrumentationRunner)\s+(['"])(?!\s*=)/g, "$1 = $2");
    // proguardFiles -> handled below
    
    // ============================================================
    // BOOLEAN PROPERTY ASSIGNMENTS (must use =)
    // ============================================================
    
    // minifyEnabled true -> minifyEnabled = true
    out = out.replace(/(\bminifyEnabled)\s+(true|false)(?!\s*=)/g, "$1 = $2");
    // shrinkResources true -> shrinkResources = true
    out = out.replace(/(\bshrinkResources)\s+(true|false)(?!\s*=)/g, "$1 = $2");
    // debuggable true -> debuggable = true
    out = out.replace(/(\bdebuggable)\s+(true|false)(?!\s*=)/g, "$1 = $2");
    // jniDebuggable true -> jniDebuggable = true
    out = out.replace(/(\bjniDebuggable)\s+(true|false)(?!\s*=)/g, "$1 = $2");
    // renderscriptDebuggable true -> renderscriptDebuggable = true
    out = out.replace(/(\brenderscriptDebuggable)\s+(true|false)(?!\s*=)/g, "$1 = $2");
    // zipAlignEnabled true -> zipAlignEnabled = true
    out = out.replace(/(\bzipAlignEnabled)\s+(true|false)(?!\s*=)/g, "$1 = $2");
    // multiDexEnabled true -> multiDexEnabled = true
    out = out.replace(/(\bmultiDexEnabled)\s+(true|false)(?!\s*=)/g, "$1 = $2");
    // crunchPngs true -> crunchPngs = true
    out = out.replace(/(\bcrunchPngs)\s+(true|false)(?!\s*=)/g, "$1 = $2");
    // testCoverageEnabled true -> testCoverageEnabled = true
    out = out.replace(/(\btestCoverageEnabled)\s+(true|false)(?!\s*=)/g, "$1 = $2");
    // pseudoLocalesEnabled true -> pseudoLocalesEnabled = true
    out = out.replace(/(\bpseudoLocalesEnabled)\s+(true|false)(?!\s*=)/g, "$1 = $2");
    
    // ============================================================
    // NUMERIC PROPERTY ASSIGNMENTS (must use =)
    // ============================================================
    
    // versionCode 1 -> versionCode = 1
    out = out.replace(/(\bversionCode)\s+(\d+)(?!\s*=)/g, "$1 = $2");
    // versionName "1.0" -> versionName = "1.0"
    out = out.replace(/(\bversionName)\s+(['"])([^'"]*)\2(?!\s*=)/g, '$1 = $2$3$2');
    
    // ============================================================
    // SIGNING CONFIG ASSIGNMENTS (must use =)
    // ============================================================
    
    // signingConfig signingConfigs.debug -> signingConfig = signingConfigs.debug
    out = out.replace(/(\bsigningConfig)\s+(signingConfigs\.\w+)(?!\s*=)/g, "$1 = $2");
    
    // ============================================================
    // SHRINK RESOURCES FIX (CRITICAL)
    // ============================================================
    
    // shrinkResources = true requires minifyEnabled = true
    // If we find shrinkResources = true but minifyEnabled = false, fix it
    if (out.includes("shrinkResources = true") && out.includes("minifyEnabled = false")) {
      // Disable shrinkResources since minify is disabled
      out = out.replace(/shrinkResources\s*=\s*true/g, "shrinkResources = false");
    }
    
    // ============================================================
    // FLATDIR HANDLING
    // ============================================================
    
    // flatDir is deprecated - add a comment warning
    // We don't remove it as it may break builds, but we note it
    if (out.includes("flatDir")) {
      console.log(`[patch-android] Warning: flatDir usage detected in ${filePath}. Consider migrating to Maven repository.`);
    }
    
    return out;
  }

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip build outputs and cache directories
        if (entry.name === "build" || entry.name === ".gradle" || entry.name === ".cxx") continue;
        walk(full);
        continue;
      }

      const ext = path.extname(entry.name);
      if (!exts.has(ext)) continue;

      const before = readFile(full);
      const after = modernizeGradleContent(before, full);
      if (after !== before) {
        writeFile(full, after);
        console.log(`[patch-android] Modernized Gradle syntax in ${path.relative(process.cwd(), full)}`);
        patchedCount++;
      }
    }
  }

  walk(ANDROID_DIR);
  
  if (patchedCount > 0) {
    console.log(`[patch-android] Modernized ${patchedCount} Gradle file(s) for Gradle 9/10 compatibility.`);
  } else {
    console.log(`[patch-android] All Gradle files already use modern syntax.`);
  }
}

/**
 * Fix build types to ensure shrinkResources is compatible with minifyEnabled
 * CRITICAL: shrinkResources = true REQUIRES minifyEnabled = true
 */
function patchBuildTypes() {
  const appBuildGradle = path.join(ANDROID_DIR, "app", "build.gradle");
  
  if (!fileExists(appBuildGradle)) {
    return;
  }

  const before = readFile(appBuildGradle);
  let after = before;

  // Find release block and ensure correct configuration
  // Pattern: release { ... minifyEnabled = false ... shrinkResources = true ... }
  // This is INVALID - shrinkResources requires minifyEnabled = true
  
  const releaseBlockRe = /(release\s*\{[^}]*)(shrinkResources\s*=\s*)true([^}]*\})/gs;
  
  after = after.replace(releaseBlockRe, (match, before, shrinkProp, after) => {
    // Check if minifyEnabled is false in this block
    if (before.includes("minifyEnabled = false") || after.includes("minifyEnabled = false")) {
      console.log(`[patch-android] Fixed shrinkResources in release block (minifyEnabled is false).`);
      return `${before}${shrinkProp}false${after}`;
    }
    return match;
  });

  // Ensure debug block has correct settings
  const debugBlockRe = /(debug\s*\{[^}]*)(shrinkResources\s*=\s*)true([^}]*\})/gs;
  after = after.replace(debugBlockRe, (match, before, shrinkProp, after) => {
    console.log(`[patch-android] Disabled shrinkResources in debug block.`);
    return `${before}${shrinkProp}false${after}`;
  });

  if (after !== before) {
    writeFile(appBuildGradle, after);
    console.log(`[patch-android] Fixed build type configurations.`);
  }
}

/**
 * Ensure gradle.properties has forward-compatible settings
 */
function patchGradleProperties() {
  const gradleProps = path.join(ANDROID_DIR, "gradle.properties");
  if (!fileExists(gradleProps)) return;

  const before = readFile(gradleProps);
  let after = before;

  // Disable deprecated Jetifier if not needed (most modern libs don't need it)
  // But keep it enabled for safety with older Capacitor plugins
  // after = upsertLine(after, "android.enableJetifier=", "android.enableJetifier=false");

  // Enable non-transitive R classes (recommended for Gradle 8+)
  after = upsertLine(after, "android.nonTransitiveRClass=", "android.nonTransitiveRClass=true");
  
  // Enable build cache
  after = upsertLine(after, "org.gradle.caching=", "org.gradle.caching=true");
  
  // Use parallel execution
  after = upsertLine(after, "org.gradle.parallel=", "org.gradle.parallel=true");

  if (after !== before) {
    writeFile(gradleProps, after.endsWith("\n") ? after : after + "\n");
    console.log(`[patch-android] Updated gradle.properties with modern settings.`);
  }
}

function main() {
  if (!fileExists(ANDROID_DIR)) {
    console.error(
      "[patch-android] android/ folder not found. Run: npx cap add android",
    );
    process.exit(1);
  }

  console.log("[patch-android] ═══════════════════════════════════════════════════════════");
  console.log("[patch-android]     Android Project Patcher (Gradle 9/10 Compatible)");
  console.log("[patch-android] ═══════════════════════════════════════════════════════════");
  console.log("");

  // FIRST: Copy custom native files (ShortcutPlugin, MainActivity, etc.)
  copyNativeFiles();

  // THEN: Apply patches (order matters!)
  // 1. Gradle infrastructure
  patchGradleWrapper();
  patchGradleJavaHome();
  patchGradleProperties();
  
  // 2. AGP version
  patchAgpVersion();
  
  // 3. Java toolchain
  patchJavaVersions();
  
  // 4. SDK versions (CRITICAL - must run before modernization)
  patchSdkVersions();
  
  // 5. Modernize ALL Gradle syntax (catches any remaining issues)
  patchGradleModernization();
  
  // 6. Fix build types (shrinkResources/minifyEnabled)
  patchBuildTypes();
  
  // 7. Dependencies
  patchAppDependencies();
  
  // 8. Version info
  patchVersionInfo();
  
  // 9. Signing config
  patchReleaseSigning();

  console.log("");
  console.log("[patch-android] ═══════════════════════════════════════════════════════════");
  console.log("[patch-android] ✓ Done.");
  console.log("[patch-android] ═══════════════════════════════════════════════════════════");
  console.log("");
  console.log(`[patch-android] Configuration:`);
  console.log(`[patch-android]   • Gradle:     ${GRADLE_VERSION}`);
  console.log(`[patch-android]   • JDK:        ${JAVA_TOOLCHAIN}`);
  console.log(`[patch-android]   • AGP:        ${AGP_VERSION}`);
  console.log(`[patch-android]   • compileSdk: ${COMPILE_SDK}`);
  console.log(`[patch-android]   • minSdk:     ${MIN_SDK}`);
  console.log(`[patch-android]   • targetSdk:  ${TARGET_SDK}`);
  console.log("");
  console.log(`[patch-android] Version: ${VERSION_NAME} (${VERSION_CODE})`);
  console.log(`[patch-android] All Gradle files modernized for Gradle 9/10 compatibility.`);
  console.log("");
  console.log(`[patch-android] Next steps:`);
  console.log(`[patch-android]   cd android && ./gradlew bundleRelease`);
  console.log(`[patch-android]   cd android && ./gradlew bundleRelease --warning-mode all`);
}

main();
