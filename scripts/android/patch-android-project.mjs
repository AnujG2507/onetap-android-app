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

  // Remove any references to ext/rootProject properties for SDK versions
  // These cause "Cannot get property 'compileSdkVersion' on extra properties" errors
  after = after.replace(/compileSdkVersion\s*rootProject\.ext\.compileSdkVersion/g, `compileSdk = ${COMPILE_SDK}`);
  after = after.replace(/compileSdk\s*=?\s*rootProject\.ext\.compileSdk\w*/g, `compileSdk = ${COMPILE_SDK}`);
  after = after.replace(/compileSdkVersion\s+rootProject\.ext\.compileSdk\w*/g, `compileSdk = ${COMPILE_SDK}`);
  
  after = after.replace(/minSdkVersion\s*rootProject\.ext\.minSdkVersion/g, `minSdk = ${MIN_SDK}`);
  after = after.replace(/minSdk\s*=?\s*rootProject\.ext\.minSdk\w*/g, `minSdk = ${MIN_SDK}`);
  after = after.replace(/minSdkVersion\s+rootProject\.ext\.minSdk\w*/g, `minSdk = ${MIN_SDK}`);
  
  after = after.replace(/targetSdkVersion\s*rootProject\.ext\.targetSdkVersion/g, `targetSdk = ${TARGET_SDK}`);
  after = after.replace(/targetSdk\s*=?\s*rootProject\.ext\.targetSdk\w*/g, `targetSdk = ${TARGET_SDK}`);
  after = after.replace(/targetSdkVersion\s+rootProject\.ext\.targetSdk\w*/g, `targetSdk = ${TARGET_SDK}`);

  // Replace deprecated property names with modern equivalents and explicit values
  // Handle: compileSdkVersion 34 or compileSdkVersion = 34
  after = after.replace(/compileSdkVersion\s*=?\s*\d+/g, `compileSdk = ${COMPILE_SDK}`);
  after = after.replace(/minSdkVersion\s*=?\s*\d+/g, `minSdk = ${MIN_SDK}`);
  after = after.replace(/targetSdkVersion\s*=?\s*\d+/g, `targetSdk = ${TARGET_SDK}`);

  // Update existing modern properties with correct values
  after = after.replace(/compileSdk\s*=\s*\d+/g, `compileSdk = ${COMPILE_SDK}`);
  after = after.replace(/minSdk\s*=\s*\d+/g, `minSdk = ${MIN_SDK}`);
  after = after.replace(/targetSdk\s*=\s*\d+/g, `targetSdk = ${TARGET_SDK}`);

  // If compileSdk is not present at all, inject it after "android {"
  if (!after.includes("compileSdk")) {
    after = after.replace(
      /(android\s*\{)/,
      `$1\n    compileSdk = ${COMPILE_SDK}`
    );
  }

  // Ensure namespace is set with proper syntax
  if (!after.includes('namespace')) {
    after = after.replace(
      /(android\s*\{)/,
      `$1\n    namespace = "app.onetap.shortcuts"`
    );
  }

  if (after !== before) {
    writeFile(appBuildGradle, after);
    console.log(
      `[patch-android] Patched SDK versions in app/build.gradle (compileSdk=${COMPILE_SDK}, minSdk=${MIN_SDK}, targetSdk=${TARGET_SDK}).`,
    );
  }

  // Also patch variables.gradle if it exists (for consistency)
  if (fileExists(variablesGradle)) {
    const varBefore = readFile(variablesGradle);
    let varAfter = varBefore;
    
    // Update the ext block values
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
 */
function patchReleaseSigning() {
  const appBuildGradle = path.join(ANDROID_DIR, "app", "build.gradle");
  
  if (!fileExists(appBuildGradle)) {
    console.log(`[patch-android] Skipping signing patch: app/build.gradle not found.`);
    return;
  }

  const before = readFile(appBuildGradle);
  let after = before;

  // Check if signing config already exists
  if (after.includes("signingConfigs")) {
    console.log(`[patch-android] Signing config already present.`);
    return;
  }

  // Add signingConfigs block inside android { } with modern assignment syntax
  const signingConfig = `
    signingConfigs {
        release {
            def keystorePath = System.getenv("KEYSTORE_PATH") ?: "onetap-release.jks"
            def ksFile = file(keystorePath)
            if (ksFile.exists()) {
                storeFile = ksFile
                storePassword = System.getenv("KEYSTORE_PASSWORD") ?: ""
                keyAlias = "onetap-key"
                keyPassword = System.getenv("KEY_PASSWORD") ?: ""
            }
        }
    }
`;

  // Insert signingConfigs after android {
  after = after.replace(
    /(android\s*\{)/,
    `$1${signingConfig}`
  );

  // Update release buildType to use signing config
  const buildTypesRe = /(buildTypes\s*\{[\s\S]*?release\s*\{)/;
  if (buildTypesRe.test(after)) {
    after = after.replace(
      buildTypesRe,
      `$1
            signingConfig = signingConfigs.release
            minifyEnabled = false
            shrinkResources = false`
    );
  }

  if (after !== before) {
    writeFile(appBuildGradle, after);
    console.log(`[patch-android] Added release signing configuration.`);
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
 * - Remove jcenter() repository
 * - Fix deprecated property assignment syntax
 * - Update deprecated dependency configurations
 * - Fix lintOptions -> lint migration
 */
function patchGradleModernization() {
  if (!fileExists(ANDROID_DIR)) return;

  const exts = new Set([".gradle", ".gradle.kts"]);
  let patchedCount = 0;

  function modernizeGradleContent(content, filePath) {
    let out = content;

    // Remove deprecated jcenter() repository
    out = out.replace(/\s*jcenter\(\)\s*\n?/g, "\n");
    
    // Fix deprecated dependency configurations
    out = out.replace(/\bcompile\s+(['"])/g, "implementation $1");
    out = out.replace(/\btestCompile\s+(['"])/g, "testImplementation $1");
    out = out.replace(/\bandroidTestCompile\s+(['"])/g, "androidTestImplementation $1");
    
    // Fix deprecated lintOptions -> lint
    out = out.replace(/\blintOptions\s*\{/g, "lint {");
    
    // Fix deprecated packagingOptions -> packaging (AGP 8+)
    out = out.replace(/\bpackagingOptions\s*\{/g, "packaging {");
    
    // === CRITICAL: Fix SDK version properties ===
    // Replace rootProject.ext references with explicit values
    out = out.replace(/rootProject\.ext\.compileSdkVersion/g, String(COMPILE_SDK));
    out = out.replace(/rootProject\.ext\.compileSdk/g, String(COMPILE_SDK));
    out = out.replace(/rootProject\.ext\.minSdkVersion/g, String(MIN_SDK));
    out = out.replace(/rootProject\.ext\.minSdk/g, String(MIN_SDK));
    out = out.replace(/rootProject\.ext\.targetSdkVersion/g, String(TARGET_SDK));
    out = out.replace(/rootProject\.ext\.targetSdk/g, String(TARGET_SDK));
    
    // Replace deprecated SDK property names with modern equivalents
    // compileSdkVersion NUMBER -> compileSdk = NUMBER
    out = out.replace(/\bcompileSdkVersion\s+(\d+)/g, `compileSdk = $1`);
    out = out.replace(/\bminSdkVersion\s+(\d+)/g, `minSdk = $1`);
    out = out.replace(/\btargetSdkVersion\s+(\d+)/g, `targetSdk = $1`);
    
    // Fix common deprecated property assignments (ensure = is present)
    // applicationId without =
    out = out.replace(/(\bapplicationId)\s+(['"])/g, "$1 = $2");
    // namespace without =
    out = out.replace(/(\bnamespace)\s+(['"])/g, "$1 = $2");
    // testInstrumentationRunner without =
    out = out.replace(/(\btestInstrumentationRunner)\s+(['"])/g, "$1 = $2");
    
    // Fix boolean property assignments
    out = out.replace(/(\bminifyEnabled)\s+(true|false)(?!\s*[=\)])/g, "$1 = $2");
    out = out.replace(/(\bshrinkResources)\s+(true|false)(?!\s*[=\)])/g, "$1 = $2");
    out = out.replace(/(\bdebuggable)\s+(true|false)(?!\s*[=\)])/g, "$1 = $2");
    out = out.replace(/(\bjniDebuggable)\s+(true|false)(?!\s*[=\)])/g, "$1 = $2");
    out = out.replace(/(\brenderscriptDebuggable)\s+(true|false)(?!\s*[=\)])/g, "$1 = $2");
    out = out.replace(/(\bzipAlignEnabled)\s+(true|false)(?!\s*[=\)])/g, "$1 = $2");
    
    // Fix multiDexEnabled
    out = out.replace(/(\bmultiDexEnabled)\s+(true|false)(?!\s*[=\)])/g, "$1 = $2");
    
    // Fix versionCode and versionName assignments
    out = out.replace(/(\bversionCode)\s+(\d+)(?!\s*[=\)])/g, "$1 = $2");
    out = out.replace(/(\bversionName)\s+(['"])([^'"]+)\2(?!\s*[=\)])/g, '$1 = $2$3$2');
    
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
      const after = modernizeGradleContent(before);
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

  // FIRST: Copy custom native files (ShortcutPlugin, MainActivity, etc.)
  copyNativeFiles();

  // THEN: Apply patches (order matters)
  patchGradleWrapper();
  patchGradleJavaHome();
  patchGradleProperties();
  patchAgpVersion();
  patchJavaVersions();
  patchSdkVersions();
  patchGradleModernization(); // Run after SDK versions to catch all syntax
  patchAppDependencies();
  patchVersionInfo();
  patchReleaseSigning();

  console.log("[patch-android] Done.");
  console.log(`[patch-android] Configuration: Gradle ${GRADLE_VERSION}, JDK ${JAVA_TOOLCHAIN}, compileSdk ${COMPILE_SDK}, minSdk ${MIN_SDK}`);
  console.log(`[patch-android] Version: ${VERSION_NAME} (${VERSION_CODE})`);
  console.log(`[patch-android] All Gradle files modernized for Gradle 9/10 compatibility.`);
}

main();
