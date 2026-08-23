# Claude Code CLI adapter — what was verified (not guessed)

This repo's automation was originally hard-wired to the GitHub Copilot CLI
(`copilot -p ...`, `--agent`, `--allow-tool`/`--deny-tool`, `.github/agents/
*.agent.md`). `scripts/lib/adapters/` pulls that invocation out behind a
CLI-agnostic interface — `scripts/lib/tasks/*.json` describes *what* to run
(persona, prompt template, tool policy) once, and a backend per CLI
(`copilot.sh`, `claude-code.sh`) translates that into the actual flags for
`copilot` or `claude`.

Everything below about the Claude Code CLI (`claude`, tested against
2.1.229) was confirmed by direct local testing in a throwaway scratch
directory, the same standard `docs/ci-setup.md` already holds the Copilot
integration to — nothing here is inferred from docs alone. Where a fact came
only from documentation and wasn't independently tested, that's called out
explicitly.

## 1. `--agent <name>` resolves by frontmatter `name:`, not filename

Confirmed by creating `.claude/agents/mismatch-filename.md` with frontmatter
`name: mismatch-frontmatter-name`:

- `claude -p ... --agent mismatch-filename` → failed: `--agent
  'mismatch-filename' not found. Available agents: ..., mismatch-frontmatter-name, ...`
- `claude -p ... --agent mismatch-frontmatter-name` → succeeded.

Also confirmed there is no flag to point `--agent` at an arbitrary file path
(absent from `claude --help`; per docs, resolution is name-based only, walking
managed settings → `--agents` JSON → `.claude/agents/` (project) →
`~/.claude/agents/` (user) → plugin `agents/`).

Claude Code also requires `name:` to be lowercase-hyphens (per
code.claude.com/docs/en/sub-agents) — the source `.github/agents/*.agent.md`
files don't follow this (e.g. `name: PlaywrightTestGenerator`).

