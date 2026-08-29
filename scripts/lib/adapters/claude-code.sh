#!/usr/bin/env bash
# scripts/lib/adapters/claude-code.sh — Claude Code CLI backend.
#
# Implements the run_agent_task_backend(resolved_json, log_file) contract
# from dispatch.sh. Every claim below was confirmed by direct local testing
# against `claude` CLI 2.1.229, not inferred from docs alone — the same
# standard docs/ci-setup.md already holds the Copilot backend to. See
# docs/claude-code-adapter.md for the full write-up; summary of what's baked
# into the flags below:
#
#   - `--agent <name>` resolves a project subagent (.claude/agents/*.md) by
#     its frontmatter `name:` field, NOT by filename, and there is no flag to
#     point --agent at an arbitrary file path. That's why sync-persona.js
#     exists — it materializes .claude/agents/<stem>.md from the canonical
#     .github/agents/<stem>.agent.md before every run.
#   - `--permission-mode dontAsk` + explicit `--allowedTools`/
#     `--disallowedTools` is the correct headless/CI mode: it never prompts,
#     and denies anything not on the allowlist.
#   - **Windows-critical, found the hard way**: the shell tool is registered
#     as `PowerShell` on Windows, not `Bash` — a bare `Bash` allow only
#     covers a small set of commands (confirmed: `echo`, `whoami`, `dir`)
#     that get auto-approved through some other path regardless of the
#     allowlist. Anything else that needs real shell execution (confirmed:
#     `node --version`, `node -e ...`, `ls -la`, and critically `node
#     scripts/bounded-run.js <spec>` — the one command this whole pipeline
#     exists to run) was DENIED under `--allowedTools 'Bash'` alone, with
#     `decision_reason_type: "mode"` in the raw stream-json output — i.e.
#     dontAsk's own default-deny posture, not a matched deny rule. Adding
#     `PowerShell` alongside `Bash` in both --allowedTools and
#     --disallowedTools fixed it: confirmed `node scripts/bounded-run.js
#     <spec>` then executes, while `git add`/`git commit`/`git push`/`npx
#     playwright test`/`npm test` (needing BOTH `Bash(cmd *)` and
#     `PowerShell(cmd *)` deny entries, since a pattern named for one tool
#     doesn't match the other) are still correctly blocked. Passing both
#     names is harmless cross-platform — an unrecognized tool name didn't
#     error in any test. **This means every earlier "confirmed" claim in
#     this repo about a bare `Bash` allow working broadly (this file and
#     docs/claude-code-adapter.md) was wrong** — it happened to hold for the
#     specific commands tested (`echo`, `git commit`) for unrelated reasons
#     (the safe-command path, and dontAsk's default-deny respectively), not
#     because the allow rule was actually taking effect. See
#     docs/claude-code-adapter.md Section 2 for the corrected writeup.
#   - The exit code is 0 regardless of whether a permission denial occurred
#     during the session — confirmed directly, exactly like Copilot. Exit
#     code is NOT the success signal here either; the callers of
#     run_agent_task (via scripts/bounded-run.js's CSV/state-dir) remain the
#     actual source of truth.
#   - There is no "auto" model alias — `--model auto` fails outright
#     (confirmed: HTTP 404). A specific model must be set in
#     backends.claudeCode.model in the task JSON.
#   - `Read(./path)` deny patterns work as expected — confirmed by denying
#     `Read(./.env)` against a real .env containing a secret and getting a
#     refusal instead of the secret's contents.
#
# NOT verified — left as an optional pass-through, not treated as a
# success/failure signal (same caution docs/ci-setup.md already applies to
# Copilot's --max-ai-credits): the exact programmatic signal
# `--max-budget-usd` produces when a session actually hits the cap. Confirm
# this yourself before tightening backends.claudeCode.maxBudgetUsd enough
# that hitting it becomes likely mid-run.

_field() { node "$ADAPTERS_DIR/task-field.js" "$1" "$2"; }

run_agent_task_backend() {
  local resolved_json="$1" log_file="$2"

  if ! command -v claude >/dev/null 2>&1; then
    echo "claude CLI not found on PATH. See https://code.claude.com/docs for install instructions." >&2
    return 127
  fi

  local persona_stem prompt model max_budget
  persona_stem="$(_field "$resolved_json" 't.persona')"
  prompt="$(_field "$resolved_json" 't.prompt')"
  model="$(_field "$resolved_json" 't.backends.claudeCode.model')"
  max_budget="$(_field "$resolved_json" 't.backends.claudeCode.maxBudgetUsd')"

  node "$ADAPTERS_DIR/sync-persona.js" "$persona_stem" "$resolved_json" >/dev/null

  local -a args=(-p "$prompt" --agent "$persona_stem" --permission-mode dontAsk --output-format text --no-session-persistence)
  [ -n "$model" ] && args+=(--model "$model")
  [ -n "$max_budget" ] && [ "$max_budget" != "null" ] && args+=(--max-budget-usd "$max_budget")

  # Both tool names are listed everywhere a shell rule appears — "Bash" for
  # Linux/macOS CI runners, "PowerShell" for the Windows shell tool actually
  # exercised by local runs. See the comment block above.
  local -a allowed=()
  if [ "$(_field "$resolved_json" 't.tools.shell && t.tools.shell.allow')" = "true" ]; then
    allowed+=(Bash PowerShell)
  fi
  [ "$(_field "$resolved_json" 't.tools.write && t.tools.write.allow')" = "true" ] && allowed+=(Write Edit)
  [ "${#allowed[@]}" -gt 0 ] && args+=(--allowedTools "${allowed[@]}")

  local -a denied=()
  local deny
  while IFS= read -r deny; do
    [ -n "$deny" ] && denied+=("Bash(${deny} *)" "PowerShell(${deny} *)")
  done < <(_field "$resolved_json" '(t.tools.shell && t.tools.shell.deny || []).join("\n")')

  while IFS= read -r deny; do
    [ -n "$deny" ] && denied+=("Read(./${deny})")
  done < <(_field "$resolved_json" '(t.tools.read && t.tools.read.deny || []).join("\n")')

  [ "${#denied[@]}" -gt 0 ] && args+=(--disallowedTools "${denied[@]}")

  claude "${args[@]}" | tee "$log_file"
  return "${PIPESTATUS[0]}"
}
