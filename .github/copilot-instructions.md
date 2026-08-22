# GitHub Copilot Instructions — UI Automation Suite

## 🚨 Vocabulary & Trigger Override 🚨
When the user asks you to "generate", "create", "map", or "write" a test, you MUST treat it as a mandatory multi-step macro:
1. Scan existing directories to prevent redundancy.
2. Generate/Update the POM.
3. Generate/Append the Spec file.
4. IMMEDIATELY use your terminal/shell capabilities to execute the spec using `node scripts/bounded-run.js <path>` (never `npx playwright test` directly — see Execution & Self-Healing Protocol below).
The act of "generation" is NEVER complete until the test has been executed in the terminal.

## Project Structure

```text
pages/                             # Page Object classes — one file per page/section
tests/                             # Spec files — one file per feature area
tests/fixtures.ts                  # Custom Playwright fixture — exports test, expect, and open
manual-tests/                      # Markdown files describing manual test steps
.playwright-cli/                   # Offline UI snapshots (YAML files)
scripts/bounded-run.js             # The ONLY entry point for executing tests in an automated session
scripts/compute-manual-test-hashes.js  # Content-hash manifest helper for the dedup CI job
scripts/lint-manual-test.js        # Validates manual-tests/*.md have required sections
unresolved-test-failures.csv       # Dead-letter log, written only by scripts/bounded-run.js
manual-test-hash-manifest.json     # { filepath: sha256 } of last-successfully-generated manual tests
.healing-state/                    # Per-spec heal-attempt counters (committed, not gitignored)
AGENTS.md                          # Tool-agnostic project rules (read alongside this file)
docs/pipeline-plan.md              # Full pipeline design rationale
```

## Module Consolidation & Anti-Redundancy

- Tests MUST be logically grouped by module or feature area into a single spec file (e.g., all checkout flows belong in `CheckoutTests.spec.ts`).
- NEVER create separate files for variations of the same feature. Always read the `tests/` and `pages/` directories first to append to existing files and reuse existing methods rather than duplicating code.

## Naming Conventions

- **Page objects**: PascalCase, suffix `Page` (e.g., `CartPage.ts`, `LandingPage.ts`)
- **Spec files**: PascalCase, suffix `Tests.spec.ts` (e.g., `CartTests.spec.ts`, `CheckoutTests.spec.ts`)
- **Page object methods**: camelCase, verb-first (e.g., `clickCheckout()`, `fillEmail()`, `isConfirmationVisible()`)
- **Path aliases**:
  - `@pages/{feature-folder}/{PageName}` — page object imports
  - Import `{ test, expect }` from `'../fixtures'` — never from `@playwright/test` directly

## Key Rules

- Every page object class must extend `BasePage` and implement `async init(): Promise<this>`.
- Do **not** modify `BasePage.ts` unless adding a shared utility every page needs.
- **Strict Environment Variables**: Use `process.env.EMAIL_ADDRESS` and `process.env.PASSWORD` for credentials (see `tests/auth.setup.ts`); never hardcode them.
- Never call `expect()` inside a page object — return raw values or other Page Objects only.
- **Complete Method Chaining & Resumption**: 
  - Always use the `open` fixture to start a chain.
  - You MUST strictly use `_` as the parameter name inside EVERY `.then()` callback (e.g., `await open(LandingPage).then((_) => _.clickProfileButton())`). NEVER use `page` or `p`.
  - **Handling Assertions**: If an assertion (like `expect.poll`) interrupts the chain, you MUST resume chaining for the next sequence of actions. NEVER write sequential, isolated `await` statements for actions.
- **Mandatory Polling Configuration**: Always use `expect.poll` for assertions. You MUST strictly include the configuration object (`{ timeout, intervals, message }`) in every single `expect.poll` call. Never omit these properties.
- Auth storage state is applied globally via `playwright.config.ts`; do not add `test.use(storageState)` unless the test must run **without** auth.
- For circular page-object imports (A→B and B→A), use `import type` at the top and a dynamic `import('@pages/...')` inside the method body. Never use relative paths for dynamic imports.

## UI Reference & Locator Strategy

See the `pom-conventions` skill (`.github/skills/pom-conventions/SKILL.md`)
for the offline-snapshot-first UI discovery rule and the locator priority
order. Kept as a skill rather than duplicated here so it can't drift out of
sync with the version other tooling (including the `playwright-cli` skill)
reads.

## Execution & Self-Healing Protocol

If a UI test fails, follow the **Bounded Self-Healing Loop**. In automated
(CI) sessions, this loop is enforced in code, not just by these instructions
— see `docs/pipeline-plan.md` Section 4 for the full rationale:

1. **MANDATORY EXECUTION — via the wrapper only**: You MUST run the test using
   `node scripts/bounded-run.js <path>`. You may **never** call
   `npx playwright test` or `npm test` directly — those commands are denied
   at the tool-permission layer for automated sessions (see
   `.github/skills/playwright-cli/SKILL.md`), so a direct call will fail
   regardless. Never use `--list` or a dry-run; the wrapper always executes
   the test fully.
2. **Targeted CLI Fix**: Execute `playwright-cli open <url>` and `playwright-cli snapshot` ONLY against the specific failing page to find the new element structure. Update the Page Object class accordingly. See the `pom-conventions` skill for offline-first snapshot rules.
3. **The 3-Strike Rule**: `scripts/bounded-run.js` maintains the actual attempt
   counter in `.healing-state/<spec-hash>.json`, which persists across
   separate invocations, pipeline reruns, and context resets. It prints
   `[HEAL ATTEMPT X/3]` before each run and exits with a distinct code for
   "failed, attempts remain" (`1`) vs. "hard-stopped" (`2`). Treat that exit
   code as authoritative — do not attempt a 4th run even if you believe you
   know the fix; if the wrapper reports a hard stop, stop.
4. **CSV Fallback Logging**: On hard stop, `scripts/bounded-run.js` appends
   the row to `unresolved-test-failures.csv` itself (`Timestamp, Test Name,
   Failing Step/Locator, Error Summary`) — you do not need to write this row
   yourself, and should not append a second one.
5. **Failure classification before healing**: before spending a heal attempt,
   classify the failure (locator drift vs. possible real app bug/stale
   manual-test expectation vs. environment flake) per `docs/pipeline-plan.md`
   Section 5. Do not burn heal attempts re-deriving locators against a
   business-logic mismatch.

## Test Tagging

All tests must carry tags for selective test runs:

| Tag | Scope |
| --- | --- |
| `@ui` | All UI/browser test specs |
| `@smoke` | Critical happy-path tests (subset for fast CI validation) |
| `@checkout`, `@cart`, `@auth`, `@products` | Domain-specific tags |

Apply at **describe** level for domain/type tags, and at **test** level for `@smoke`:

```typescript
test.describe('Cart Flow', { tag: ['@ui', '@cart'] }, () => {
  test('adds item successfully', { tag: '@smoke' }, async ({ open }) => { ... })
})
```