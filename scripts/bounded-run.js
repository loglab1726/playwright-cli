#!/usr/bin/env node
/**
 * scripts/bounded-run.js
 *
 * Layer A of the bounded self-healing protocol (see .github/copilot-instructions.md
 * and docs/pipeline-plan.md Section 4).
 *
 * This is the ONLY way `npx playwright test <spec>` should ever be invoked during
 * an automated generate/heal session. It enforces a hard, stateful, 3-attempt cap
 * per spec file that survives across separate `copilot -p` invocations, pipeline
 * reruns, or a context-window reset mid-session — because the counter lives in a
 * JSON file on disk, not in the agent's memory.
 *
 * Usage:
 *   node scripts/bounded-run.js <path-to-spec>
 *   node scripts/bounded-run.js --csv-path=<file> --state-dir=<dir> <path-to-spec>
 *
 * --csv-path/--state-dir let a second, independent pipeline (e.g. the
 * regression-suite healer) point at its own dead-letter CSV and attempt-state
 * directory instead of this script's defaults, so two pipelines that may run
 * concurrently never interleave writes to the same files. Omitting them
 * preserves the original behavior exactly — the default call site
 * (manual-test-pipeline.yml) is unaffected.
 *
 * Exit codes:
 *   0 - test run passed. State file cleared.
 *   1 - test run failed, attempts remain (agent may heal and retry).
 *   2 - HARD STOP: attempts exhausted (>= 3). Row appended to
 *       unresolved-test-failures.csv. Do NOT call this again for this spec
 *       until the state file is manually cleared or the test starts passing.
 *
 * Layer B (structural enforcement) lives alongside this: the Copilot CLI
 * invocation denies `shell(npx playwright test:*)` and `shell(npm test:*)`
 * outright, so the agent has no path to bypass this wrapper within a live
 * session. Layer A (this script) is what makes the cap durable; Layer B is
 * what makes it un-bypassable. Neither alone is sufficient.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MAX_ATTEMPTS = 3;
const DEFAULT_HEALING_STATE_DIR = '.healing-state';
const DEFAULT_UNRESOLVED_CSV = 'unresolved-test-failures.csv';
const CSV_HEADER = 'Timestamp, Test Name, Failing Step/Locator, Error Summary';

function fail(message) {
  console.error(`bounded-run: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  let csvPath = DEFAULT_UNRESOLVED_CSV;
  let stateDir = DEFAULT_HEALING_STATE_DIR;
  let specPath = null;

  for (const arg of argv) {
    if (arg.startsWith('--csv-path=')) {
      csvPath = arg.slice('--csv-path='.length);
    } else if (arg.startsWith('--state-dir=')) {
      stateDir = arg.slice('--state-dir='.length);
    } else if (!arg.startsWith('--')) {
      specPath = arg;
    } else {
      fail(`unrecognized flag: ${arg}`);
    }
  }

  return { csvPath, stateDir, specPath };
}

function specPathToStateFile(specPath, stateDir) {
  // Sanitize the spec path into a flat, filesystem-safe filename so nested
  // directories under tests/ don't collide or require sub-directories here.
  const safeName = specPath.replace(/[\/\\]/g, '_');
  return path.join(stateDir, `${safeName}.json`);
}

function readState(stateFile) {
  if (!fs.existsSync(stateFile)) {
    return { attempts: 0 };
  }
  try {
    const raw = fs.readFileSync(stateFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed.attempts !== 'number' || parsed.attempts < 0) {
      throw new Error('malformed attempts field');
    }
    return parsed;
  } catch (err) {
    // A corrupt state file must never silently reset the counter to 0 —
    // that would defeat the entire point of a durable cap. Fail loudly
    // instead and let a human decide whether to delete it.
    fail(
      `state file ${stateFile} exists but is unreadable/corrupt (${err.message}). ` +
      `Refusing to guess the attempt count. Inspect/delete it manually if this ` +
      `spec should be allowed to run again.`
    );
  }
}

function writeState(stateFile, state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
}

function extractErrorSummary(execError) {
  // execSync throws with stdout/stderr buffers attached. Playwright's default
  // reporter output is verbose; take a short, single-line-safe summary rather
  // than dumping the whole trace into the CSV.
  const raw = [
    execError.stdout ? execError.stdout.toString() : '',
    execError.stderr ? execError.stderr.toString() : '',
  ].join('\n');

  // Prefer the first line that looks like an actual assertion/error, not
  // Playwright's decorative box-drawing output.
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const candidate = lines.find((l) =>
    /error|expect|timeout/i.test(l) && !/^[=─-]+$/.test(l)
  );

  const summary = (candidate || lines.slice(-1)[0] || 'Unknown failure (no output captured)')
    .replace(/,/g, ';') // commas would break the naive CSV format already in use
    .slice(0, 300);

  return summary;
}

function appendUnresolvedCsv(csvPath, specPath, testName, failingStep, errorSummary) {
  const timestamp = new Date().toISOString();
  const row = [timestamp, testName, failingStep, errorSummary]
    .map((field) => String(field).replace(/,/g, ';'))
    .join(', ');

  const needsHeader = !fs.existsSync(csvPath);
  if (needsHeader) {
    fs.mkdirSync(path.dirname(csvPath) || '.', { recursive: true });
    fs.writeFileSync(csvPath, CSV_HEADER + '\n');
  }
  fs.appendFileSync(csvPath, row + '\n');
  console.error(`bounded-run: appended row to ${csvPath}`);
}

function main() {
  const { csvPath, stateDir, specPath } = parseArgs(process.argv.slice(2));
  if (!specPath) {
    fail('usage: node scripts/bounded-run.js [--csv-path=<file>] [--state-dir=<dir>] <path-to-spec>');
  }
  if (!fs.existsSync(specPath)) {
    fail(`spec file not found: ${specPath}`);
  }

  const stateFile = specPathToStateFile(specPath, stateDir);
  const state = readState(stateFile);

  if (state.attempts >= MAX_ATTEMPTS) {
    console.error(`HARD STOP: ${specPath} already exhausted ${MAX_ATTEMPTS} heal attempts.`);
    appendUnresolvedCsv(
      csvPath,
      specPath,
      specPath,
      'attempt-limit-exhausted',
      `No further heal attempts permitted after ${MAX_ATTEMPTS} tries. See prior CSV rows and ${stateDir}/ for history.`
    );
    process.exit(2);
  }

  state.attempts += 1;
  writeState(stateFile, state);
  console.log(`[HEAL ATTEMPT ${state.attempts}/${MAX_ATTEMPTS}]`);

  try {
    // Capture stdout/stderr (rather than 'inherit') so a single execution both
    // (a) streams to the CI log via the manual writes below, and (b) gives us
    // buffers to build a CSV-friendly error summary on failure — running the
    // test a second time just to capture output would double runtime/flakiness
    // risk and works against the plan's token/cost-minimization goal.
    const output = execSync(`npx playwright test ${JSON.stringify(specPath)}`, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    process.stdout.write(output);

    // Success: clear the counter so a future, unrelated change to this spec
    // starts with a fresh budget.
    if (fs.existsSync(stateFile)) {
      fs.rmSync(stateFile);
    }
    console.log(`bounded-run: ${specPath} passed on attempt ${state.attempts}. State cleared.`);
    process.exit(0);
  } catch (execError) {
    if (execError.stdout) process.stdout.write(execError.stdout);
    if (execError.stderr) process.stderr.write(execError.stderr);

    const errorSummary = extractErrorSummary(execError);

    if (state.attempts >= MAX_ATTEMPTS) {
      console.error(`HARD STOP: ${specPath} failed on attempt ${state.attempts}/${MAX_ATTEMPTS}.`);
      appendUnresolvedCsv(csvPath, specPath, specPath, 'unknown (see error summary)', errorSummary);
      process.exit(2);
    }

    console.error(`bounded-run: ${specPath} failed on attempt ${state.attempts}/${MAX_ATTEMPTS}. Attempts remain.`);
    process.exit(1);
  }
}

main();
