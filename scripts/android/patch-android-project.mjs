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
const COMPILE_SDK = 34;
const TARGET_SDK = 34;
const GRADLE_VERSION = "8.7"; // 8.4+ required for recognizing Java 21

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

function detectJdk17Home() {
  if (process.env.JAVA_HOME_17 && process.env.JAVA_HOME_17.trim()) {
    return process.env.JAVA_HOME_17.trim();
  }

  const fromJavaHome = process.env.JAVA_HOME?.trim();
  if (fromJavaHome && fromJavaHome.includes("java-17")) return fromJavaHome;

  const ubuntuDefault = "/usr/lib/jvm/java-17-openjdk-amd64";
  if (fileExists(ubuntuDefault)) return ubuntuDefault;

  return null;
}

function patchGradleJavaHome() {
  const gradleProps = path.join(ANDROID_DIR, "gradle.properties");

  const jdk17 = detectJdk17Home();
  if (!jdk17) {
    console.log(
      `[patch-android] Skipping org.gradle.java.home: JDK 17 not detected. Install OpenJDK 17 or set JAVA_HOME_17, then re-run this script.`,
    );
    return;
  }

  const line = `org.gradle.java.home=${jdk17}`;
  const before = fileExists(gradleProps) ? readFile(gradleProps) : "";
  const after = upsertLine(before, "org.gradle.java.home=", line);

  if (after !== before) {
    writeFile(gradleProps, after.endsWith("\n") ? after : after + "\n");
    console.log(
      `[patch-android] Set org.gradle.java.home to JDK 17 (${jdk17}).`,
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
  patchSdkVersions();

  console.log("[patch-android] Done.");
}

main();
