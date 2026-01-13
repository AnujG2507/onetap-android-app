#!/usr/bin/env node
/**
 * Patch the generated Capacitor Android project for:
 * - Java / Gradle compatibility (update Gradle wrapper)
 * - Minimum Android version (minSdkVersion = 31 / Android 12)
 *
 * Usage:
 *   node scripts/android/patch-android-project.mjs
 *
 * Optional env vars:
 *   JAVA_HOME_17=/path/to/jdk17   (recommended)
 */

import fs from "node:fs";
import path from "node:path";

const ANDROID_DIR = path.resolve("android");
const MIN_SDK = 31; // Android 12
const COMPILE_SDK = 36;
const TARGET_SDK = 36;
// Use Gradle 8.13 with JDK 21 for latest compatibility.
const GRADLE_VERSION = "8.13";
const JAVA_TOOLCHAIN = 21;
const AGP_VERSION = "8.7.3"; // Android Gradle Plugin compatible with Gradle 8.13

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
  // Matches: key = 22  OR  key=22
  const re = new RegExp(`(^\\s*${key}\\s*=\\s*)\\d+`, "m");
  if (re.test(content)) return content.replace(re, `$1${value}`);
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


function patchSdkVersionsInFile(filePath) {
  if (!fileExists(filePath)) return false;

  const before = readFile(filePath);
  let after = before;

  after = replaceNumberAssignment(after, "minSdkVersion", MIN_SDK);
  after = replaceNumberAssignment(after, "compileSdkVersion", COMPILE_SDK);
  after = replaceNumberAssignment(after, "targetSdkVersion", TARGET_SDK);

  if (after !== before) {
    writeFile(filePath, after);
    console.log(
      `[patch-android] Patched SDK versions in ${path.relative(process.cwd(), filePath)} (min=${MIN_SDK}, compile=${COMPILE_SDK}, target=${TARGET_SDK}).`,
    );
    return true;
  }

  return false;
}

function patchSdkVersions() {
  const variablesGradle = path.join(ANDROID_DIR, "variables.gradle");
  const appBuildGradle = path.join(ANDROID_DIR, "app", "build.gradle");

  const patchedVariables = patchSdkVersionsInFile(variablesGradle);
  const patchedAppBuild = patchSdkVersionsInFile(appBuildGradle);

  if (!patchedVariables && !patchedAppBuild) {
    console.log(
      `[patch-android] Could not patch SDK versions (no variables.gradle/app/build.gradle found). Your Android folder might be incomplete.`,
    );
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
  const buildGradle = path.join(ANDROID_DIR, "build.gradle");
  if (!fileExists(buildGradle)) return;

  const before = readFile(buildGradle);
  let after = before;

  // Update AGP version in classpath
  after = after.replace(
    /classpath\s*['"]com\.android\.tools\.build:gradle:[\d.]+['"]/g,
    `classpath 'com.android.tools.build:gradle:${AGP_VERSION}'`
  );

  if (after !== before) {
    writeFile(buildGradle, after);
    console.log(`[patch-android] Updated Android Gradle Plugin to ${AGP_VERSION}.`);
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

function main() {
  if (!fileExists(ANDROID_DIR)) {
    console.error(
      "[patch-android] android/ folder not found. Run: npx cap add android",
    );
    process.exit(1);
  }

  patchGradleWrapper();
  patchGradleJavaHome();
  patchAgpVersion();
  patchJavaVersions();
  patchSdkVersions();

  console.log("[patch-android] Done.");
  console.log(`[patch-android] Configuration: Gradle ${GRADLE_VERSION}, JDK ${JAVA_TOOLCHAIN}, compileSdk ${COMPILE_SDK}, minSdk ${MIN_SDK}`);
}

main();
