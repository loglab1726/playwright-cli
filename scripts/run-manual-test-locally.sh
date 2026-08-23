#!/usr/bin/env bash
# scripts/run-manual-test-locally.sh
#
# Local mirror of the `generate-and-run` job in
# .github/workflows/manual-test-pipeline.yml, minus the CI-only plumbing
# (branch creation, commit/push, artifact uploads). Lets you iterate on the
# Copilot CLI generate+bounded-heal step without a push/CI-wait/log-read
# cycle.
#
# Usage:
#   ./scripts/run-manual-test-locally.sh manual-tests/TC_AUTH_001_signup-form-toggle-from-login-page.md
#
# Prerequisites (same as CI):
#   - `copilot` CLI installed and authenticated (`copilot login`) — this repo
#     already has both done locally.
#   - A local .env with BASE_URL/APP_URL/EMAIL_ADDRESS/PASSWORD — already
#     present; playwright.config.ts loads it via dotenv automatically, so
#     nothing needs to be exported here.
#
# This makes real, billed Copilot CLI requests against your account — same
# cost profile as the CI job (see docs/ci-setup.md, "Free-tier budget"). It
# also writes/modifies real files in your working tree (Page Objects, spec
# files) and may run `node scripts/bounded-run.js <spec>` against the live
# app, same as CI. Nothing is committed or pushed — review with `git status`
# / `git diff` afterward and discard with `git checkout -- <file>` if you
# don't want to keep the result.

set -euo pipefail

SPEC_FILE="${1:?Usage: $0 <manual-tests/FILE.md>}"

if [ ! -f "$SPEC_FILE" ]; then
  echo "File not found: $SPEC_FILE" >&2
  exit 1
fi

if ! command -v copilot >/dev/null 2>&1; then
  echo "copilot CLI not found on PATH. Install with: npm install -g @github/copilot" >&2
  exit 1
fi

echo "== Pre-flight: skill/agent discovery =="
copilot plugins list --json || echo "::warning:: copilot plugins list failed/unavailable — continuing anyway (same tolerance as CI)."

echo
echo "== Generating, executing, and bounded-healing a Playwright test for: $SPEC_FILE =="
# NOTE on --allow-tool 'shell' (bare, allows all shell commands): `copilot
# help permissions` documents shell permission matching as happening on the
# STEM of the command, with multi-token matching (e.g. "git push")
# special-cased for git/gh only. Confirmed by direct testing that a narrower
# pattern like 'shell(node scripts/bounded-run.js:*)' NEVER matches — only the
# bare executable name is recognized — and that whack-a-moling individual
# command stems (node, then cd/echo/mkdir next, ...) doesn't scale: the agent
# routinely needs arbitrary small shell utilities during exploration. Also
# confirmed by direct testing: the explicit --deny-tool entries below still
# take effect correctly even under a bare 'shell' allow — denial genuinely
# overrides allow, as documented. So the real guarantee here is exactly what's
# explicitly denied below, not "only bounded-run.js can run" as originally
# designed — the agent could still reach Playwright some other way (its JS
# API directly, or `node ./node_modules/.bin/playwright`) without going
# through the wrapper. See docs/ci-setup.md.
#
# NOTE on --allow-tool 'write': the built-in file-edit/create tool is a
# SEPARATE permission kind from `shell(...)` — without an explicit grant,
# every file write attempt (including shell-based workarounds like `cat >`,
# `tee`, `sed -i`, `touch`) is silently denied, which is fatal since writing
# Page Objects/spec files is the entire point of this agent. Confirmed by
# direct local testing that bare `write` (no path scoping) is the pattern
# that actually works. See docs/ci-setup.md.
copilot -p "Generate, execute, and bounded-heal a Playwright test for ${SPEC_FILE}. Follow .github/copilot-instructions.md, AGENTS.md, and the pom-conventions + playwright-cli skills exactly. Run tests ONLY via node scripts/bounded-run.js <spec> — never call npx playwright test or npm test directly." \
  --agent playwright-test-generator \
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

echo
echo "== Done. Review the result: =="
echo "  git status"
echo "  git diff"
echo "Discard anything you don't want to keep with: git checkout -- <file>"
