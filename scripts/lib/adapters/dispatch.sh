#!/usr/bin/env bash
# scripts/lib/adapters/dispatch.sh
#
# CLI-agnostic dispatcher for the local pipeline-runner scripts
# (run-manual-test-locally.sh, run-regression-heal-locally.sh). Each backend
# (copilot.sh, claude-code.sh) implements the same run_agent_task_backend()
# contract; this file resolves the task descriptor's template once and picks
# which backend to source based on the requested CLI.
#
# Usage (from a caller script):
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/adapters/dispatch.sh"
#   run_agent_task <task.json> <log-file> [cli] [KEY=VALUE ...]
#
# CLI selection: explicit [cli] arg > $AGENT_CLI env var > "copilot" default
# — so existing callers that never pass a cli/--cli keep today's behavior
# (Copilot) unchanged.

set -euo pipefail

ADAPTERS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

run_agent_task() {
  local task_json="$1" log_file="$2" cli="${3:-${AGENT_CLI:-copilot}}"
  local -a template_vars=("${@:4}")

  # Deliberately created under the CURRENT directory rather than via
  # `mktemp` (which defaults to a system temp dir): on Windows/Git Bash,
  # passing a /tmp/... path as a node.exe argv gets auto-translated to a
  # short 8.3-name Windows path that Node then fails to open (confirmed
  # directly — ENOENT on a path like C:\Users\SHORTNA~1\...\tmp.xxxx even
  # though the file exists). A cwd-relative path never goes through that
  # translation.
  #
  # Cleanup is a plain `rm -f` at the normal-completion points below, NOT a
  # `trap ... RETURN` — confirmed directly that bash fires a RETURN trap when
  # ANY sourced script finishes, not just when the function itself returns,
  # so a trap set here deleted the file the instant `source
  # copilot.sh`/`claude-code.sh` below completed, before run_agent_task_backend
  # ever got to read it. A `trap ... EXIT` is safe to add alongside the
  # explicit `rm -f` calls, though — EXIT only fires when the shell process
  # itself terminates (including on Ctrl+C / an unexpected error under
  # `set -e`), never on a function or sourced-script return — so it's a
  # backstop for interruption, not a replacement for the explicit cleanup.
  local resolved_json=".agent-task-resolved-$$.json"
  trap 'rm -f "$resolved_json"' EXIT

  node "$ADAPTERS_DIR/resolve-task.js" "$task_json" "${template_vars[@]}" > "$resolved_json"

  case "$cli" in
    copilot)
      source "$ADAPTERS_DIR/copilot.sh"
      ;;
    claude-code)
      source "$ADAPTERS_DIR/claude-code.sh"
      ;;
    *)
      echo "Unknown --cli '$cli' — expected 'copilot' or 'claude-code'." >&2
      rm -f "$resolved_json"
      trap - EXIT
      return 1
      ;;
  esac

  local status=0
  run_agent_task_backend "$resolved_json" "$log_file" || status=$?
  rm -f "$resolved_json"
  trap - EXIT
  return "$status"
}
