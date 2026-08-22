# AGENTS.md

Project-wide rules for any AI coding agent working in this repo. This file is
tool-agnostic by design — it does not name or depend on any specific AI CLI or
IDE. Tool-specific mechanics (agent personas, tool-permission flags, skill
wiring) live in `.github/copilot-instructions.md` and
`.github/agents/playwright-test-generator.agent.md` instead, so those two
categories of instruction don't drift out of sync with each other.

## What this repo is

A TypeScript + Playwright UI test automation suite, using the Page Object
Model (POM) pattern, with a pipeline that turns manual test case descriptions
(`manual-tests/*.md`) into generated, executed, self-healing Playwright specs.

## Project structure

```
manual-tests/                     # Markdown manual test cases (pipeline trigger source)
.playwright-cli/*.yml              # Offline UI snapshots — source of truth for locators
pages/                             # Page Object classes, one per page/section, extend BasePage
tests/                             # Spec files, one per feature area
tests/fixtures.ts                  # Custom fixture exporting `open` and `apiContext`
scripts/bounded-run.js             # The ONLY way to execute tests in an automated session
scripts/compute-manual-test-hashes.js  # Dedup-job helper (content-hash manifest)
unresolved-test-failures.csv       # Dead-letter log for tests that hit the heal-attempt cap
manual-test-hash-manifest.json     # { filepath: sha256 } — last-successfully-generated hashes
.healing-state/                    # Per-spec attempt counters (committed, not gitignored)
docs/pipeline-plan.md              # Full design rationale for the pipeline (this file is a summary)
```

## Structural POM rules (apply to every generated or hand-written test)

- Tests are grouped by feature area into one spec file per domain (e.g. all
  checkout flows go in `checkoutTests.spec.ts`). Never fragment a feature area
  into multiple files for different variations.
- Every Page Object class extends `BasePage` and implements
  `async init(): Promise<this>`.
- Never call `expect()` inside a Page Object. Page Objects return raw values
  or other Page Objects only — assertions live in spec files.
- Never write a raw locator or `getBy...` call inside a `.spec.ts` file.
  Locators live only inside `pages/` classes.
- Use path aliases only (e.g. `@pages/LandingPage`) for imports. No relative
  imports across the `pages/`/`tests/` boundary.
- Spec files start every chain with the `open` fixture. Callbacks passed to
  `.then(...)` must use `_` as the parameter name — never `page` or `p`.
- Every assertion uses `expect.poll`, and every `expect.poll` call includes
  the full `{ timeout, intervals, message }` configuration object.
- Locator priority order and the offline-snapshot-first UI discovery rule are
  documented in the `pom-conventions` skill
  (`.github/skills/pom-conventions/SKILL.md`) — read that before generating
  or healing any locator.
- Credentials come only from `process.env.EMAIL_ADDRESS` /
  `process.env.PASSWORD` (see `tests/auth.setup.ts`). Never hardcode credentials.
- Auth is applied globally via `storageState` in `playwright.config.ts`. Don't
  override it per-test unless the test must run unauthenticated.
- Tests carry tags (`@ui`, `@smoke`, and a domain tag like `@checkout`) — see
  `.github/copilot-instructions.md` for the full tagging table.

## Bounded self-healing (applies to every automated session)

If a generated test fails, an agent may attempt to heal it, but the healing
loop is bounded and the cap is enforced in code, not by the agent
self-counting:

- Tests are executed **only** via `node scripts/bounded-run.js <spec>`. Direct
  `npx playwright test` / `npm test` invocation is not permitted in automated
  sessions and is denied at the tool-permission layer for tools that support
  scoped permissions.
- `scripts/bounded-run.js` maintains a durable, per-spec attempt counter under
  `.healing-state/`, persisted across separate invocations, reruns, and
  context resets. It hard-stops at 3 attempts and writes the dead-letter row
  to `unresolved-test-failures.csv` itself.
- Before spending a heal attempt, classify the failure: locator drift
  (proceed to heal), a possible real app bug or stale manual-test expectation
  (stop immediately, log as `needs-human-review`, do not consume further
  attempts), or an environment/network flake (retry once with no code
  change). See `docs/pipeline-plan.md` Section 5 for the full classification
  table.
- Treat `scripts/bounded-run.js`'s exit code as authoritative: `0` = passed,
  `1` = failed with attempts remaining, `2` = hard-stopped. Never attempt a
  4th run after exit code `2`, regardless of how confident you are in a fix.

## Non-goals (don't reintroduce these)

- No OpenCode / Amplify adapter. It was removed from this repo for
  reliability reasons and should not be reintroduced.
- No live-browser exploration during initial test generation. Use the
  `.playwright-cli/*.yml` offline snapshots first; only fall back to a live
  `playwright-cli open`/`snapshot` session against the specific failing page
  during healing.
- No uncapped or prompt-only healing loops in CI. The cap must be enforced by
  `scripts/bounded-run.js`, not by an agent's own attempt counter.

## Where to look for more detail

- Full pipeline design and rationale: `docs/pipeline-plan.md`
- Tool-specific instructions (whichever agent CLI is in use): check for a
  matching `.github/copilot-instructions.md`, `.github/agents/*.agent.md`, or
  equivalent tool-specific file before assuming this file is the complete
  picture — this file intentionally does not duplicate tool-specific
  permission flags or invocation syntax.
