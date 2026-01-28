#!/usr/bin/env node
/**
 * Clean Rebuild Android Project
 * 
 * This script completely resets the Android project by:
 * 1. Deleting the android/ folder
 * 2. Running `npx cap add android`
 * 3. Running the patch script
 * 4. Running `npx cap sync android`
 * 
 * Usage:
 *   node scripts/android/clean-rebuild-android.mjs
 * 
 * Options:
 *   --skip-sync    Skip the final cap sync step
 *   --run          Also run the app after building (npx cap run android)
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ANDROID_DIR = path.resolve("android");
const PATCH_SCRIPT = path.resolve("scripts/android/patch-android-project.mjs");

// Parse command line arguments
const args = process.argv.slice(2);
const skipSync = args.includes("--skip-sync");
const runAfterBuild = args.includes("--run");

function log(message) {
  console.log(`\x1b[36m[clean-rebuild]\x1b[0m ${message}`);
}

function logSuccess(message) {
  console.log(`\x1b[32m[clean-rebuild]\x1b[0m ✓ ${message}`);
}

function logError(message) {
  console.error(`\x1b[31m[clean-rebuild]\x1b[0m ✗ ${message}`);
}

function logStep(step, total, message) {
  console.log(`\x1b[33m[${step}/${total}]\x1b[0m ${message}`);
}

function execCommand(command, description) {
  log(`Running: ${command}`);
  try {
    execSync(command, { 
      stdio: "inherit",
      env: { ...process.env, FORCE_COLOR: "1" }
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

async function main() {
  const totalSteps = runAfterBuild ? 5 : (skipSync ? 3 : 4);
  let currentStep = 0;

  console.log("\n");
  log("═══════════════════════════════════════════════════════");
  log("       Android Project Clean Rebuild");
  log("═══════════════════════════════════════════════════════");
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
  logStep(currentStep, totalSteps, "Patching Android project...");
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

  // Step 5: Run (if requested)
  if (runAfterBuild) {
    currentStep++;
    logStep(currentStep, totalSteps, "Running Android app...");
    execCommand("npx cap run android", "Launched Android app");
    console.log("");
  }

  // Done!
  console.log("");
  log("═══════════════════════════════════════════════════════");
  logSuccess("Android project rebuilt successfully!");
  log("═══════════════════════════════════════════════════════");
  console.log("");
  
  if (!runAfterBuild) {
    log("Next steps:");
    log("  • Run on device/emulator:  npx cap run android");
    log("  • Open in Android Studio:  npx cap open android");
  }
  console.log("");
}

main().catch((error) => {
  logError(`Unexpected error: ${error.message}`);
  process.exit(1);
});
