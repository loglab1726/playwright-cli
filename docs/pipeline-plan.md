# Plan: Manual-Test-to-Playwright Pipeline via GitHub Copilot CLI

**Status:** Design agreed, no code written yet. This document is self-contained —
written so it can be handed to a different AI assistant or engineer with no
access to prior conversation history and they could implement it from this
alone.

**Repo:** `playwright-cli-demo` (a TypeScript + Playwright UI automation POC).

---

## 1. Goal (in the user's words)

> Take manual test case generation to pipeline level: manual test `.md` files
> get committed to the repo → an AI agent (GitHub Copilot CLI) generates
> Playwright test scripts using the existing Playwright CLI skills/POM
> conventions → executes them → if they fail, self-heals with a **hard cap of
> 3 retry attempts**, tracked so it can never loop forever and burn tokens →
> unresolved failures get logged, not endlessly retried. Token minimization is
> a first-class goal (hence CLI-based generation using offline snapshots, not
> live-browser MCP calls). Not using OpenCode/Amplify (doesn't work reliably)
> — driver is **GitHub Copilot CLI** (the `copilot` terminal tool), invoked
> headlessly from GitHub Actions.

---

## 2. Current repo state (as of this plan)

```
manual-tests/                     # Markdown files describing manual test steps (trigger source)
.playwright-cli/*.yml             # Offline UI snapshots — the "source of truth" for locators,
                                   # avoids launching a live browser (token minimization)
pages/                            # Page Object classes, one per page/section, extend BasePage
tests/                            # Spec files, one per feature area, import {test, expect} from '../fixtures'
tests/fixtures.ts                 # Custom fixture exporting `open` (page-object initializer) and `apiContext`
unresolved-test-failures.csv      # Dead-letter log for tests that hit the 3-attempt hard stop
.github/copilot-instructions.md   # Full POM + locator + healing-loop rules (see below, unchanged content)
.github/agents/playwright-test-generator.agent.md   # Same rules, as a Copilot CLI custom agent persona
.github/skills/playwright-cli/SKILL.md               # Generic playwright-cli tool skill (open/click/fill/snapshot/etc.
                                   # command reference + a references/ folder covering tracing, storage-state,
                                   # request-mocking, test-generation (plan/generate/heal), session-management,
                                   # etc.). Moved here from the Claude-skills folder specifically so Copilot CLI
                                   # (which reads `.github/skills/<name>/SKILL.md`) can discover it too — see
                                   # Section 6, this is NOT yet the project-specific skill Section 6 describes.
AGENTS.md                         # Does NOT exist in the repo yet. Copilot CLI auto-loads it alongside
                                   # copilot-instructions.md if present, so it needs to be authored fresh,
                                   # tool-agnostic from the start (see Section 8) — there is no prior content to clean up.
.github/workflows/playwright.yml  # Existing full-suite CI (runs `npx playwright test` on push/PR) — KEEP AS-IS,
                                   # it's the independent validation layer
package.json                      # scripts: test, test:headed, test:debug, test:report
playwright.config.ts              # storageState auth via .auth/user.json, setup project pattern
```

### Existing conventions already encoded in `.github/copilot-instructions.md` / `.agent.md` (KEEP, do not weaken)

- Tests grouped by feature into one spec file per domain (e.g. all checkout flows → `CheckoutTests.spec.ts`). Never fragment by variation.
- Every Page Object extends `BasePage`, implements `async init(): Promise<this>`.
- **Never** `expect()` inside a Page Object — POs return raw values/other POs only.
- **Never** a raw locator/`getBy...` inside a `.spec.ts` — locators live only in `pages/`.
- Path aliases only (`@pages/...`), no relative imports.
- `open` fixture starts every chain; `.then((_) => ...)` callbacks must use `_` as the param name, never `page`/`p`.
- `expect.poll` mandatory for assertions, always with `{ timeout, intervals, message }`.
- Locator priority: `getByRole` → `getByLabel` → `getByPlaceholder` → `getByText` → CSS/XPath → `data-testid`.
- No emoji/symbol locator names — fall back to CSS.
- No positional selectors (`:nth-child`) as primary strategy.
- `process.env.TEST_USER_EMAIL` / `TEST_USER_PASSWORD` only, never hardcoded.
- Auth via global `storageState` in `playwright.config.ts` — don't override per-test unless the test needs to run unauthenticated.
- **Offline-first UI reference**: `.playwright-cli/*.yml` snapshots are read to map elements to locators; do not launch a live browser / guess selectors unless the snapshot doesn't cover it.
- **Bounded self-healing protocol** (currently prompt-enforced only — being hardened, see Section 4):
  1. Must actually execute `npx playwright test <path>` (never `--list`/dry-run).
  2. On failure, snapshot only the specific failing page via `playwright-cli open <url>` / `playwright-cli snapshot`, update the Page Object, rerun.
  3. Must print `[HEAL ATTEMPT X/3]` before every healing rerun; hard stop after attempt 3, no 4th attempt.
  4. On hard stop, append a row to `unresolved-test-failures.csv`: `Timestamp, Test Name, Failing Step/Locator, Error Summary`.

---

## 3. Key architecture decision: GitHub Copilot CLI (not the async coding agent)

One other option was considered and rejected:

- **GitHub Copilot coding agent** (async, issue-assignment based, opens PRs from its own sandbox): considered, but it's not synchronously scriptable from a workflow step — you can't wrap it in your own retry loop from outside, only nudge it via re-assignment/comments. More complex, less controllable — **rejected in favor of the CLI**.

(An earlier iteration of this repo also had an OpenCode + Amplify adapter harness. It was removed from the repo and was not part of this plan.

**Update 2026-08-24:** reintroduced as a third `--cli opencode` option alongside Copilot/Claude Code, following the same CLI-agnostic adapter shape `docs/claude-code-adapter.md` already established. See `docs/opencode-adapter.md` for what was actually confirmed by direct testing this time versus what's still unverified — no `AMPLIFY_API_TOKEN` was available while building it, so no live agentic run against a real model was executed. Do not point CI at it until that doc's open items are checked off; the original removal reason ("doesn't work reliably") is exactly the failure mode those open items are guarding against.)

**Chosen: `copilot` CLI**, invoked headlessly and synchronously inside a GitHub Actions job via `-p`/`--prompt` mode. This gives direct control: capture exit code, capture JSON output, enforce tool permissions, cap spend — all from the workflow itself.

### Confirmed CLI facts relevant to this design (from GitHub's official CLI command reference, verified against docs — see Section 9 for exact source)

- `copilot -p "<prompt>" -s --output-format json` — non-interactive, one-shot, silent (agent response only, no usage banner), JSONL output (one JSON object per line) — the right invocation shape for CI.
- `--agent AGENT_NAME` — selects a custom agent from `.github/agents/*.agent.md`. Our `playwright-test-generator.agent.md` is already in the exact expected format/location — **no rework needed**, just point `--agent playwright-test-generator` at it.
- `--allow-tool 'PATTERN'` / `--deny-tool 'PATTERN'` — tool permission scoping, patterns like `shell(git:*)`, `read(.env)`, `write(src/*.ts)`. **Deny always overrides allow, even under `--allow-all`.** This is the structural enforcement mechanism (see Section 4).
- `--allow-all-tools` — required by GitHub's own docs for "programmatic use," but we deliberately do **not** use this; we use scoped `--allow-tool`/`--deny-tool` instead, precisely so we can deny the raw test-runner command (see Section 4).
- `--no-ask-user` — disables the `ask_user` tool so the agent can't stall a headless CI run waiting on interactive input.
- `--max-ai-credits=N` — **native, built-in per-response spend cap.** Resets per user message/turn. Use this as a coarse budget ceiling in addition to (not instead of) the attempt-count cap in Section 4 — they bound different things (spend-per-turn vs. number-of-actual-test-executions).
- `--model=MODEL` — model selection; default is `claude-sonnet-4.6`. Faster/cheaper option available: `claude-haiku-4.5` (listed as "fast, lightweight operations") — worth considering for the failure-classification step (see Section 5) since it doesn't need the full reasoning model.
- Auth in CI: environment variable token, checked in this order of precedence: `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`. Needs a fine-grained PAT (v2) with "Copilot Requests" permission, OR an OAuth token from the Copilot CLI app / `gh` CLI app. **Classic PATs (`ghp_`) are not supported.**
- `--sandbox` / `--no-sandbox` — OS-level shell sandbox (filesystem/network restriction for shell commands, MCP/LSP servers, built-in tools). Marked "only available in experimental mode" in the docs as of this writing — flag for confirmation before relying on it in CI; don't assume it's stable/default.
- Skills: `.github/skills/<name>/SKILL.md` with real frontmatter (`name`, `description`, `allowed-tools`, `disable-model-invocation`, `user-invocable`). This is the actual mechanism for "add Playwright CLI skills to Copilot" — see Section 6.
- Custom instructions are loaded from **multiple locations simultaneously and merged**: `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, `.github/instructions/**/*.instructions.md`, `.github/copilot-instructions.md`, plus user-level files. **This means `AGENTS.md` gets pulled in automatically alongside `copilot-instructions.md`** — see Section 8: this file doesn't exist in the repo yet and needs to be authored (tool-agnostic from the start) before this pipeline goes live, since Copilot CLI will otherwise silently look for it and simply find nothing.
- OpenTelemetry export: `COPILOT_OTEL_ENABLED=true` + `COPILOT_OTEL_FILE_EXPORTER_PATH=<path>` writes JSON-lines traces/metrics including `gen_ai.usage.input_tokens`/`output_tokens`, `github.copilot.cost`, `github.copilot.aiu`, `gen_ai.invoke_agent.tool_calls`, `gen_ai.invoke_agent.inference_calls` per span. **Use this instead of hand-rolling a cost tracker** — see Section 7.
- `copilot plugins list --json` — non-interactive introspection of every skill/MCP/instruction source discovered for the working directory; useful as a pre-flight sanity check in the workflow (fail fast if the expected skill/agent isn't being picked up).

---

## 4. Core reliability fix: enforcement must be in code, not prompt text

**Problem identified:** the current 3-strike rule (`[HEAL ATTEMPT X/3]`, hard stop) is entirely prompt-based — the agent is *asked* to self-count and self-stop. This is not a guarantee: it doesn't survive context resets, doesn't persist across separate pipeline runs/reruns, and depends entirely on the model choosing to comply every time.

**Fix — two independent, complementary layers:**

### Layer A — stateful cap via a wrapper script (persists across invocations)

`scripts/bounded-run.js` (Node, no deps beyond `fs`/`child_process`):

- Takes a spec path as its only argument.
- Maintains a JSON state file per spec under `.healing-state/<spec-hash>.json` with an `attempts` counter — **committed to the branch/workspace, not just in-memory**, so the cap survives across separate `copilot -p` invocations, pipeline reruns, or a context-window reset mid-session.
- On each call: if `attempts >= 3`, refuse to run, deterministically write the row to `unresolved-test-failures.csv` (script does this, not the agent — removes reliance on the agent remembering the exact CSV format), print `HARD STOP`, exit code `2`.
- Otherwise increment attempts, persist, print `[HEAL ATTEMPT N/3]`, run `npx playwright test <spec>` via `execSync`, and on success delete the state file (clears the counter for next time).
- On failure, exit code `1` (distinct from the hard-stop `2`, so the workflow/agent can tell "still failing but attempts remain" from "hard-stopped, do not retry").

Sketch (already drafted earlier in this design conversation, reproduce faithfully when implementing):

```js
// scripts/bounded-run.js
const fs = require('fs');
const { execSync } = require('child_process');
const specPath = process.argv[2];
const stateFile = `.healing-state/${specPath.replace(/[\/\\]/g, '_')}.json`;
fs.mkdirSync('.healing-state', { recursive: true });

let state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile)) : { attempts: 0 };

