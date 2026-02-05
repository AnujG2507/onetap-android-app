#!/usr/bin/env node
/**
 * Clean Rebuild Android Project
 * 
 * This script completely resets the Android project by:
 * 1. Deleting the android/ folder
 * 2. Running `npx cap add android`
 * 3. Running the patch script (applies Gradle 9/10 compatibility fixes)
 * 4. Running `npx cap sync android`
 * 5. Optionally verifying Gradle build
 * 
 * Usage:
 *   node scripts/android/clean-rebuild-android.mjs
 * 
 * Options:
 *   --skip-sync      Skip the final cap sync step
 *   --run            Also run the app after building (npx cap run android)
 *   --verify         Run Gradle build verification after patching
 *   --release        Build release AAB after setup
 *   --warning-mode   Run Gradle with --warning-mode all to check for deprecations
 */

import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";

const ANDROID_DIR = path.resolve("android");
const PATCH_SCRIPT = path.resolve("scripts/android/patch-android-project.mjs");

// Parse command line arguments
const args = process.argv.slice(2);
const skipSync = args.includes("--skip-sync");
const runAfterBuild = args.includes("--run");
const verifyBuild = args.includes("--verify");
const buildRelease = args.includes("--release");
const warningMode = args.includes("--warning-mode");

function log(message) {
  console.log(`\x1b[36m[clean-rebuild]\x1b[0m ${message}`);
}

function logSuccess(message) {
  console.log(`\x1b[32m[clean-rebuild]\x1b[0m ✓ ${message}`);
}

function logWarning(message) {
  console.log(`\x1b[33m[clean-rebuild]\x1b[0m ⚠ ${message}`);
}

function logError(message) {
  console.error(`\x1b[31m[clean-rebuild]\x1b[0m ✗ ${message}`);
}

function logStep(step, total, message) {
  console.log(`\x1b[33m[${step}/${total}]\x1b[0m ${message}`);
}

function execCommand(command, description, options = {}) {
  log(`Running: ${command}`);
  try {
    execSync(command, { 
      stdio: "inherit",
      env: { ...process.env, FORCE_COLOR: "1" },
      ...options
    });
    logSuccess(description);
    return true;
  } catch (error) {
    logError(`Failed: ${description}`);
    logError(error.message);
    return false;
  }
}

function deleteDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    log(`Directory ${dirPath} does not exist, skipping delete.`);
    return true;
  }
  
  log(`Deleting ${dirPath}...`);
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    logSuccess(`Deleted ${dirPath}`);
    return true;
  } catch (error) {
    logError(`Failed to delete ${dirPath}: ${error.message}`);
    return false;
  }
}

/**
 * Check for Gradle deprecation warnings in build output
 */
function checkGradleWarnings() {
  log("Checking for Gradle deprecation warnings...");
  
  const gradlewPath = path.join(ANDROID_DIR, process.platform === "win32" ? "gradlew.bat" : "gradlew");
  
  if (!fs.existsSync(gradlewPath)) {
    logWarning("Gradle wrapper not found, skipping warning check.");
    return true;
  }

  try {
    const result = spawnSync(
      gradlewPath,
      ["help", "--warning-mode", "all"],
      {
        cwd: ANDROID_DIR,
        encoding: "utf8",
        env: { ...process.env, JAVA_OPTS: "-Xmx512m" }
      }
    );

    const output = (result.stdout || "") + (result.stderr || "");
    
    // Check for deprecation warnings
    const deprecationPatterns = [
      /deprecated/i,
      /will be removed in Gradle/i,
      /has been deprecated/i,
    ];
    
    const foundWarnings = deprecationPatterns.some(pattern => pattern.test(output));
    
    if (foundWarnings) {
      logWarning("Deprecation warnings detected in Gradle output.");
      logWarning("Run with --warning-mode to see details.");
      return false;
    }
    
    logSuccess("No deprecation warnings found.");
    return true;
  } catch (error) {
    logWarning(`Could not check for warnings: ${error.message}`);
    return true;
  }
}

/**
 * Run Gradle build verification
 */
function runGradleVerification() {
  const gradlewPath = path.join(ANDROID_DIR, process.platform === "win32" ? "gradlew.bat" : "gradlew");
  
  if (!fs.existsSync(gradlewPath)) {
    logError("Gradle wrapper not found.");
    return false;
  }

  // Make gradlew executable on Unix
  if (process.platform !== "win32") {
    try {
      fs.chmodSync(gradlewPath, "755");
    } catch (e) {
      // Ignore chmod errors
    }
  }

  const warningFlag = warningMode ? " --warning-mode all" : "";
  return execCommand(
    `${gradlewPath} assembleDebug${warningFlag}`,
    "Gradle debug build verification",
    { cwd: ANDROID_DIR }
  );
}

/**
 * Build release AAB
 */
