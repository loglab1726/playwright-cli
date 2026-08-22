#!/usr/bin/env node
/**
 * scripts/compute-manual-test-hashes.js
 *
 * Used by the [dedup job] (see docs/pipeline-plan.md Section 7) to decide which
 * manual-tests/*.md files actually need the agent dispatched, and to update the
 * manifest after a successful generate+run.
 *
 * Manifest format (manual-test-hash-manifest.json), committed at repo root:
 *   {
 *     "manual-tests/TC_AUTH_001_signup-form-toggle-from-login-page.md": "sha256hex...",
 *     ...
 *   }
 *
 * Usage:
 *   node scripts/compute-manual-test-hashes.js check
 *     Prints a JSON array of changed/new manual-tests/*.md paths (relative to repo
 *     root) to stdout — i.e. files whose content hash differs from the manifest,
 *     or that aren't in the manifest at all. Exits 0 always; an empty array means
 *     nothing changed. This is what the [dedup job] step consumes to build the
 *     matrix for the [generate+run job].
 *
 *   node scripts/compute-manual-test-hashes.js update <file1> [file2] ...
 *     Recomputes the hash for each given path and writes it into the manifest.
 *     Called by the [generate+run job] after a file's test generation succeeds
 *     (NOT before — a file that hard-stopped should stay "changed" so the next
 *     push or manual rerun retries it, per the dead-letter behavior in Section 4).
 *
 *   node scripts/compute-manual-test-hashes.js list
 *     Prints the full current manifest as-is. Useful for debugging in CI logs.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MANUAL_TESTS_DIR = 'manual-tests';
const MANIFEST_PATH = 'manual-test-hash-manifest.json';

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (err) {
    console.error(`compute-manual-test-hashes: ${MANIFEST_PATH} is corrupt (${err.message}).`);
    console.error('Refusing to guess its contents — fix or delete it manually.');
    process.exit(1);
  }
}

function saveManifest(manifest) {
  const sorted = Object.keys(manifest)
    .sort()
    .reduce((acc, key) => {
      acc[key] = manifest[key];
      return acc;
    }, {});
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(sorted, null, 2) + '\n');
}

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function listManualTestFiles() {
  if (!fs.existsSync(MANUAL_TESTS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(MANUAL_TESTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(MANUAL_TESTS_DIR, f))
    .sort();
}

function cmdCheck() {
  const manifest = loadManifest();
  const currentFiles = listManualTestFiles();
  const changed = currentFiles.filter((filePath) => {
    const currentHash = hashFile(filePath);
    return manifest[filePath] !== currentHash;
  });
  console.log(JSON.stringify(changed, null, 2));
}

function cmdUpdate(filePaths) {
  if (filePaths.length === 0) {
    console.error('compute-manual-test-hashes: update requires at least one file path');
    process.exit(1);
  }
  const manifest = loadManifest();
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) {
      console.error(`compute-manual-test-hashes: cannot update hash, file not found: ${filePath}`);
      process.exit(1);
    }
    manifest[filePath] = hashFile(filePath);
  }
  saveManifest(manifest);
  console.log(`compute-manual-test-hashes: updated manifest for ${filePaths.length} file(s).`);
}

function cmdList() {
  console.log(JSON.stringify(loadManifest(), null, 2));
}

function main() {
  const [, , command, ...rest] = process.argv;
  switch (command) {
    case 'check':
      return cmdCheck();
    case 'update':
      return cmdUpdate(rest);
    case 'list':
      return cmdList();
    default:
      console.error('usage: node scripts/compute-manual-test-hashes.js <check|update|list> [files...]');
      process.exit(1);
  }
}

main();
