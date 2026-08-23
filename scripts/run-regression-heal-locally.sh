#!/usr/bin/env bash
# scripts/run-regression-heal-locally.sh
#
# Local mirror of the `classify` + `heal` jobs in
# .github/workflows/regression-heal.yml, minus the CI-only plumbing (shared
# branch creation, commit/push per spec, report file on that branch, PR via
# `finalize`). Lets you iterate on the regression-test-healer's bounded heal
# without a workflow_dispatch/CI-wait/log-read cycle.
#
# Usage:
#   ./scripts/run-regression-heal-locally.sh [spec-pattern]
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
#   - `copilot` CLI installed and authenticated (`copilot login`).
#   - A local .env with BASE_URL/APP_URL/EMAIL_ADDRESS/PASSWORD — loaded
#     automatically by playwright.config.ts via dotenv.
#
# This re-runs the Playwright suite locally, then makes one real, billed
# Copilot CLI request per spec classified LOCATOR_DRIFT — same cost profile
# as the CI job (see docs/ci-setup.md, "Free-tier budget"). It writes/
# modifies real files in your working tree (Page Object locators) and, via
# scripts/bounded-run.js, its own unresolved-regression-failures.csv /
# .healing-state-regression (kept separate from manual-test-pipeline's dead-
# letter files, same as CI). Nothing is committed, pushed, or turned into a
# PR — review with `git status` / `git diff` afterward and discard with
# `git checkout -- <file>` if you don't want to keep the result.

set -euo pipefail

SPEC_PATTERN="${1:-}"

if ! command -v copilot >/dev/null 2>&1; then
  echo "copilot CLI not found on PATH. Install with: npm install -g @github/copilot" >&2
  exit 1
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

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

  # Same prompt/allow-deny tool set as regression-heal.yml's `heal` job —
  # see its comments for why bare 'shell'/'write' allow plus these explicit
  # denies is what actually works with the Copilot CLI's permission matching.
  # --csv-path/--state-dir keep this pipeline's dead-letter state separate
  # from scripts/run-manual-test-locally.sh's.
  set +e
  copilot -p "The spec ${SPEC_FILE} is failing in the regression suite and has already been classified LOCATOR_DRIFT (selector/element-state problem, not a value comparison) by scripts/classify-regression-failure.js. Investigate and fix ONLY the locator/element-state issue; you must NEVER change an expect()'s expected value or loosen an assertion — if the real fix would require that, stop and make no change. Follow .github/agents/regression-test-healer.agent.md, AGENTS.md, and the pom-conventions + playwright-cli skills exactly. Run tests ONLY via: node scripts/bounded-run.js --csv-path=unresolved-regression-failures.csv --state-dir=.healing-state-regression ${SPEC_FILE} — never call npx playwright test or npm test directly, and never omit those two flags." \
    --agent regression-test-healer \
    --allow-tool 'shell' \
    --allow-tool 'write' \
    --deny-tool 'shell(git add:*)' \
    --deny-tool 'shell(git commit:*)' \
    --deny-tool 'shell(git push:*)' \
    --deny-tool 'shell(npx playwright test:*)' \
    --deny-tool 'shell(npm test:*)' \
    --deny-tool 'read(.env)' \
    --deny-tool 'read(.auth/*)' \
    --no-ask-user \
    --model auto \
    --max-ai-credits=40
  COPILOT_EXIT=$?
  set -e

  POST_COUNT=0
  if [ -f unresolved-regression-failures.csv ]; then
    POST_COUNT=$(wc -l < unresolved-regression-failures.csv)
  fi

  if [ "$POST_COUNT" -gt "$PRE_COUNT" ]; then
    echo "-> $SPEC_FILE: hard-stop (hit the 3-attempt heal cap — row added to unresolved-regression-failures.csv)"
  elif [ "$COPILOT_EXIT" -eq 0 ]; then
    echo "-> $SPEC_FILE: success"
  else
    echo "-> $SPEC_FILE: incomplete (copilot exited $COPILOT_EXIT)"
  fi
done

echo
echo "== Done. Review the result: =="
echo "  git status"
echo "  git diff"
echo "Discard anything you don't want to keep with: git checkout -- <file>"
