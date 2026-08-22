#!/usr/bin/env node
/**
 * scripts/parse-test-results.js
 *
 * Used by the regression-heal workflow (.github/workflows/regression-heal.yml)
 * to turn Playwright's JSON reporter output into a flat list of failing
 * tests, each tagged with the spec file it lives in and its error text —
 * the input scripts/classify-regression-failure.js needs to decide whether a
 * failure is safe to attempt healing on.
 *
 * Playwright's JSON reporter nests results as suites[].specs[].tests[].results[]
 * (suites can nest further for describe blocks; specs sit at any depth). A
 * "failing" test here means its LAST result entry has status other than
 * 'passed'/'skipped' — retries produce multiple result entries per test, and
 * only the final one reflects the outcome after CI's own `retries: 2` config
 * in playwright.config.ts has already had its say.
 *
 * Usage:
 *   node scripts/parse-test-results.js <path-to-results.json>
 *
 * Output: JSON array of { file, title, projectName, error } printed to
 * stdout, one entry per still-failing test. Empty array (not an error) when
 * everything passed. Exits 1 only if the results file itself is missing or
 * unparseable — a clean pass is not a failure of this script.
 */

'use strict';

const fs = require('fs');

function fail(message) {
  console.error(`parse-test-results: ${message}`);
  process.exit(1);
}

function collectSpecs(suite, specs) {
  for (const spec of suite.specs || []) {
    specs.push(spec);
  }
  for (const child of suite.suites || []) {
    collectSpecs(child, specs);
  }
}

function extractFailures(reportJson) {
  const specs = [];
  for (const suite of reportJson.suites || []) {
    collectSpecs(suite, specs);
  }

  const failures = [];
  for (const spec of specs) {
    for (const test of spec.tests || []) {
      const results = test.results || [];
      const last = results[results.length - 1];
      if (!last || last.status === 'passed' || last.status === 'skipped') {
        continue;
      }
      const errorText = (last.errors && last.errors.length
        ? last.errors.map((e) => e.message || String(e)).join('\n')
        : last.error && last.error.message) || last.status;

      failures.push({
        file: spec.file,
        title: [...(spec.titlePath ? [] : []), spec.title].join(' '),
        projectName: test.projectName || '',
        error: errorText,
      });
    }
  }
  return failures;
}

function main() {
  const resultsPath = process.argv[2];
  if (!resultsPath) {
    fail('usage: node scripts/parse-test-results.js <path-to-results.json>');
  }
  if (!fs.existsSync(resultsPath)) {
    fail(`results file not found: ${resultsPath}`);
  }

  let reportJson;
  try {
    reportJson = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  } catch (err) {
    fail(`${resultsPath} is not valid JSON (${err.message})`);
  }

  const failures = extractFailures(reportJson);
  process.stdout.write(JSON.stringify(failures, null, 2) + '\n');
}

main();
