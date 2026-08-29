# OpenCode CLI adapter (via Amplify) — what was verified, and what wasn't

This repo previously had an OpenCode + Amplify integration that was removed
before this repo's current git history begins, for one documented reason:
"doesn't work reliably" (`docs/pipeline-plan.md` Section 3,
`AGENTS.md`'s former non-goals list). It has been reintroduced here as a
third `--cli opencode` option in `scripts/lib/adapters/`, alongside the
already-working Copilot and Claude Code backends (`docs/ci-setup.md`,
`docs/claude-code-adapter.md`).

**Read this whole doc — especially Sections 8 and 9 — before pointing
anything unattended (CI, an auto-healing loop) at this backend.** Most of
Sections 1-7 below were written before any real `AMPLIFY_API_TOKEN` was
available: no token existed in the environment this backend was first built
in, and even OpenCode's own free-tier models (`opencode/big-pickle` etc.,
visible via `opencode models` with zero config) require an interactive
`opencode providers login` device-code flow that a non-interactive shell
can't complete — `opencode run` against any model just hangs waiting on
that, rather than failing fast. So each claim in Sections 1-7 is labeled
either "confirmed by direct testing" (against `opencode` CLI 1.18.21 on
Windows, using commands that don't require a live model call) or "NOT
verified".

A real `AMPLIFY_API_TOKEN` was later used for two actual end-to-end
attempts — **Sections 8 and 9** — and both failed, in two different ways,
one of which (Section 9) reproduces this backend's original removal reason
in a way that's actively dangerous for unattended use: it exits `0` with no
error while silently skipping the pipeline's mandatory execution step.
Treat Sections 1-7's "confirmed" items as necessary plumbing that's in
place, not as evidence the backend works; Sections 8-9 are the part that
actually tells you whether it does — and so far, it doesn't, reliably.

## 1. `opencode run <message>` is the headless entry point — confirmed

`opencode --help` / `opencode run --help` list it directly: `-p`/`--prompt`
equivalents don't exist here, the message is a positional arg. Relevant
flags: `--agent <name>`, `-m/--model <provider>/<model>`, `--format
json|default`, `--auto` (auto-approve permissions not explicitly denied —
the CLI's own help text calls this "dangerous"). Confirmed present via
`--help` output; **none of these flags were exercised against a live model**,
so the actual `--format json` output shape and what a permission denial or a
model error looks like in that output are NOT verified.

## 2. There is no `--allowedTools`/`--disallowedTools`/`--allow-tool` equivalent — confirmed

Confirmed absent from both `opencode --help` and `opencode run --help`.
Permission policy is config/frontmatter-driven only, via a `permission:`
block (Section 4). This is a structural difference from both other
backends: Copilot and Claude Code let the *invocation* carry the allow/deny
list; OpenCode requires the allow/deny list to already be sitting in a file
before the process starts. That's why `sync-persona.js` now regenerates
`.opencode/agent/<stem>.md` with a `permission:` block built from the
resolved task's `tools.*` policy on every run (Section 4), instead of
`opencode.sh` building CLI args the way `claude-code.sh` does.

## 3. Custom agent = a markdown file; filename is always the agent name — confirmed

Confirmed by direct testing: creating `.opencode/agent/probe-singular.md`
and `.opencode/agents/probe-plural.md` (deliberately testing both the
singular and plural directory name, since public docs and code disagree on
which) and running `opencode agent list` showed **both** `probe-singular`
and `probe-plural` as available subagents — so both directory names are
read. Unlike Claude Code, there is no frontmatter `name:` field at all; the
filename stem is the only identifier. `sync-persona.js` writes to the
singular form, `.opencode/agent/<stem>.md`, since that's what's documented,
using the same `<stem>` value already used as `persona` in
`scripts/lib/tasks/*.json` and as the Claude Code `--agent` value — so one
`persona` field means the same agent name across all three backends.

## 4. The `permission:` frontmatter block parses exactly as expected — confirmed structurally, NOT confirmed at runtime

Confirmed by direct testing: hand-writing this block into an agent's
frontmatter —

```yaml
permission:
  bash:
    "*": allow
    "git add *": deny
    "git commit *": deny
    "git push *": deny
    "npx playwright test *": deny
    "npm test *": deny
  edit: allow
  read:
    "*": allow
    ".env": deny
    ".auth/*": deny
```

— and running `opencode agent list` shows that agent's resolved permission
rule set containing exactly those `{permission, pattern, action}` entries,
in the same order they were declared, merged alongside OpenCode's own
built-in defaults (every agent, custom or built-in, already carries a
baseline `read: *.env -> ask` / `*.env.example -> allow` rule regardless of
what you configure). `sync-persona.js` generates this same shape from the
task JSON's `tools.shell.allow`/`tools.shell.deny`/`tools.write.allow`/
`tools.read.deny` fields — the `<cmd> *` glob suffix on each deny pattern is
carried over from Claude Code's `Bash(cmd *)` convention (`claude-code.sh`),
not something OpenCode's own docs specify a syntax for.

**What this does NOT confirm**: whether that pattern actually matches (or
fails to match) a real `git commit -m foo` bash invocation at runtime, and
whether `--auto` on the CLI genuinely defers to an explicit `deny` in this
block the way Copilot's bare `shell` allow + explicit `--deny-tool` entries
were independently confirmed to (`docs/ci-setup.md` Section 6) — that
confirmation required a real agent session actually attempting the denied
command, which never happened here. **This is the single most important gap
to close before trusting this backend's Layer B tool boundary** (see
`AGENTS.md`'s bounded-healing section) — test it directly, the same way
Section 6's finding and the Claude Code `Bash`/`PowerShell` naming mismatch
(`docs/claude-code-adapter.md` Section 2) were each found by testing a real
denial, not by reading a doc or trusting that parsing correctly implies
enforcing correctly.

## 5. The Amplify provider config parses and registers its models — confirmed (without a real token)

`opencode.json` at the repo root defines a custom `amplify` provider
(`@ai-sdk/openai`-backed, `baseURL:
https://amplify.planittesting.com/openai`, `apiKey: {env:AMPLIFY_API_TOKEN}`)
with two models registered under it (`gpt-5.1`, `gpt-5.1-codex`). Confirmed
by direct testing: `opencode models amplify` lists both
`amplify/gpt-5.1` and `amplify/gpt-5.1-codex` correctly with only a
placeholder value in `AMPLIFY_API_TOKEN` — this command reads local config
only, it doesn't call the proxy, so it says nothing about whether the token
or endpoint are actually valid. **No request was ever sent to
amplify.planittesting.com in the course of building this** — a real
`AMPLIFY_API_TOKEN` is required to confirm that, and that confirmation still
needs to happen before relying on this backend for anything.

`scripts/lib/tasks/manual-test-generate.json` and `regression-heal.json`
both set `backends.opencode.model` to `"amplify/gpt-5.1-codex"` — carried
over from the model the pasted Amplify config example defaulted to, not
independently chosen or benchmarked against the alternative
(`amplify/gpt-5.1`) for this pipeline's actual generation/healing tasks.

**The token is not model-specific.** `AMPLIFY_API_TOKEN` authenticates to the
proxy itself (`baseURL`), not to any one model — whatever models Amplify has
enabled for your account can be added to `provider.amplify.models` in
`opencode.json` and referenced as `amplify/<model-id>`, all under the same
token.

**Where to put it**: `.env` (`AMPLIFY_API_TOKEN=<token>`), same file as
`BASE_URL`/`EMAIL_ADDRESS`/etc. Unlike those other variables — which only
the Node-side `dotenv` call in `playwright.config.ts` loads — `opencode.sh`
reads `AMPLIFY_API_TOKEN` out of `.env` itself with a plain `grep`/`cut`
(not `source .env`, so an unrelated malformed line elsewhere in `.env` can't
break it) if it isn't already exported in your shell. Either a `.env` entry
or a real `export AMPLIFY_API_TOKEN=...` works; `.env` is simpler and is
already `.gitignore`d.

## 6. No spend-cap flag exists on `opencode run` at all — confirmed absent

Confirmed absent from `opencode run --help`: no `--max-budget`,
`--max-credits`, or equivalent. Copilot has `--max-ai-credits` (with a
floor of 30, `docs/ci-setup.md` Section 3.5) and Claude Code has
`--max-budget-usd` (itself only partially verified,
`docs/claude-code-adapter.md` Section 6) — OpenCode has nothing at the CLI
level. Any cost ceiling for the opencode backend has to come from wherever
the Amplify proxy/account enforces its own limits, not from this repo's
tooling. Given `docs/ci-setup.md` Section 0's warning about agentic sessions
running "several hundred credits ($3-12+ equivalent)" on other backends,
**do not run this backend against a real account without first confirming,
on the Amplify side, that some spend limit exists** — this repo cannot
enforce one for you here.

## 7. Exit code semantics — NOT verified

`copilot`/`claude-code` were both confirmed to exit `0` regardless of
whether a permission denial happened (`docs/ci-setup.md` Section 4,
`docs/claude-code-adapter.md` Section 4) — `scripts/bounded-run.js`'s own
CSV/state-dir growth is the actual signal both callers rely on, not the
process exit code. Whether `opencode run` follows the same pattern was never
tested here (no live run completed at all). Treat `opencode.sh`'s returned
exit code with the same skepticism the other two backends already require,
until proven otherwise.

## 8. First real attempt — confirmed failure: `reasoning part ... not found` crashes the session before any write ever happens

Once a real `AMPLIFY_API_TOKEN` was available, a real end-to-end attempt was
made: `./scripts/run-manual-test-locally.sh manual-tests/TC_E2E_001_...md
--cli opencode`. This is the first genuine data point on whether the backend
works at all, and it's not good news — **it reproduces the exact failure
mode this backend was originally removed for.**

What worked: the session did reach Amplify and get real model responses
(non-zero `reasoning` token counts in the JSON log confirm a real reasoning
model round-trip, not a stub/mock), picked the right persona, and correctly
followed the offline-snapshot-first rule from `AGENTS.md` — the only tools
it called across the whole session were `read`, `glob`, `grep`, and
`todowrite`. So: config, auth, agent resolution, and basic tool permission
(read/list tools) all worked as designed.

What failed: **no `write`/`edit` tool call ever appears in the log** — it
never got as far as generating a Page Object or spec file. About 6 minutes
and ~35 tool calls in, after a `step_start` with no corresponding tool call
or text for over 2 minutes, the session errored out:

```
{"type":"error","error":{"name":"UnknownError","data":{"message":"\"reasoning part rs_0d8f92731b783d6e016a8c6b910048819795553e7295f5595f:0 not found\""}}}
```

This is a known OpenAI Responses API failure shape for reasoning models:
across a multi-turn tool-calling session, the API expects prior reasoning
items to be referenced back by ID on later turns, and this error means the
server couldn't find one that a later request referenced. Suspected
contributing factors, **none independently isolated yet**:

- `gpt-5.1-codex`'s `reasoningEffort: "medium"` on a long, read-heavy
  session (repo has grown to dozens of tool calls with 50K+ tokens of cached
  context by the time this happened) — the reasoning-item chain across that
  many turns is exactly where this class of bug tends to surface.
- The Amplify proxy's fidelity in round-tripping the Responses API's
  stateful reasoning-item mechanism specifically (as opposed to plain
  request/response chat completions) — this is exactly the concern the
  user's own pasted OpenCode/Amplify config doc flagged when it said
  `@ai-sdk/openai` (Responses API) is "recommended" over
  `@ai-sdk/openai-compatible` (chat completions) for models like
  `gpt-5.1-codex` "that only work with the responses API" — this failure
  doesn't rule out that the Responses-API path through this specific proxy
  still has a gap.
- OpenCode's own history/context handling possibly trimming or reordering a
  reasoning item mid-session in a way the Responses API's continuation
  contract doesn't tolerate.

**This exit code (`1`) actually was a meaningful failure signal** — unlike
the "exit code is not the success signal" finding for Copilot and Claude
Code (Section 7, `docs/ci-setup.md` Section 4). That's one data point, not
a confirmed general rule for this backend; don't assume exit codes are
trustworthy here without more runs.

**Recommended next steps before trying again**, roughly in order of effort:

1. Retry the exact same task once or twice — confirm whether this is
   consistently reproducible or an intermittent proxy/session hiccup.
2. Try `amplify/gpt-5.1` (already registered in `opencode.json`, lower
   `reasoningEffort: "low"`) instead of `amplify/gpt-5.1-codex` for
   `backends.opencode.model` in the task JSON — a shorter/lighter reasoning
   chain may not hit the same failure window.
3. If it's reproducible specifically on `gpt-5.1-codex`, raise it with
   whoever owns the Amplify proxy — this looks like a
   proxy/SDK-compatibility gap with the Responses API's reasoning-item
   continuation, not a task-JSON or persona-config mistake in this repo.

Until this is resolved, **this backend has not yet completed a single real
generate-and-run cycle** — treat every other "confirmed" item in this doc as
necessary-but-not-sufficient plumbing, not evidence the backend actually
works.

## 9. Second real attempt — confirmed failure mode: a clean `exit 0` that did NOT complete the task

A second attempt (same command, after the Section 8 crash) got past the
`reasoning part ... not found` error and ran to completion — `exit 0`, no
error events. It still did not do the pipeline's job:

- It wrote a `todowrite` plan: extend POMs → write the `TC_E2E_001` spec →
  run `node scripts/bounded-run.js <spec>` → update the manifest.
- It edited two Page Objects (`pages/LandingPage.ts`,
  `pages/AuthenticationPage.ts`) toward step 1.
- **No `tests/*.spec.ts` file was ever created or touched. No `bash`/shell
  tool was ever called — `bounded-run.js` never ran** (confirmed separately:
  `playwright-report/`'s and `test-results/`'s mtimes were unchanged from
  before this session started).
- After a step with a large `reasoning` token count (context-compaction
  territory), OpenCode injected a synthetic nudge — `"Continue if you have
  next steps, or stop and ask for clarification if you are unsure how to
  proceed."` — and the model responded with a status summary ending in
  *"Let me know if you want any of those steps tackled now"*, then stopped
  for good. The session ended there with a clean `stop` reason, not an
  error, hence `exit 0`.

**Why this is worse than Section 8's crash, not better**: a crash at least
looks like a failure. This looks exactly like success — no error output,
exit `0`, a plausible-looking diff — while silently violating this
pipeline's core "generation is never complete until executed" contract
(`AGENTS.md`, the persona's own "MANDATORY EXECUTION" instructions). Do not
trust `exit 0` from this backend as any signal at all yet; the only real
check is the same one this repo already relies on for the other backends —
inspect `git diff` for an actual `tests/*.spec.ts` change, and confirm
`playwright-report`/`test-results` actually got a fresh timestamp — not the
process exit code.

**Root cause, as far as this session diagnosed it**: `--auto` only
auto-approves tool-permission prompts; it has no effect on whether the model
itself decides to stop and defer to a human instead of continuing
autonomously. Copilot's `--no-ask-user` and Claude Code's `--permission-mode
dontAsk` are permission-layer settings with the same limitation in principle,
but neither of those backends was observed stopping mid-task to ask a
question in this repo's testing so far. Candidate mitigations, **none tried
yet**:

- Set a higher `permission.question: deny` (or equivalent) in the agent
  frontmatter so the CLI can't even surface a "should I continue?" turn —
  unconfirmed whether that's what actually happened here (the log shows a
  synthetic system-injected nudge, not necessarily the `question` permission
  tool being invoked) or whether it would just make the model stop silently
  earlier instead.
- `opencode run --continue "..."` to resume the same session with an
  explicit "keep going, do not stop until bounded-run.js has actually run"
  instruction — untested, and not something `opencode.sh` currently
  automates.
- Investigate the `steps`/`maxSteps` agent-config field (Section on Agent
  schema, near the top of this doc) — if a step/compaction boundary is what
  triggers the stop-and-ask behavior, tuning that may help; unconfirmed.

Two real attempts, two different failure modes, zero completed
generate-and-run cycles so far. Treat this backend as **not usable
unattended** until at least one full cycle (spec written + `bounded-run.js`
actually executed + a pass/fail result) is observed.

## What's deliberately out of scope (same boundary as the Claude Code adapter)

- **The production workflows** (`.github/workflows/manual-test-pipeline.yml`,
  `regression-heal.yml`) still invoke Copilot CLI directly and were not
  touched. Given everything in this doc marked "NOT verified," this backend
  should not be considered for a production workflow until those items are
  closed, with a real `AMPLIFY_API_TOKEN`, on the actual CI runner target
  (`ubuntu-latest`) — everything above was tested locally on Windows only.
- Completing one full generate-and-run or heal cycle end-to-end. Sections 8
  and 9 cover the two real attempts so far — one crashed mid-run before
  writing anything, the other exited cleanly having written half the POM
  changes and never run the test at all. This is still the biggest open
  item; everything else in this doc is a building block toward that, not a
  substitute for it.
