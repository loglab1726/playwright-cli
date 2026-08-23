#!/usr/bin/env bash
# scripts/run-manual-test-locally.sh
#
# Local mirror of the `generate-and-run` job in
# .github/workflows/manual-test-pipeline.yml, minus the CI-only plumbing
# (branch creation, commit/push, artifact uploads). Lets you iterate on the
# generate+bounded-heal step without a push/CI-wait/log-read cycle.
#
# Runs through the CLI-agnostic adapter in scripts/lib/adapters/, so the same
# task descriptor (scripts/lib/tasks/manual-test-generate.json) can execute
# against either the GitHub Copilot CLI (default — matches the production
# workflow) or the Claude Code CLI. See docs/claude-code-adapter.md for what
# was verified (not guessed) about the Claude Code backend's agent/permission
# semantics.
#
# Usage:
#   ./scripts/run-manual-test-locally.sh manual-tests/TC_AUTH_001_signup-form-toggle-from-login-page.md
#   ./scripts/run-manual-test-locally.sh manual-tests/TC_AUTH_001_....md --cli claude-code
#
# Prerequisites (same as CI, for whichever --cli you use):
#   - Copilot backend (default): `copilot` CLI installed and authenticated
#     (`copilot login`) — this repo already has both done locally.
#   - Claude Code backend: `claude` CLI installed and authenticated.
#   - A local .env with BASE_URL/APP_URL/EMAIL_ADDRESS/PASSWORD — already
#     present; playwright.config.ts loads it via dotenv automatically, so
#     nothing needs to be exported here.
#
# This makes real, billed requests against your account (Copilot AI credits,
# or Claude/Anthropic usage — see docs/ci-setup.md's "Free-tier budget"
# section for the Copilot cost profile; the Claude Code backend has no
# equivalent validated cost figure yet, so backends.claudeCode.maxBudgetUsd
# in the task JSON is left unset — tune it before relying on this
# unattended). It also writes/modifies real files in your working tree (Page
# Objects, spec files) and may run `node scripts/bounded-run.js <spec>`
# against the live app, same as CI. Nothing is committed or pushed — review
# with `git status` / `git diff` afterward and discard with
# `git checkout -- <file>` if you don't want to keep the result.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/adapters/dispatch.sh"

SPEC_FILE=""
CLI="${AGENT_CLI:-copilot}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --cli)
      CLI="$2"
      shift 2
      ;;
    *)
      SPEC_FILE="$1"
      shift
      ;;
  esac
done

if [ -z "$SPEC_FILE" ]; then
  echo "Usage: $0 <manual-tests/FILE.md> [--cli copilot|claude-code]" >&2
  exit 1
fi

if [ ! -f "$SPEC_FILE" ]; then
  echo "File not found: $SPEC_FILE" >&2
  exit 1
fi

echo "== Attempt-cap check (scripts/bounded-run.js caps per SPEC FILE, not per test — see docs) =="
node "$SCRIPT_DIR/check-healing-state.js" .healing-state
echo

echo "== Generating, executing, and bounded-healing a Playwright test for: $SPEC_FILE (backend: $CLI) =="
set +e
run_agent_task "$SCRIPT_DIR/lib/tasks/manual-test-generate.json" "agent-output-manual-test-local.log" "$CLI" "SPEC_FILE=$SPEC_FILE"
RESULT=$?
set -e

echo
echo "== Done (exit $RESULT — not itself a success/failure signal, see docs/claude-code-adapter.md). Review the result: =="
echo "  git status"
echo "  git diff"
echo "Discard anything you don't want to keep with: git checkout -- <file>"