**Consequence for the adapter:** `scripts/lib/adapters/sync-persona.js`
regenerates `.claude/agents/<stem>.md` from `.github/agents/<stem>.agent.md`
on every run, setting `name:` to the source file's kebab-case filename stem
(discarding the source's own PascalCase `name:` field) so both backends
invoke the identical `--agent <stem>` value for the identical persona body.
Never hand-edit the generated file — it's gitignored and gets overwritten
every run.

## 2. Correction: a bare `Bash` allow does NOT broadly work on Windows — you need `PowerShell` too

**This section originally claimed "a bare `Bash` allow plus a `Bash(git
commit *)` deny let `echo` run but blocked `git commit`" as proof the allow
rule worked broadly. That conclusion was wrong**, caught only after the
adapter was used for real (thanks to a real run surfacing it — see the
incident below) and re-tested properly. Recording the mistake here, not just
the fix, because it's a useful lesson: a single passing example (`echo`)
isn't enough to confirm an allow *rule* is doing anything — it can pass for
an unrelated reason.

**What actually happened:** on Windows, Claude Code's shell tool is
registered internally as `PowerShell`, not `Bash` (visible in
`permission_denials[].tool_name`). Confirmed directly, with
`--permission-mode dontAsk --allowedTools 'Bash'` and nothing else:

| Command | Result |
|---|---|
| `echo probe-ok` | ran |
| `whoami` | ran |
| `dir` | ran |
| `node --version` | **denied** |
| `node -e "console.log(1)"` | **denied** |
| `ls -la` | **denied** |
| `git commit -m ...` | **denied** (expected — but see below) |

The raw `stream-json` output showed the denial reason as
`"decision_reason_type": "mode"` — i.e. dontAsk's own default-deny posture,
**not** a matched `--disallowedTools` rule. So the original "echo ran,
git commit was blocked" test never actually exercised the allow rule at
all: `echo`/`whoami`/`dir` pass through some other always-on "known safe
command" path regardless of `--allowedTools`, and `git commit` was being
denied by dontAsk's default (nothing had actually granted it), not by the
deny pattern being tested. Genuine tool-gated execution — `node --version`,
and critically **`node scripts/bounded-run.js <spec>`, the one command this
entire pipeline exists to run** — was silently denied under a bare `Bash`
allow the whole time.

**The fix, confirmed working**: list `PowerShell` alongside `Bash` in both
`--allowedTools` and `--disallowedTools` (a pattern named for one tool
doesn't match the other tool's calls, so both are needed on every rule, not
just the bare allow). With `--allowedTools 'Bash' 'PowerShell'`:

- `node scripts/bounded-run.js <spec>` executes.
- Adding `--disallowedTools 'Bash(git add *)' 'PowerShell(git add *)'`
  (...and the same pair for `git commit`, `git push`, `npx playwright
  test`, `npm test`) correctly blocks each of those while
  `node scripts/bounded-run.js` still runs — confirmed together in one
  session matching the real task's full tool policy.
- Passing the platform-irrelevant name (`PowerShell` on what would be a
  Linux runner, or vice versa) caused no error in any test — safe to
  include both unconditionally rather than branching on platform.

`scripts/lib/adapters/claude-code.sh` now emits both names for every shell
rule. The production GitHub Actions runners are `ubuntu-latest`, where the
tool is presumably natively `Bash` (not independently re-verified on Linux
— only tested on Windows here) — including `PowerShell` there too should be
a no-op, not a new risk, but confirm this if you ever do move the CI
workflows onto this backend.

**How this was found**: not caught in this document's original testing
pass — it surfaced when the adapter was pointed at a real manual-tests file
end-to-end, and the agent reported "Permission to use PowerShell has been
denied because Claude Code is running in don't ask mode" while trying to
run the mandatory `node scripts/bounded-run.js <spec>` step. Re-testing
confirmed the root cause above.

## 2b. `--disallowedTools` always wins over `--allowedTools` (still holds)

Re-confirmed after the fix above, with the *actually-working* allow in
place this time: `--allowedTools 'Bash' 'PowerShell'` plus
`--disallowedTools 'Bash(git commit *)' 'PowerShell(git commit *)'` let
`git commit` run with no deny rule (proving the allow was real), then
correctly blocked it once the deny rule was added — with `node
scripts/bounded-run.js` still running throughout. Pattern syntax: space
before the wildcard (`Bash(git commit *)`), matching the documented form.

`Read(./path)` deny patterns work the same way — confirmed by writing a real
`.env` with a fake secret, denying `Read(./.env)`, and getting a refusal
("I don't have permission...") instead of the file's contents. (This one
wasn't affected by the Bash/PowerShell issue — `Read` isn't a shell tool.)

## 3. `--permission-mode dontAsk` is the correct headless/CI mode

`claude --help` lists `acceptEdits`, `auto`, `bypassPermissions`, `manual`,
`dontAsk`, `plan`. Confirmed directly that `dontAsk` + explicit
`--allowedTools`/`--disallowedTools` never prompts and denies anything not
allowlisted — the right shape for an unattended CI run with no human to
answer a prompt.

Not independently re-verified line-by-line here: the exact behavior of the
other five modes (`acceptEdits`, `auto`, `bypassPermissions`, `manual`,
`plan`) — taken from documentation, not retested, since the adapter only
uses `dontAsk`.

One default-mode surprise found along the way, **not relied upon by the
adapter** (which always sets `--permission-mode dontAsk` explicitly) but
worth knowing if you ever drop the flag: with *no* `--permission-mode` and
*no* `--allowedTools`/`--disallowedTools` at all, a plain `echo` via Bash ran
without any prompt or denial, while a `Write` tool call and a `git commit`
via Bash were both silently denied (reported in `permission_denials`, no
hang). The exact default policy isn't documented in enough detail to
generalize from this one data point — always pass explicit flags for CI
rather than relying on whatever the default turns out to be.

## 4. Exit code is not the success signal (same as Copilot)

Confirmed directly: the CLI exits `0` regardless of whether a permission
denial happened during the session. This matches Copilot CLI's already-
documented behavior (`docs/ci-setup.md` Section 6) — neither backend's exit
code tells you what actually happened. `scripts/run-manual-test-locally.sh`
and `scripts/run-regression-heal-locally.sh` don't rely on it either way:
the real signal is `scripts/bounded-run.js`'s CSV/state-dir growth, which is
identical for both backends since `bounded-run.js` itself is CLI-agnostic.

## 5. No `--model auto` equivalent

Confirmed directly: `--model auto` fails outright (`HTTP 404`, "may not
exist or you may not have access to it"). Aliases confirmed to work:
`haiku` (used throughout testing for cost). `sonnet`/`opus`/`fable` are
documented aliases but were not all individually tested — only `haiku` was
exercised directly. Unlike Copilot's "let the CLI pick," a specific model
must be set per task in `backends.claudeCode.model`
(`scripts/lib/tasks/*.json`); `sonnet` is set there as a starting default,
not a verified-optimal choice — change it if you want a different
cost/quality tradeoff.

## 6. `--max-budget-usd` — only partially verified

Documented (per `claude --help` and code.claude.com/docs/en/cli-reference)
to cap dollar spend on API calls in print mode. **Not verified**: the exact
exit code / programmatic signal produced when a session actually hits the
cap mid-run (whether it hard-stops immediately or just refuses the next
call, and how to distinguish that from a normal successful completion or an
unrelated failure). `scripts/lib/tasks/*.json` leaves
`backends.claudeCode.maxBudgetUsd` as `null` (unset) by default rather than
guessing a number — the same caution `docs/ci-setup.md` already applies to
Copilot's `--max-ai-credits=40` ("never validated... treat as a starting
guess"), just more conservative: no default cap at all until someone sets
and tests one.

## 7. Platform note: Windows shows "PowerShell", not "Bash"

On this Windows/Git-Bash test machine, `permission_denials` entries named
the actual tool `PowerShell`, not `Bash` — yet `--allowedTools
'Bash'`/`--disallowedTools 'Bash(...)'` patterns still worked correctly
against it. Claude Code's `Bash` pattern name appears to be a cross-platform
abstraction over whatever shell tool actually runs. Irrelevant for the
production target (GitHub Actions `ubuntu-latest`, where the tool is
natively `Bash`) — noted here only so a local Windows run isn't mistaken for
a pattern-matching failure.

## What's deliberately out of scope

- **The production workflows** (`.github/workflows/manual-test-pipeline.yml`,
  `regression-heal.yml`) still invoke Copilot CLI directly and were not
  changed. They weren't touched here because switching CI to Claude Code
  means deciding on auth wiring (an `ANTHROPIC_API_KEY`-style secret, or
  whatever your org's Claude Code auth mechanism is) and re-confirming the
  cost profile in Section 0's style, on GitHub-hosted `ubuntu-latest`
  runners specifically (all verification above was done locally on Windows)
  — this needs a deliberate decision, not a silent flag flip.
- **`--tools`** (the coarser built-in tool-availability flag, separate from
  `--allowedTools`/`--disallowedTools`) is not used by the adapter; default
  (all tools available, permission-gated) was left in place throughout
  testing.
