# playwright-cli-demo

A TypeScript + Playwright end-to-end test suite for the [OneStyle demo e-commerce app](https://sedigaplanit.github.io/AI-R-D---Github-copilot/), built with the Page Object Model (POM) pattern. The repo also includes a CI pipeline that turns manual test case descriptions into generated, executed, self-healing Playwright specs using the GitHub Copilot CLI.

## Tech stack

- [Playwright Test](https://playwright.dev/) + TypeScript
- Page Object Model, with a custom `open` fixture (`tests/fixtures.ts`) for chaining page objects
- `dotenv` for local environment configuration

## Project structure

```
pages/                  Page Object classes — one per page/section, extend BasePage
tests/                  Spec files — one per feature area
tests/fixtures.ts       Custom fixture exporting `open` and `apiContext`
tests/auth.setup.ts     Logs in once and saves storage state for all authenticated tests
manual-tests/           Markdown manual test cases — trigger source for the generation pipeline
.playwright-cli/        Offline UI snapshots (YAML) used as a locator reference
scripts/                Helper scripts (see below)
docs/                   Pipeline design docs — manual-test generation, CI setup log, regression healing
.github/workflows/      CI workflows (see below)
.github/agents/         Custom Copilot CLI agent personas (test generation, regression healing)
.github/skills/         Copilot CLI skills (playwright-cli command reference, POM conventions)
```

## Setup

1. Install dependencies and browsers:
   ```bash
   npm ci
   npx playwright install --with-deps
   ```
2. Copy `.env.example` to `.env` and fill in the app-under-test config:
   ```
   BASE_URL=https://sedigaplanit.github.io/AI-R-D---Github-copilot/
   APP_URL=https://sedigaplanit.github.io/AI-R-D---Github-copilot/
   EMAIL_ADDRESS=<test account email>
   PASSWORD=<test account password>
   ```
   `playwright.config.ts` loads these via `dotenv` automatically for local runs.

## Running tests

```bash
npm test              # run the full suite headlessly
npm run test:headed   # run with a visible browser
npm run test:debug    # run in Playwright's debug/inspector mode
npm run test:report   # open the last HTML report
```

The `setup` project (`tests/auth.setup.ts`) runs first and logs in once, saving storage state to `.auth/user.json` for every authenticated test — see `playwright.config.ts` for the project/dependency wiring.

## CI workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `playwright.yml` | push/PR to `main`/`master` | Runs the full test suite. This is the real pass/fail gate — it runs independently of the pipeline below and its output is never overridden by it. |
| `manual-test-lint.yml` | push/PR touching `manual-tests/**.md` | Validates new/changed manual test files have the required sections before spending any AI credits on them. |
| `manual-test-pipeline.yml` | push touching `manual-tests/**.md`, or manual dispatch | Dispatches the GitHub Copilot CLI to generate, execute, and bounded-self-heal a Playwright spec for each new/changed manual test file, then opens a PR with the result. |
| `regression-heal.yml` | manual dispatch only (`sha`, optional `spec`) | Re-runs the regression suite at a given commit and attempts a bounded Copilot heal — but ONLY for failures classified as pure locator/element drift. Anything that looks like a real assertion/value mismatch or an environment issue is deliberately never auto-healed; it's surfaced for human review instead. See `docs/regression-healing-plan.md`. |

Both Copilot-driven pipelines are billed against GitHub Copilot AI credits — see `docs/ci-setup.md` ("Free-tier budget") before enabling or re-tuning either.

## The manual-test-to-Playwright pipeline

Manual test cases live in `manual-tests/*.md` as structured Markdown (see any existing file for the template — Test Case ID, Test Steps, Expected Result are required; Feature Area, Priority, Preconditions, Notes, and Defect Opportunity are recommended). Pushing a new or changed file there triggers `manual-test-pipeline.yml`, which:

1. **Dedups** — hashes each manual test file against `manual-test-hash-manifest.json` to find what actually changed.
2. **Generates and runs** — invokes `copilot -p ...` (using the `playwright-test-generator` agent and the `pom-conventions`/`playwright-cli` skills) to write/update a Page Object and spec, then executes it via `scripts/bounded-run.js` — never directly via `npx playwright test`.
3. **Bounded self-heals** — up to 3 attempts per spec, tracked durably in `.healing-state/`. A hard stop logs a dead-letter row to `unresolved-test-failures.csv` instead of retrying forever.
4. **Opens a PR** against `main` with the generated code (or a draft, `needs-human`-labeled PR if anything hit the hard-stop cap). The existing `playwright.yml` suite is still the real validation gate for that PR.

To iterate on the generate/heal step without a full push → CI → log-read cycle, run it locally:

```bash
./scripts/run-manual-test-locally.sh manual-tests/TC_AUTH_001_signup-form-toggle-from-login-page.md
```

This makes real, billed Copilot CLI requests and writes real files in your working tree — nothing is committed or pushed, so review with `git status`/`git diff` and discard with `git checkout -- <file>` if needed.

See **`docs/pipeline-plan.md`** for the full design rationale and **`docs/ci-setup.md`** for the setup checklist plus a running log of issues found (and fixed) while getting this pipeline working end-to-end — worth reading before assuming a given piece of it already works as designed.

## The regression-suite healing pipeline

`regression-heal.yml` extends the same bounded-heal machinery to the actual
regression suite — but with a materially different risk posture, since a bad
heal here could mask a real app regression instead of a broken net-new test.
It's manual-dispatch-only (pick a failed `playwright.yml` run's commit SHA)
and never trusts an LLM with the stop/go decision:

1. **Re-runs the suite at that exact commit** — this doubles as a free flake
   filter (anything that passes on re-run never reaches classification) and
   produces `playwright-report/results.json` for parsing.
2. **Classifies every still-failing test deterministically** via
   `scripts/classify-regression-failure.js` — a pure regex classifier, no
   model involved. Only failures that look like pure selector/element drift
   (`LOCATOR_DRIFT`) ever get handed to Copilot. Anything that looks like a
   real value/assertion mismatch, an environment issue, or anything
   ambiguous is routed straight to human review — never auto-healed.
3. **Bounded-heals only the safe ones**, using the `regression-test-healer`
   agent (a stricter, separate persona from `playwright-test-generator` —
   see `.github/agents/regression-test-healer.agent.md`) and its own
   dead-letter CSV/state dir (`unresolved-regression-failures.csv`,
   `.healing-state-regression/`) so it never interleaves with the manual-test
   pipeline's.
4. **Opens a PR** — always draft + `needs-human`-labeled if anything needed
   review or hard-stopped, with the full expected-vs-actual shown up front in
   `regression-heal-report.md` on that branch. `playwright.yml` re-running on
   the PR remains the real, untouched validation gate either way.

See **`docs/regression-healing-plan.md`** for the full design and the safety
reasoning behind the classification boundaries.

## Scripts reference

| Script | Purpose |
|---|---|
| `scripts/bounded-run.js [--csv-path=<file>] [--state-dir=<dir>] <spec>` | The only sanctioned way to execute a spec in an automated session — enforces the 3-attempt heal cap and dead-letter logging. The optional flags let a second pipeline (regression-heal.yml) point at its own CSV/state dir instead of the defaults. |
| `scripts/compute-manual-test-hashes.js check\|update\|list` | Content-hash manifest management for the dedup CI job. |
| `scripts/lint-manual-test.js <file...>` | Validates manual test Markdown files have the required sections. |
| `scripts/run-manual-test-locally.sh <manual-tests/FILE.md>` | Local mirror of the manual-test pipeline's generate+heal step, for fast iteration. |
| `scripts/parse-test-results.js <results.json>` | Flattens Playwright's JSON reporter output into a list of still-failing tests (file, title, error) — used by `regression-heal.yml`. |
| `scripts/classify-regression-failure.js <failures.json>` \| `--text="<error>"` | The regression-heal pipeline's deterministic, regex-only safety classifier — see `docs/regression-healing-plan.md`. |

## Conventions

- Every Page Object extends `BasePage` and implements `async init(): Promise<this>`.
- Never call `expect()` inside a Page Object — return raw values or other Page Objects only; assertions live in spec files.
- Never write a raw locator/`getBy...` call inside a `.spec.ts` file — locators live only in `pages/`.
- Use path aliases (`@pages/...`) for imports, not relative paths across the `pages/`/`tests/` boundary.
- Every assertion uses `expect.poll` with a full `{ timeout, intervals, message }` config.
- Credentials come only from `process.env.EMAIL_ADDRESS`/`process.env.PASSWORD` — never hardcoded.

See `AGENTS.md` and `.github/copilot-instructions.md` for the complete, authoritative set of conventions used by both human contributors and the generation pipeline.
