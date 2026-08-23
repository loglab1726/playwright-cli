#!/usr/bin/env bash
# scripts/lib/adapters/copilot.sh — Copilot CLI backend.
#
# Implements the run_agent_task_backend(resolved_json, log_file) contract
# from dispatch.sh. Every flag/pattern below is carried over unchanged from
# the already-verified behavior recorded in docs/ci-setup.md (Sections 6 and
# 8) and the original inline comments in scripts/run-manual-test-locally.sh /
# scripts/run-regression-heal-locally.sh — this file is a mechanical
# extraction into the shared adapter shape, not new guessing:
#
#   - `--allow-tool 'shell'` / `--allow-tool 'write'` (bare, no scoping) are
#     required because Copilot's allow-tool matching only works on the bare
#     command stem — a scoped pattern like
#     `shell(node scripts/bounded-run.js:*)` never matches.
#   - `--deny-tool 'shell(<cmd>:*)'` entries DO still work as multi-token
#     denies even under that bare allow — confirmed directly, denial wins
#     over allow.
#   - `--model auto` is required — explicit model names
#     (claude-sonnet-4.6, claude-sonnet-4.5, gpt-5, claude-opus-4.6,
#     claude-haiku-4.5) all failed on the account this was verified against.

_field() { node "$ADAPTERS_DIR/task-field.js" "$1" "$2"; }

run_agent_task_backend() {
  local resolved_json="$1" log_file="$2"

  if ! command -v copilot >/dev/null 2>&1; then
    echo "copilot CLI not found on PATH. Install with: npm install -g @github/copilot" >&2
    return 127
  fi

  echo "== Pre-flight: skill/agent discovery =="
  copilot plugins list --json || echo "::warning:: copilot plugins list failed/unavailable — continuing anyway (same tolerance as CI)."
  echo

  local persona prompt model max_credits
  persona="$(_field "$resolved_json" 't.persona')"
  prompt="$(_field "$resolved_json" 't.prompt')"
  model="$(_field "$resolved_json" 't.backends.copilot.model')"
  max_credits="$(_field "$resolved_json" 't.backends.copilot.maxCredits')"

  local -a args=(-p "$prompt" --agent "$persona" --no-ask-user)
  [ -n "$model" ] && args+=(--model "$model")
  [ -n "$max_credits" ] && args+=(--max-ai-credits="$max_credits")

  [ "$(_field "$resolved_json" 't.tools.shell && t.tools.shell.allow')" = "true" ] && args+=(--allow-tool 'shell')
  [ "$(_field "$resolved_json" 't.tools.write && t.tools.write.allow')" = "true" ] && args+=(--allow-tool 'write')

  local deny
  while IFS= read -r deny; do
    [ -n "$deny" ] && args+=(--deny-tool "shell(${deny}:*)")
  done < <(_field "$resolved_json" '(t.tools.shell && t.tools.shell.deny || []).join("\n")')

  while IFS= read -r deny; do
    [ -n "$deny" ] && args+=(--deny-tool "read(${deny})")
  done < <(_field "$resolved_json" '(t.tools.read && t.tools.read.deny || []).join("\n")')

  copilot "${args[@]}" | tee "$log_file"
  return "${PIPESTATUS[0]}"
}
