#!/usr/bin/env node
/**
 * scripts/classify-regression-failure.js
 *
 * The central safety mechanism for regression-suite healing (see
 * docs/regression-healing-plan.md). This is a pure, deterministic, regex-only
 * classifier — no LLM is ever in the stop/go decision for whether a failing
 * regression test is safe to hand to Copilot. Extends the failure table in
 * docs/pipeline-plan.md Section 5 with an explicit, conservative bias: a
 * wrong "stop" costs one extra human review; a wrong "proceed" can let an
 * agent quietly rewrite an assertion to match a real regression, defeating
 * the exact thing this suite exists to catch. Ambiguity always resolves to
 * NEEDS_REVIEW, never to LOCATOR_DRIFT.
 *
 * Classifications:
 *   LOCATOR_DRIFT     - safe to hand to the healer agent. A selector/element
 *                        state problem (timeout waiting for an element,
 *                        strict-mode violation, action timeout) with no
 *                        accompanying value comparison.
 *   ASSERTION_MISMATCH - NEVER healed automatically. An explicit
 *                        expected-vs-actual/received value comparison failed
 *                        — exactly the shape a real app regression takes.
 *                        Always routed to human review.
 *   ENVIRONMENT_ISSUE  - NEVER healed automatically. Network/connection/auth
 *                        failure. (The regression-heal workflow already
 *                        re-runs the suite once before classifying anything,
 *                        so seeing this here means it survived that
 *                        flake-filter and still deserves a human look rather
 *                        than a second silent retry.)
 *   NEEDS_REVIEW       - default-deny: anything that doesn't cleanly match
 *                        LOCATOR_DRIFT falls here, not the reverse.
 *
 * Usage:
 *   node scripts/classify-regression-failure.js <failures.json>
 *     Reads the array produced by scripts/parse-test-results.js, adds a
 *     `classification` field to each entry, prints the annotated array.
 *
 *   node scripts/classify-regression-failure.js --text="<error text>"
 *     Classifies a single error string and prints just the classification —
 *     for quick manual checks and unit tests.
 *
 * Also exports `classify(errorText)` for direct use/testing from other
 * Node scripts without shelling out.
 */

'use strict';

const fs = require('fs');

const VALUE_COMPARISON_MATCHERS = /expect(?:\.poll)?\([^)]*\)\.(toBe|toEqual|toStrictEqual|toMatch|toContain)\(/i;
const STATE_MATCHERS = /expect(?:\.poll)?\([^)]*\)\.(toBeVisible|toBeEnabled|toBeDisabled|toBeChecked|toBeHidden|toBeAttached|toBeEditable)\(/i;
const ACTION_TIMEOUT = /\.(click|fill|check|uncheck|hover|selectOption|dblclick):/i;
const LOCATOR_CALL = /(getByRole|getByLabel|getByText|getByPlaceholder|getByTestId|getByAltText|getByTitle|locator\()/i;
const STRICT_MODE_VIOLATION = /strict mode violation/i;
const TIMEOUT_WORD = /timeout/i;
const ENVIRONMENT_PATTERNS = /(ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|net::ERR_|getaddrinfo|Protocol error|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|ERR_EMPTY_RESPONSE|NS_ERROR|socket hang up|dns lookup failed|ERR_SSL)/i;
const EXPECTED_LINE = /^\s*Expected:.+/im;
const RECEIVED_LINE = /^\s*Received:.+/im;

function classify(errorText) {
  const text = String(errorText || '');

  // 1. Strongest, least ambiguous signal of a real value comparison — checked
  //    FIRST because expect.poll-based mismatches (this repo has a real one:
  //    the profileTests.spec.ts Full Name check) also say "Timeout ...
  //    exceeded", which would otherwise look like a plain locator timeout.
  const hasExpectedReceivedPair = EXPECTED_LINE.test(text) && RECEIVED_LINE.test(text);
  if (hasExpectedReceivedPair || VALUE_COMPARISON_MATCHERS.test(text)) {
    return 'ASSERTION_MISMATCH';
  }

  // 2. A locator resolving to the wrong number of elements is a structural
  //    problem, not a behavioral one — safe to heal.
  if (STRICT_MODE_VIOLATION.test(text)) {
    return 'LOCATOR_DRIFT';
  }

  // 3. A timeout on element visibility/state, or a raw action timeout, or a
  //    bare locator-call timeout — with no value comparison already matched
  //    above — is selector/element drift, not a behavior change.
  const isStateMatcherTimeout = STATE_MATCHERS.test(text) && TIMEOUT_WORD.test(text);
  const isActionTimeout = ACTION_TIMEOUT.test(text) && TIMEOUT_WORD.test(text);
  const isBareLocatorTimeout = LOCATOR_CALL.test(text) && TIMEOUT_WORD.test(text);
  if (isStateMatcherTimeout || isActionTimeout || isBareLocatorTimeout) {
    return 'LOCATOR_DRIFT';
  }

  // 4. Network/connection/auth failures — an environment flake, not a code
  //    issue. Still routed to human review (never auto-healed): the
  //    regression-heal workflow already re-ran the suite once as a flake
  //    filter before classification ever sees this, so a failure that's
  //    STILL a connection error after that deserves a look, not a second
  //    silent retry.
  if (ENVIRONMENT_PATTERNS.test(text)) {
    return 'ENVIRONMENT_ISSUE';
  }

  // 5. Default-deny. Anything ambiguous stops here, never falls through to
  //    LOCATOR_DRIFT by accident.
  return 'NEEDS_REVIEW';
}

function main() {
  const args = process.argv.slice(2);
  const textArg = args.find((a) => a.startsWith('--text='));

  if (textArg) {
    const text = textArg.slice('--text='.length);
    process.stdout.write(classify(text) + '\n');
    return;
  }

  const failuresPath = args[0];
  if (!failuresPath) {
    console.error('usage: node scripts/classify-regression-failure.js <failures.json>');
    console.error('   or: node scripts/classify-regression-failure.js --text="<error text>"');
    process.exit(1);
  }
  if (!fs.existsSync(failuresPath)) {
    console.error(`classify-regression-failure: file not found: ${failuresPath}`);
    process.exit(1);
  }

  let failures;
  try {
    failures = JSON.parse(fs.readFileSync(failuresPath, 'utf8'));
  } catch (err) {
    console.error(`classify-regression-failure: ${failuresPath} is not valid JSON (${err.message})`);
    process.exit(1);
  }
  if (!Array.isArray(failures)) {
    console.error('classify-regression-failure: expected a JSON array (from scripts/parse-test-results.js)');
    process.exit(1);
  }

  const classified = failures.map((f) => ({ ...f, classification: classify(f.error) }));
  process.stdout.write(JSON.stringify(classified, null, 2) + '\n');
}

if (require.main === module) {
  main();
}

module.exports = { classify };
