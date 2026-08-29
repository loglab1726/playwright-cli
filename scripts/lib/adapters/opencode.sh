#!/usr/bin/env bash
# scripts/lib/adapters/opencode.sh — OpenCode CLI backend, routed through the
# Amplify OpenAI proxy (see opencode.json at the repo root).
#
# Implements the run_agent_task_backend(resolved_json, log_file) contract
# from dispatch.sh. Read docs/opencode-adapter.md before relying on this
# backend for anything unattended — unlike copilot.sh/claude-code.sh, this
# file was NOT confirmed end-to-end against a live model response: no
# AMPLIFY_API_TOKEN was available while building it, and even OpenCode's own
# free-tier models require an interactive `opencode providers login` that
# couldn't be completed in that environment either. What WAS confirmed by
# direct local testing against `opencode` CLI 1.18.21 on Windows:
#
#   - `opencode run <message>` is the headless/non-interactive entry point.
#     `--format json` for machine-readable output, `--agent <name>` to pick a
#     persona, `-m/--model <provider>/<model>` to pick a model, `--auto` to
#     auto-approve permissions that are not explicitly denied (there is no
#     --allowedTools/--disallowedTools-style flag at all — permission is
#     config/frontmatter-driven only, hence sync-persona.js baking the
#     tools.* policy into the regenerated .opencode/agent/<stem>.md file
#     instead of passing it here as CLI args).
#   - opencode.json's custom "amplify" provider (an @ai-sdk/openai-backed
#     entry pointing at https://amplify.planittesting.com/openai) parses and
#     registers correctly — confirmed via `opencode models amplify` listing
#     `amplify/gpt-5.1-codex` — without needing a real token, since that
#     command only reads local config, it doesn't call the proxy.
#   - A hand-written `permission:` block with nested pattern->action maps in
#     an agent's frontmatter round-trips exactly through `opencode agent
#     list`'s JSON dump (same shape sync-persona.js now generates).
#
# NOT verified — treat every one of these as a real risk, not a formality,
# given this backend previously existed in this repo and was removed for
# being unreliable:
#   - Whether the bash/read glob patterns actually match the way this
#     adapter assumes at runtime (as opposed to just parsing correctly into
#     the expected rule list, which is all that was confirmed above).
#   - Whether `--auto` (auto-approve anything not explicitly denied) still
#     genuinely lets the explicit `deny` entries in the frontmatter win, the
#     way Copilot's bare `shell` allow + explicit denies was independently
#     confirmed to behave (docs/ci-setup.md Section 6) — do not assume the
#     same holds here without testing it directly, the same way that Section
#     6 finding and the Claude Code Bash/PowerShell mixup (docs/claude-code-
#     adapter.md Section 2) were both found by testing, not by analogy.
#   - `--format json`'s actual output shape, and what exit code (if any)
#     signals a permission denial or a model/provider error.
#   - Real per-request cost against the Amplify proxy. There is no
#     `--max-*`-style spend cap flag on `opencode run` at all (confirmed
#     absent from `opencode run --help`) — unlike Copilot's
#     --max-ai-credits or Claude Code's --max-budget-usd, any cost ceiling
#     here has to come from the Amplify account/proxy side, not this CLI.
#
# Do not point a production workflow at this backend until the items above
# have been confirmed against a real AMPLIFY_API_TOKEN, the same way the
# Claude Code backend's own gotchas were only found by exercising it for
# real (docs/claude-code-adapter.md, docs/ci-setup.md Sections 6 and 8).

_field() { node "$ADAPTERS_DIR/task-field.js" "$1" "$2"; }

run_agent_task_backend() {
  local resolved_json="$1" log_file="$2"

  if ! command -v opencode >/dev/null 2>&1; then
    echo "opencode CLI not found on PATH. Install with: npm install -g opencode-ai" >&2
    return 127
  fi

  # bash doesn't auto-load .env the way playwright.config.ts's dotenv call
  # does for BASE_URL/APP_URL/etc — pull just this one var out of .env
  # (if present and not already exported) rather than requiring a manual
  # `export` every session. Read with grep/cut, not `source .env`, so an
  # unrelated malformed line elsewhere in .env can't break this.
  if [ -z "${AMPLIFY_API_TOKEN:-}" ] && [ -f .env ]; then
    AMPLIFY_API_TOKEN="$(grep -E '^AMPLIFY_API_TOKEN=' .env | tail -1 | cut -d= -f2-)"
    export AMPLIFY_API_TOKEN
  fi

  if [ -z "${AMPLIFY_API_TOKEN:-}" ]; then
    echo "AMPLIFY_API_TOKEN is not set. Put it in .env as AMPLIFY_API_TOKEN=<token> (opencode.json's 'amplify' provider reads it via {env:AMPLIFY_API_TOKEN} to authenticate to https://amplify.planittesting.com/openai), or export it directly in your shell." >&2
    return 1
  fi

  local persona_stem prompt model
  persona_stem="$(_field "$resolved_json" 't.persona')"
  prompt="$(_field "$resolved_json" 't.prompt')"
  model="$(_field "$resolved_json" 't.backends.opencode.model')"

  # Regenerates .opencode/agent/<persona_stem>.md with a permission: block
  # derived from this task's tools.* policy — see the file header above and
  # sync-persona.js for why that has to happen here instead of via CLI flags.
  node "$ADAPTERS_DIR/sync-persona.js" "$persona_stem" "$resolved_json" >/dev/null

  local -a args=(run "$prompt" --agent "$persona_stem" --format json --auto)
  [ -n "$model" ] && args+=(-m "$model")

  opencode "${args[@]}" | tee "$log_file"
  return "${PIPESTATUS[0]}"
}
