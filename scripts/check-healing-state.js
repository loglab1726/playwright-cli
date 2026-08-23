#!/usr/bin/env node
/**
 * scripts/check-healing-state.js
 *
 * Read-only visibility into scripts/bounded-run.js's per-spec-file attempt
 * counters, checked BEFORE spending a generation/heal session rather than
 * discovering a stale lock only after the agent has already written code.
 *
 * bounded-run.js's 3-attempt cap is keyed by spec FILE path (not by
 * individual test) — see its own docstring. That means appending a brand
 * new test into an existing shared spec file inherits whatever attempt
 * count is already on that file from a completely unrelated, possibly
 * stale, test failure. This script doesn't change that behavior (the cap
 * stays file-scoped and durable on purpose — see docs/ci-setup.md and
 * .github/agents/*.agent.md's "3-Strike Rule" for why); it just makes the
 * current state visible on demand instead of surprising you mid-run.
 *
 * Usage:
 *   node scripts/check-healing-state.js
 *     Checks both known state dirs: .healing-state (manual-test-pipeline)
 *     and .healing-state-regression (regression-heal).
 *
 *   node scripts/check-healing-state.js <dir> [<dir> ...]
 *     Checks only the given state dir(s) instead of the defaults.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MAX_ATTEMPTS = 3;
const DEFAULT_DIRS = ['.healing-state', '.healing-state-regression'];

function checkDir(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = [];
  for (const filename of fs.readdirSync(dir)) {
    if (!filename.endsWith('.json')) continue;
    const filePath = path.join(dir, filename);
    let attempts;
    try {
      attempts = JSON.parse(fs.readFileSync(filePath, 'utf8')).attempts;
    } catch {
      entries.push({ dir, filename, attempts: null, corrupt: true });
      continue;
    }
    entries.push({ dir, filename, attempts, corrupt: false });
  }
  return entries;
}

function main() {
  const dirs = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_DIRS;
  const all = dirs.flatMap(checkDir);

  if (all.length === 0) {
    console.log(`No attempt-state files found in: ${dirs.join(', ')}`);
    return;
  }

  const locked = all.filter((e) => e.corrupt || e.attempts >= MAX_ATTEMPTS);
  const inProgress = all.filter((e) => !e.corrupt && e.attempts > 0 && e.attempts < MAX_ATTEMPTS);

  if (locked.length > 0) {
    console.log(`LOCKED (at/over ${MAX_ATTEMPTS}-attempt cap — bounded-run.js will hard-stop immediately for these):`);
    for (const e of locked) {
      const specName = e.filename.replace(/\.json$/, '');
      console.log(
        e.corrupt
          ? `  - ${specName} (${e.dir}) — state file is corrupt/unreadable, treat as locked until manually inspected`
          : `  - ${specName} (${e.dir}) — attempts: ${e.attempts}/${MAX_ATTEMPTS}`
      );
    }
    console.log(
      '  If you\'re about to generate or append a test into one of these files, expect an\n' +
      '  immediate hard-stop unrelated to your new test. Check the matching CSV\n' +
      '  (unresolved-test-failures.csv / unresolved-regression-failures.csv) for why it\n' +
      '  locked, confirm the underlying issue is actually fixed (e.g. re-run the file\n' +
      '  directly with `npx playwright test <file>`), then delete the state file to reset\n' +
      '  it — this is a manual, deliberate step by design, not something to automate.'
    );
  }

  if (inProgress.length > 0) {
    console.log(`${locked.length > 0 ? '\n' : ''}IN PROGRESS (attempts used, cap not yet hit):`);
    for (const e of inProgress) {
      console.log(`  - ${e.filename.replace(/\.json$/, '')} (${e.dir}) — attempts: ${e.attempts}/${MAX_ATTEMPTS}`);
    }
  }

  if (locked.length === 0 && inProgress.length === 0) {
    console.log('All tracked spec files have a clean (0-attempt) counter.');
  }
}

main();
