#!/usr/bin/env node
/**
 * Sync Translation Files
 * 
 * This script reads the bundled English translation file (source of truth)
 * and syncs all other locale files in public/locales by:
 * 1. Adding missing keys with English text as placeholder
 * 2. Removing keys that no longer exist in English
 * 3. Maintaining the same structure and key order
 * 
 * Usage: node scripts/sync-translations.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Paths
const ENGLISH_SOURCE = join(rootDir, 'src/i18n/locales/en.json');
const LOCALES_DIR = join(rootDir, 'public/locales');

// Supported languages (excluding English which is the source)
const TARGET_LANGUAGES = ['es', 'pt', 'hi', 'de', 'ja', 'ar', 'fr', 'it', 'zh', 'ko', 'ru', 'th', 'vi'];

/**
 * Recursively get all keys from an object with their paths
 */
function getAllKeys(obj, prefix = '') {
  const keys = [];
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys.push(...getAllKeys(obj[key], path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

/**
 * Get a value from an object using a dot-separated path
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Set a value in an object using a dot-separated path
 */
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

/**
 * Delete a value from an object using a dot-separated path
 */
function deleteNestedValue(obj, path) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) return;
    current = current[key];
  }
  delete current[keys[keys.length - 1]];
  
  // Clean up empty parent objects
  if (keys.length > 1) {
    const parentPath = keys.slice(0, -1).join('.');
    const parent = getNestedValue(obj, parentPath);
    if (parent && typeof parent === 'object' && Object.keys(parent).length === 0) {
      deleteNestedValue(obj, parentPath);
    }
  }
}

/**
 * Rebuild object maintaining the order from the source
 */
function rebuildInOrder(sourceObj, targetObj, sourcePrefix = '', targetPrefix = '') {
  const result = {};
  
  for (const key of Object.keys(sourceObj)) {
    const sourcePath = sourcePrefix ? `${sourcePrefix}.${key}` : key;
    const sourceValue = sourceObj[key];
    
    if (typeof sourceValue === 'object' && sourceValue !== null && !Array.isArray(sourceValue)) {
      // Recurse for nested objects
      const targetValue = targetObj?.[key] || {};
      result[key] = rebuildInOrder(sourceValue, targetValue, sourcePath, sourcePath);
    } else {
      // Use target value if exists, otherwise use source (English) as placeholder
      result[key] = targetObj?.[key] !== undefined ? targetObj[key] : sourceValue;
    }
  }
  
  return result;
}

/**
 * Sync a single locale file
 */
function syncLocale(langCode, englishData) {
  const localePath = join(LOCALES_DIR, `${langCode}.json`);
  let localeData = {};
  
  try {
    const content = readFileSync(localePath, 'utf8');
    localeData = JSON.parse(content);
  } catch (e) {
    console.log(`  Creating new file for ${langCode}`);
  }
  
  const englishKeys = getAllKeys(englishData);
  const localeKeys = getAllKeys(localeData);
  
  // Find missing and extra keys
  const missingKeys = englishKeys.filter(key => !localeKeys.includes(key));
  const extraKeys = localeKeys.filter(key => !englishKeys.includes(key));
  
  // Rebuild the locale data in the same order as English
  const syncedData = rebuildInOrder(englishData, localeData);
  
  // Write the synced file
  writeFileSync(localePath, JSON.stringify(syncedData, null, 2) + '\n', 'utf8');
  
  return { missingKeys, extraKeys, total: englishKeys.length };
}

// Main execution
console.log('🌐 Syncing translation files...\n');
console.log(`📖 Source: ${ENGLISH_SOURCE}`);
console.log(`📁 Target: ${LOCALES_DIR}\n`);

// Read English source
const englishContent = readFileSync(ENGLISH_SOURCE, 'utf8');
const englishData = JSON.parse(englishContent);
const totalKeys = getAllKeys(englishData).length;

console.log(`📊 English source has ${totalKeys} translation keys\n`);

// Also sync public/locales/en.json to match the source
console.log('Syncing en.json (mirror of source)...');
writeFileSync(join(LOCALES_DIR, 'en.json'), JSON.stringify(englishData, null, 2) + '\n', 'utf8');
console.log('  ✓ en.json synced\n');

// Sync each target language
let totalMissing = 0;
let totalExtra = 0;

for (const lang of TARGET_LANGUAGES) {
  console.log(`Syncing ${lang}.json...`);
  const { missingKeys, extraKeys, total } = syncLocale(lang, englishData);
  
  if (missingKeys.length > 0) {
    console.log(`  + Added ${missingKeys.length} missing keys (English placeholders)`);
    totalMissing += missingKeys.length;
  }
  if (extraKeys.length > 0) {
    console.log(`  - Removed ${extraKeys.length} obsolete keys`);
    totalExtra += extraKeys.length;
  }
  if (missingKeys.length === 0 && extraKeys.length === 0) {
    console.log(`  ✓ Already in sync`);
  }
}

console.log('\n✅ Sync complete!');
console.log(`   Total keys per file: ${totalKeys}`);
console.log(`   Keys added (as English placeholders): ${totalMissing}`);
console.log(`   Obsolete keys removed: ${totalExtra}`);
console.log('\n📝 Note: Added keys use English text as placeholder. These should be professionally translated.');
