#!/usr/bin/env bash
# scripts/run-regression-heal-locally.sh
#
# Local mirror of the `classify` + `heal` jobs in
# .github/workflows/regression-heal.yml, minus the CI-only plumbing (shared
# branch creation, commit/push per spec, report file on that branch, PR via
# `finalize`). Lets you iterate on the regression-test-healer's bounded heal
# without a workflow_dispatch/CI-wait/log-read cycle.
#
# Runs the heal step through the CLI-agnostic adapter in
# scripts/lib/adapters/, so the same task descriptor
# (scripts/lib/tasks/regression-heal.json) can execute against the GitHub
# Copilot CLI (default — matches the production workflow), the Claude Code
# CLI, or the OpenCode CLI (via the Amplify OpenAI proxy). See
# docs/claude-code-adapter.md / docs/opencode-adapter.md for what was
# verified (not guessed) about each backend's agent/permission semantics —
# the OpenCode backend has NOT been confirmed end-to-end against a live
# model; don't rely on it unattended yet.
#
# Usage:
#   ./scripts/run-regression-heal-locally.sh [spec-pattern] [--cli copilot|claude-code|opencode]
#
#     spec-pattern  Optional, forwarded to `npx playwright test <pattern>`
#                   for the flake-filter re-run — same as the workflow's
#                   `spec` dispatch input. Omit to run the full suite.
#
# CI checks out a specific failing commit (the `sha` dispatch input) before
# doing any of this. This script does NOT do that for you — it operates on
# your current working tree/checkout as-is. If you want to reproduce a
# specific CI failure, `git checkout <sha>` yourself first (and switch back
# after), same as you'd do to investigate any other failure locally.
#
# Prerequisites (same as scripts/run-manual-test-locally.sh):
#   - Copilot backend (default): `copilot` CLI installed and authenticated
#     (`copilot login`).
#   - Claude Code backend: `claude` CLI installed and authenticated.
#   - OpenCode backend: `opencode` CLI installed and `AMPLIFY_API_TOKEN` set
#     in .env (opencode.sh reads that one var out of .env itself — see
#     docs/opencode-adapter.md).
#   - A local .env with BASE_URL/APP_URL/EMAIL_ADDRESS/PASSWORD — loaded
#     automatically by playwright.config.ts via dotenv.
#
# This re-runs the Playwright suite locally, then makes one real, billed
# agent request per spec classified LOCATOR_DRIFT — same cost profile as the
# CI job for the Copilot backend (see docs/ci-setup.md, "Free-tier budget");
# neither the Claude Code nor the OpenCode backend has an equivalent
# validated cost figure — backends.claudeCode.maxBudgetUsd in the task JSON
# is left unset, and the opencode backend has no spend-cap flag at all (see
# docs/opencode-adapter.md) — tune/watch this before relying on either
# unattended. It writes/modifies real files in your
# working tree (Page Object locators) and, via scripts/bounded-run.js, its
# own unresolved-regression-failures.csv / .healing-state-regression (kept
# separate from manual-test-pipeline's dead-letter files, same as CI).
# Nothing is committed, pushed, or turned into a PR — review with
# `git status` / `git diff` afterward and discard with
# `git checkout -- <file>` if you don't want to keep the result.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/adapters/dispatch.sh"

SPEC_PATTERN=""
CLI="${AGENT_CLI:-copilot}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --cli)
      CLI="$2"
      shift 2
      ;;
    *)
      SPEC_PATTERN="$1"
      shift
      ;;
  esac
done

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "== Attempt-cap check (scripts/bounded-run.js caps per SPEC FILE, not per test — see docs) =="
node "$SCRIPT_DIR/check-healing-state.js" .healing-state-regression
echo

echo "== Re-running the suite (flake filter) ${SPEC_PATTERN:+for: $SPEC_PATTERN}=="
set +e
npx playwright test $SPEC_PATTERN
set -e

if [ ! -f playwright-report/results.json ]; then
  echo "No results.json produced (playwright test itself failed to run) — treating as zero failures to classify; check the output above." >&2
  echo "[]" > "$TMP_DIR/classified.json"
else
  node scripts/parse-test-results.js playwright-report/results.json > "$TMP_DIR/failures.json"
  node scripts/classify-regression-failure.js "$TMP_DIR/failures.json" > "$TMP_DIR/classified.json"
fi

echo
echo "== Classification summary =="
node -e "
const fs = require('fs');
const classified = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const healableFile = process.argv[2];

if (classified.length === 0) {
  console.log('No failures survived the flake-filter re-run — nothing to classify.');
  fs.writeFileSync(healableFile, '');
  process.exit(0);
}

const needsReview = classified.filter((f) => f.classification !== 'LOCATOR_DRIFT');
const healable = [...new Set(
  classified.filter((f) => f.classification === 'LOCATOR_DRIFT').map((f) => f.file)
)];

if (needsReview.length > 0) {
  console.log('NEEDS HUMAN REVIEW (never auto-healed):');
  for (const f of needsReview) {
    console.log(\`  - \${f.file} — \${f.title} [\${f.classification}]\`);
  }
}
if (healable.length > 0) {
  console.log('HEALABLE (LOCATOR_DRIFT — will attempt below):');
  for (const file of healable) console.log(\`  - \${file}\`);
} else {
  console.log('HEALABLE: none — every failure needs human review.');
}

fs.writeFileSync(healableFile, healable.join('\n'));
" "$TMP_DIR/classified.json" "$TMP_DIR/healable.txt"

mapfile -t HEALABLE_FILES < "$TMP_DIR/healable.txt"
if [ "${#HEALABLE_FILES[@]}" -eq 0 ] || [ -z "${HEALABLE_FILES[0]:-}" ]; then
  echo
  echo "Nothing to heal. Done."
  exit 0
fi

for SPEC_FILE in "${HEALABLE_FILES[@]}"; do
  echo
  echo "== Attempting bounded heal for: $SPEC_FILE =="

  PRE_COUNT=0
  if [ -f unresolved-regression-failures.csv ]; then
    PRE_COUNT=$(wc -l < unresolved-regression-failures.csv)
  fi

  # Task descriptor + tool policy live in scripts/lib/tasks/regression-heal.json
  # and are shared across backends — see scripts/lib/adapters/ (dispatch.sh,
  # copilot.sh, claude-code.sh, opencode.sh) and docs/claude-code-adapter.md /
  # docs/opencode-adapter.md for what's verified per backend.
  # --csv-path/--state-dir (baked into the prompt template) keep this
  # pipeline's dead-letter state separate from
  # scripts/run-manual-test-locally.sh's.
  set +e
  run_agent_task "$SCRIPT_DIR/lib/tasks/regression-heal.json" "agent-output-regression-heal-local.log" "$CLI" "SPEC_FILE=$SPEC_FILE"
  AGENT_EXIT=$?
  set -e

  POST_COUNT=0
  if [ -f unresolved-regression-failures.csv ]; then
    POST_COUNT=$(wc -l < unresolved-regression-failures.csv)
  fi

  if [ "$POST_COUNT" -gt "$PRE_COUNT" ]; then
    echo "-> $SPEC_FILE: hard-stop (hit the 3-attempt heal cap — row added to unresolved-regression-failures.csv)"
  elif [ "$AGENT_EXIT" -eq 0 ]; then
    echo "-> $SPEC_FILE: success"
  else
    echo "-> $SPEC_FILE: incomplete ($CLI exited $AGENT_EXIT)"
  fi
done

echo
echo "== Done. Review the result: =="
echo "  git status"
echo "  git diff"
echo "Discard anything you don't want to keep with: git checkout -- <file>"
