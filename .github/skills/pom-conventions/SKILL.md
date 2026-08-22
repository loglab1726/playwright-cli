---
name: pom-conventions
description: Project-specific Page Object Model conventions for this repo — offline-snapshot-first UI discovery and locator priority/strategy rules for generating Playwright tests here.
allowed-tools: Bash(playwright-cli:*) Bash(node scripts/bounded-run.js:*)
disable-model-invocation: false
user-invocable: true
---

# Page Object Model Conventions (this repo)

This skill holds project-specific rules that are **not** part of the generic
`playwright-cli` tool reference (see the sibling `.github/skills/playwright-cli/`
skill for the command reference itself). Keeping these separate means the
generic skill can be updated from upstream without losing project rules, and
these rules stay in one place instead of drifting between `SKILL.md` and
`.github/copilot-instructions.md`.

The structural POM rules that apply repo-wide (BasePage, no `expect()` in page
objects, path aliases, `_` param naming, `expect.poll` config, test tagging)
live in `.github/copilot-instructions.md` and
`.github/agents/playwright-test-generator.agent.md` — this skill covers only
the two areas below.

## UI Reference — Offline Generation First

This project strictly uses `@playwright/cli` to avoid token overflow from
launching a live browser during generation.

- **Initial generation is offline.** Do not guess CSS selectors or launch a
  live browser to explore the app. The `.playwright-cli/*.yml` directory is
  the single source of truth for what elements exist on a page. Read the
  existing snapshot files to map short element refs (e.g. `e15`) to semantic
  Playwright locators.
- Only fall back to a live `playwright-cli open <url>` / `playwright-cli
  snapshot` session against the *specific failing page* when the offline
  snapshot doesn't cover the element you need — this is also the mechanism
  used during bounded healing (see `.github/copilot-instructions.md`,
  Execution & Self-Healing Protocol).
- Do not re-snapshot the whole app to fix one failing test. Scope any live
  snapshot to the page(s) actually implicated by the failure.

## Locator Priority & Strategy

Apply locators in this order, falling back only when a higher-priority option
genuinely isn't viable:

1. `getByRole(role, { name })`
2. `getByLabel(labelText)`
3. `getByPlaceholder(text)`
4. `getByText(text)`
5. `locator('css')` / `locator('xpath')` — only when no semantic locator works.
6. `locator('[data-testid="..."]')` — acceptable if test IDs already exist in
   the markup; don't add new `data-testid` attributes purely to make a
   locator easier.

**No emoji/symbol locator names.** Never use emojis or symbols (e.g. `♥`,
`♡`, `⭐`) as part of a locator's accessible name. If a semantic locator would
require one to target the element, fall back to a robust CSS selector
instead.

**No positional selectors.** Never use `:nth-child` or other index-based
selectors as the primary targeting strategy — they break silently the moment
sibling elements are reordered.
