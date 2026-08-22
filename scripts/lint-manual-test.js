#!/usr/bin/env node
/**
 * scripts/lint-manual-test.js
 *
 * Used by the [lint job] (docs/pipeline-plan.md Section 7) to fail fast on a
 * malformed manual-tests/*.md file before spending any agent tokens on it.
 *
 * Required sections, per the existing template (see any file under
 * manual-tests/ for a full example, which also includes Feature Area,
 * Priority, Preconditions, Notes and Assumptions, Defect Opportunity — those
 * extra sections are good practice but not hard-enforced here; only the three
 * below are load-bearing for generation):
 *   - ### Test Case ID
 *   - ### Test Steps
 *   - ### Expected Result
 *
 * Usage:
 *   node scripts/lint-manual-test.js <file1.md> [file2.md] ...
 *
 * Exit code 0 if every given file has all required sections, 1 otherwise
 * (with a per-file report of what's missing printed to stderr).
 */

'use strict';

const fs = require('fs');

const REQUIRED_SECTIONS = ['### Test Case ID', '### Test Steps', '### Expected Result'];

function lintFile(filePath) {
  // Normalize line endings — these files are sometimes CRLF.
  const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  const missing = REQUIRED_SECTIONS.filter((section) => !content.includes(section));
  return missing;
}

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('usage: node scripts/lint-manual-test.js <file1.md> [file2.md] ...');
    process.exit(1);
  }

  let hasErrors = false;
  for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
      console.error(`FAIL ${filePath}: file not found`);
      hasErrors = true;
      continue;
    }
    const missing = lintFile(filePath);
    if (missing.length > 0) {
      console.error(`FAIL ${filePath}: missing required section(s): ${missing.join(', ')}`);
      hasErrors = true;
    } else {
      console.log(`OK   ${filePath}`);
    }
  }

  process.exit(hasErrors ? 1 : 0);
}

main();