function buildReleaseBundle() {
  const gradlewPath = path.join(ANDROID_DIR, process.platform === "win32" ? "gradlew.bat" : "gradlew");
  
  if (!fs.existsSync(gradlewPath)) {
    logError("Gradle wrapper not found.");
    return false;
  }

  // Make gradlew executable on Unix
  if (process.platform !== "win32") {
    try {
      fs.chmodSync(gradlewPath, "755");
    } catch (e) {
      // Ignore chmod errors
    }
  }

  const success = execCommand(
    `${gradlewPath} bundleRelease`,
    "Release AAB build",
    { cwd: ANDROID_DIR }
  );

  if (success) {
    const aabPath = path.join(ANDROID_DIR, "app", "build", "outputs", "bundle", "release");
    if (fs.existsSync(aabPath)) {
      const aabFiles = fs.readdirSync(aabPath).filter(f => f.endsWith(".aab"));
      if (aabFiles.length > 0) {
        log(`Release AAB: ${path.join(aabPath, aabFiles[0])}`);
      }
    }
  }

  return success;
}

async function main() {
  // Calculate total steps dynamically
  let totalSteps = 3; // Base: delete, add, patch
  if (!skipSync) totalSteps++;
  if (verifyBuild) totalSteps++;
  if (buildRelease) totalSteps++;
  if (runAfterBuild) totalSteps++;
  
  let currentStep = 0;

  console.log("\n");
  log("═══════════════════════════════════════════════════════════");
  log("       Android Project Clean Rebuild (Gradle 9/10 Ready)");
  log("═══════════════════════════════════════════════════════════");
  console.log("\n");

  // Step 1: Delete android/ folder
  currentStep++;
  logStep(currentStep, totalSteps, "Deleting android/ folder...");
  if (!deleteDirectory(ANDROID_DIR)) {
    process.exit(1);
  }
  console.log("");

  // Step 2: Add Android platform
  currentStep++;
  logStep(currentStep, totalSteps, "Adding Android platform...");
  if (!execCommand("npx cap add android", "Added Android platform")) {
    process.exit(1);
  }
  console.log("");

  // Step 3: Run patch script
  currentStep++;
  logStep(currentStep, totalSteps, "Patching Android project (Gradle 9/10 compatibility)...");
  if (!fs.existsSync(PATCH_SCRIPT)) {
    logError(`Patch script not found at ${PATCH_SCRIPT}`);
    process.exit(1);
  }
  if (!execCommand(`node "${PATCH_SCRIPT}"`, "Patched Android project")) {
    process.exit(1);
  }
  console.log("");

  // Step 4: Sync (unless skipped)
  if (!skipSync) {
    currentStep++;
    logStep(currentStep, totalSteps, "Syncing Android project...");
    if (!execCommand("npx cap sync android", "Synced Android project")) {
      process.exit(1);
    }
    console.log("");
  }

  // Step 5: Verify build (if requested)
  if (verifyBuild) {
    currentStep++;
    logStep(currentStep, totalSteps, "Verifying Gradle build...");
    if (!runGradleVerification()) {
      logWarning("Build verification failed, but continuing...");
    }
    console.log("");
  }

  // Step 6: Build release (if requested)
  if (buildRelease) {
    currentStep++;
    logStep(currentStep, totalSteps, "Building release AAB...");
    if (!buildReleaseBundle()) {
      logError("Release build failed.");
      process.exit(1);
    }
    console.log("");
  }

  // Step 7: Run (if requested)
  if (runAfterBuild) {
    currentStep++;
    logStep(currentStep, totalSteps, "Running Android app...");
    execCommand("npx cap run android", "Launched Android app");
    console.log("");
  }

  // Check for deprecation warnings (informational)
  if (!verifyBuild && !buildRelease) {
    checkGradleWarnings();
    console.log("");
  }

  // Done!
  console.log("");
  log("═══════════════════════════════════════════════════════════");
  logSuccess("Android project rebuilt successfully!");
  log("═══════════════════════════════════════════════════════════");
  console.log("");
  
  log("Build configuration:");
  log("  • Gradle: 8.13 (Gradle 9/10 compatible)");
  log("  • JDK: 21");
  log("  • compileSdk: 36");
  log("  • minSdk: 31 (Android 12+)");
  log("  • Modern Gradle DSL syntax (= assignments)");
  console.log("");
  
  if (!runAfterBuild) {
    log("Next steps:");
    log("  • Verify build:            node scripts/android/clean-rebuild-android.mjs --verify");
    log("  • Build release AAB:       node scripts/android/clean-rebuild-android.mjs --release");
    log("  • Check for warnings:      cd android && ./gradlew build --warning-mode all");
    log("  • Run on device/emulator:  npx cap run android");
    log("  • Open in Android Studio:  npx cap open android");
  }
  console.log("");
}

main().catch((error) => {
  logError(`Unexpected error: ${error.message}`);
  process.exit(1);
});