if (state.attempts >= 3) {
  console.error(`HARD STOP: ${specPath} already exhausted 3 heal attempts.`);
  appendUnresolvedCsv(specPath, 'attempt-limit-exhausted'); // deterministic, not agent-written
  process.exit(2);
}

state.attempts += 1;
fs.writeFileSync(stateFile, JSON.stringify(state));
console.log(`[HEAL ATTEMPT ${state.attempts}/3]`);

try {
  execSync(`npx playwright test ${specPath}`, { stdio: 'inherit' });
  fs.rmSync(stateFile); // success clears the counter
} catch (e) {
  process.exit(1);
}
```

(Implementer: flesh out `appendUnresolvedCsv` to match the existing CSV format: `Timestamp, Test Name, Failing Step/Locator, Error Summary`.)

### Layer B — structural tool denial via Copilot CLI's `--deny-tool` (prevents bypass within a session)

Since deny always overrides allow, the agent is **physically unable** to call the raw test runner even if it "forgets" the instruction to use the wrapper:

```
--allow-tool 'shell(node scripts/bounded-run.js:*)' \
--allow-tool 'shell(git:*)' \
--deny-tool 'shell(git push)' \
--deny-tool 'shell(npx playwright test:*)' \
--deny-tool 'shell(npm test:*)' \
--deny-tool 'read(.env)' \
--deny-tool 'read(.auth/*)'
```

Instructions (in `copilot-instructions.md` / the agent file / the skill) should state plainly: *"You may only run tests via `node scripts/bounded-run.js <spec>`. Direct `npx playwright test` invocation is disabled."*

**Both layers are required.** Layer A is what makes the cap durable/stateful; Layer B is what makes it un-bypassable within a live session. Neither alone is sufficient.

---

## 5. Failure classification before spending a heal attempt

**Rationale (concrete example from this repo's own `unresolved-test-failures.csv`):**

```
2026-08-21T14:51:00+05:30, submits PayPal delivery form and reaches the success screen,
PayPal success toast, Application reaches the success screen but does not expose
"Order ORD-XXXXXX placed successfully!" for assertion
```

This does **not** look like selector drift — it looks like a genuine app-behavior/text mismatch (wrong copy, wrong element, or an actual bug, or an outdated manual-test expectation). Spending all 3 heal attempts re-deriving locators against a wrong hypothesis is pure waste.

**Add a classification step before healing proceeds:**

| Error signature | Classification | Action |
|---|---|---|
| `TimeoutError` waiting on a locator | Locator drift | Proceed to heal: snapshot the specific failing page, update the Page Object |
| `expect(received).toBe(expected)` mismatch on business text/data | Possible real app bug or stale manual-test expectation | **Stop immediately, do not consume further heal attempts.** Log to CSV as `needs-human-review` with the mismatch detail. |
| Network/auth/connection error | Environment flake | Retry once with **no code change** (don't touch the POM for a network blip); if it recurs, treat as environment issue, not test issue |

Implementation note: this classification can run as a cheap, fast pre-check (regex/string match on the Playwright error output) *before* invoking the LLM at all for that attempt — no need to spend model tokens just to categorize a `TimeoutError` vs. an `expect().toBe()` failure. Only hand off to the agent once you know which branch you're in. If an LLM judgment call is still wanted for ambiguous cases, route it through a cheap model (`claude-haiku-4.5`) rather than the main generation model.

---

## 6. Skills: the concrete mechanism for "give Copilot the Playwright CLI conventions as a skill"

**Repo state correction:** `.github/skills/playwright-cli/SKILL.md` already exists — it was moved there from the Claude-skills folder specifically so Copilot CLI (which reads `.github/skills/<name>/SKILL.md`, same convention as Claude Code) would pick it up too. This is **not** an empty path to create from scratch; it currently holds the *generic* playwright-cli tool reference (the full `open`/`click`/`fill`/`snapshot`/... command list) plus a `references/` folder (`test-generation.md`, `tracing.md`, `storage-state.md`, `request-mocking.md`, `session-management.md`, `playwright-tests.md`, etc.) — none of which is project-specific yet. Its current frontmatter is:

```yaml
---
name: playwright-cli
description: Automate browser interactions, test web pages and work with Playwright tests.
allowed-tools: Bash(playwright-cli:*) Bash(npx:*) Bash(npm:*)
---
```

This changes the implementation task from "create" to "extend, and re-scope":

1. **Tighten `allowed-tools`.** The current value permits raw `Bash(npx:*)`, which includes `npx playwright test` — directly undermining the Section 4 Layer B goal of making the agent structurally unable to bypass `scripts/bounded-run.js`. Narrow this to something like `Bash(playwright-cli:*) Bash(node scripts/bounded-run.js:*) Bash(git:*)` before this skill is live in the pipeline. (Whether a skill's own `allowed-tools` can widen back past a CLI-invocation `--deny-tool`, or whether deny always wins regardless of source, is unconfirmed — added to Section 9.)
2. **Add the project-specific content as its own section (or its own sibling skill)** rather than folding it into the generic reference: move the "UI Reference — Offline Generation First" and "Locator Priority & Strategy" sections out of `copilot-instructions.md` into either (a) a new subsection of this SKILL.md's body, clearly separated from the vendored generic command reference, or (b) a separate skill directory, e.g. `.github/skills/pom-conventions/SKILL.md`, so the generic tool docs and this project's POM/locator rules don't get conflated and the generic skill can still be pulled in unmodified by future upstream updates.
3. **Reconcile the existing `references/test-generation.md` heal workflow with Sections 4–5 of this plan.** That file already documents a full plan → generate → heal loop, but it's **live-browser-based** (`npx playwright test --debug=cli` + `playwright-cli attach`), open-ended (no attempt cap), and its own healing section (3.4) says to *stop and ask the user* whenever a failure looks like an app-behavior change rather than log it to CSV. Left as-is, the agent has two different sets of heal instructions in context. State explicitly, either in this SKILL.md or in `copilot-instructions.md`, that for CI-driven runs the bounded/classified protocol in Sections 4–5 of this plan **supersedes** `references/test-generation.md`'s Section 3 for this repo (that reference doc's plan/generate sections, and its other reference files, remain fine to use as-is for interactive/local work).

Keep the **POM structural rules** (BasePage, no `expect()` in POs, path aliases, `_` param naming, `expect.poll` config) and the **bounded-healing protocol** (Section 4) in `copilot-instructions.md` / `playwright-test-generator.agent.md` — those are project-wide rules, not narrowly "Playwright CLI usage," so they don't need to be a separate skill.

---

## 7. Pipeline shape (final, agreed)

```
push to manual-tests/**.md
        │
        ▼
[lint job]
   - validate each changed .md has the required sections from this repo's manual-test
     template (`### Test Case ID`, `### Test Steps`, `### Expected Result` at minimum —
     see existing files under `manual-tests/` for the full template, which also includes
     Feature Area, Priority, Preconditions, Notes and Assumptions, Defect Opportunity)
   - fail fast, spend zero agent tokens on malformed input
        │
        ▼
[dedup job]
   - compute a content hash per manual-tests/*.md file
   - compare against a committed manifest of last-successfully-generated hashes
   - skip files whose hash hasn't changed — do NOT re-dispatch the agent for
     files nothing changed about
        │
        ▼  (matrix: one job per new/changed file, concurrency-limited —
        │   e.g. max-parallel: 3, to avoid fanning out on a big multi-file commit)
[generate+run job]  (per file)
   - checkout, npm ci, install playwright browsers
   - invoke:
       copilot -p "Generate, execute, and bounded-heal a Playwright test for
                    manual-tests/<file>. Follow .github/copilot-instructions.md
                    and the playwright-cli skill exactly. Run tests ONLY via
                    node scripts/bounded-run.js <spec> — never call
                    npx playwright test directly." \
         --agent playwright-test-generator \
         --allow-tool 'shell(node scripts/bounded-run.js:*)' \
         --allow-tool 'shell(git:*)' \
         --deny-tool 'shell(git push)' \
         --deny-tool 'shell(npx playwright test:*)' \
         --deny-tool 'shell(npm test:*)' \
         --deny-tool 'read(.env)' \
         --deny-tool 'read(.auth/*)' \
         --no-ask-user \
         --model claude-sonnet-4.6 \
         --max-ai-credits=40 \
         --output-format json -s
   - job parses the JSONL output directly (not scraped stdout text)
   - job checks the exit code / bounded-run.js state file for hard-stop vs. success
   - update the hash manifest for this file on success
        │
        ▼
   success → commit branch (workflow creates the commit/PR, not the agent,
             to keep PR creation deterministic — same "code handles anything
             that must be guaranteed" philosophy as bounded-run.js)
   hard-stop → CSV already written deterministically by bounded-run.js →
               open PR as draft/WIP, label `needs-human`, attach the
               Playwright HTML report / trace as a workflow artifact
        │
        ▼
[validation job] — the EXISTING .github/workflows/playwright.yml, unchanged,
   runs the full regression suite on the PR independently. Never trust the
   agent's self-reported pass/fail as the final signal — this job is the
   real gate.
```

### Why the matrix/concurrency limit matters

Each dispatched `copilot -p` invocation is a real, metered session (Copilot plan request allowance, not raw API tokens). A single commit adding 10 manual-test files should not fan out to 10 fully-parallel sessions each burning up to 3 heal attempts. Cap `max-parallel` in the matrix (start at 3, tune based on observed cost) and consider stopping the whole batch (not just one file) if failure rate across the batch is unusually high — that's usually a sign of an environment problem, not per-test flakiness, and retrying each file independently multiplies the waste.

---

## 8. Cleanup required before go-live

`AGENTS.md` is loaded and merged automatically by Copilot CLI (alongside `.github/copilot-instructions.md`) — this is not optional/configurable per-file, it happens for every session unless `--no-custom-instructions` is passed. `OPENCODE.md`, `.opencode/`, `opencode.json`, and `amplify-adapter/` have already been deleted from the repo.

**Repo state correction:** `AGENTS.md` itself does not exist anywhere in the repo (checked working tree and git history) — there is no leftover OpenCode-era content to clean up, because the file was never created. The action here is **authoring it, not reviewing it**:

**Action:** create `AGENTS.md` from scratch, tool-agnostic from the first line — no references to OpenCode, Amplify, or any tool-specific adapter. Carry over the parts of `copilot-instructions.md` that are genuinely tool-agnostic project rules (the POM structural rules, the bounded-healing-loop description referencing `scripts/bounded-run.js` per Section 4), so a session that merges `AGENTS.md` + `copilot-instructions.md` doesn't get contradictory guidance. Since Copilot CLI merges both files for every session, keep `AGENTS.md` to project-wide rules and leave Copilot-specific mechanics (agent name, `--deny-tool` flags, skill wiring) in `copilot-instructions.md` / the agent file, to avoid duplicating the same rules in two places that could drift out of sync.

---

## 9. Things flagged as unverified / needs-confirmation-before-relying-on

Documented honestly so nothing here is silently assumed:

1. **`--sandbox`/OS-level shell sandbox** is marked "only available in experimental mode" in the docs snapshot this plan was built from — confirm current stability/default status before depending on it for CI isolation.
2. **`copilot login --with-token` / env-var auth precedence** (`COPILOT_GITHUB_TOKEN` > `GH_TOKEN` > `GITHUB_TOKEN`) and the PAT permission requirement ("Copilot Requests" scope, fine-grained v2 PAT only, classic `ghp_` tokens rejected) — confirmed from the docs, but verify your org's PAT/OAuth setup satisfies this before wiring secrets into the workflow.
3. Exact current model pricing/AIU cost per model (`claude-sonnet-4.6` vs `claude-haiku-4.5` vs others) wasn't in the reference pulled — check current Copilot plan documentation before finalizing the `--max-ai-credits` budget number and before deciding whether to route the Section 5 classification step through a cheaper model.
4. This plan is built from a GitHub Docs CLI command reference the user pasted in during the design conversation — treat it as the source of truth over any conflicting prior assumption in this document, but re-check GitHub's docs directly if significant time has passed since this plan was written, since Copilot CLI has been changing quickly.
5. **Skill-level `allowed-tools` vs. CLI-invocation `--deny-tool` precedence** — Section 4 assumes `--deny-tool` passed on the `copilot -p ...` invocation always wins. It's unconfirmed whether a broader `allowed-tools` declared inside a skill's own frontmatter (see Section 6 — the existing `playwright-cli` skill currently allows raw `Bash(npx:*)`) could reopen a path the CLI-level deny-tool flags intended to close, or whether deny is enforced globally regardless of which layer granted the allow. Confirm this before treating the `--deny-tool` flags as sufficient on their own; until confirmed, treat tightening the skill's `allowed-tools` (Section 6, item 1) as required, not optional.

---

## 10. Implementation checklist (what's left to actually build)

- [ ] `scripts/bounded-run.js` — Layer A enforcement (Section 4), including the deterministic `appendUnresolvedCsv` helper matching the existing CSV format.
- [ ] `.github/skills/playwright-cli/SKILL.md` — already exists (migrated from the Claude-skills folder); tighten `allowed-tools` to drop raw `npx`/`npm`, and add the offline-snapshot + locator-priority content as a clearly-separated project-specific section (or a sibling skill) rather than editing the vendored generic command reference in place (Section 6).
- [ ] Reconcile `.github/skills/playwright-cli/references/test-generation.md`'s existing live-browser, uncapped heal workflow with this plan's bounded/classified healing (Sections 4–5) — state explicitly which one governs CI runs (Section 6, item 3).
- [ ] Author `AGENTS.md` from scratch — it does not exist in the repo yet, so this is net-new content, tool-agnostic from the start, not a cleanup pass (Section 8). `OPENCODE.md`/`.opencode/`/`opencode.json`/`amplify-adapter/` were already deleted, so no other file-level cleanup is outstanding.
- [ ] `.healing-state/` — add to `.gitignore` or decide whether it should be committed per-branch (needs a decision: if it's gitignored, the state resets every fresh checkout, which defeats Layer A's persistence goal — **recommend committing it on the working branch during the generate+run job, not gitignoring it**).
- [ ] Content-hash manifest file for the dedup job (Section 7) — format TBD, simple JSON map of `{ filepath: sha256 }` is sufficient.
- [ ] `.github/workflows/` — new workflow(s) for lint, dedup, generate+run (matrix), distinct from the existing unchanged `playwright.yml`.
- [ ] Wire up `COPILOT_OTEL_ENABLED` / `COPILOT_OTEL_FILE_EXPORTER_PATH` in the generate+run job and upload the trace file as a workflow artifact (Section 3's OTel note) for cost observability.
- [ ] Decide and document the PAT/OAuth token strategy for `GH_TOKEN`/`COPILOT_GITHUB_TOKEN` in repo secrets (Section 9, item 2).
- [ ] Update `copilot-instructions.md` and `playwright-test-generator.agent.md` to explicitly state the `bounded-run.js`-only rule (Section 4) and reference the new `playwright-cli` skill instead of duplicating its content inline.

---

## 11. Explicit non-goals / things deliberately rejected in this design

- **Not** using GitHub Copilot's async coding agent (issue-assignment flow) as the primary driver — rejected for lack of synchronous external control (Section 3).
- **Not** using OpenCode + Amplify adapter — was unreliable, and the corresponding files had been deleted from the repo (Section 3, Section 8). **Update 2026-08-24:** reintroduced as an optional `--cli opencode` backend, not as the production driver — see the Section 3 update note and `docs/opencode-adapter.md`.
- **Not** relying on `--allow-all-tools` even though GitHub's own docs suggest it for programmatic use — deliberately using scoped `--allow-tool`/`--deny-tool` instead, because the deny-list is the structural enforcement mechanism this whole design depends on (Section 4).
- **Not** trusting the agent's self-reported `[HEAL ATTEMPT X/3]` text as the actual cap — that text can remain as a human-readable log line, but it is not what enforces the limit anymore (Section 4).
- **Not** burning heal attempts on failures that look like real app bugs or stale manual-test expectations rather than locator drift (Section 5).

---

## 12. Phase 2 candidates (deferred, not yet implemented)

Deliberately deferred rather than rejected — worth revisiting once the core
pipeline (Sections 1–11) is proven reliable end-to-end. Both target the same
goal: reduce redundant file reads/re-exploration across separate `copilot -p`
sessions, cutting token/credit consumption and improving throughput.

- **A hand-maintained project index** (e.g. `docs/pom-index.md`) listing every
  Page Object's public methods and which manual-test IDs each existing spec
  already covers, with `copilot-instructions.md`/`AGENTS.md` updated to say
  "check this index before reading full source files." Deterministic and
  auditable; main risk is drift if not kept in sync as Page Objects/tests
  change.
- **Copilot CLI's built-in `--enable-memory` flag** (cross-session fact
  recall, off by default in `-p` mode), backed by a `$COPILOT_HOME` directory
  (`~/.copilot` by default) that could be pointed at a path cached across CI
  runs via `actions/cache`. Riskier: it's an opaque, undocumented internal
  store (SQLite-backed), and caching mutable state across ephemeral runners
  carries staleness/corruption risk for unclear payoff — would need real
  testing to confirm it actually reduces re-reads before relying on it.
