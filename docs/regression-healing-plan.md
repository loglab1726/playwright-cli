# Plan: Bounded, human-reviewed self-healing for the regression suite

**Status:** Implemented, not yet exercised against a real failing run. This
document is self-contained, mirroring `docs/pipeline-plan.md`'s format — it
also doubles as this feature's issues-found-and-fixed log going forward, the
way `docs/ci-setup.md` does for `manual-test-pipeline.yml`.

## 1. The problem this solves, and the risk it must not introduce

`manual-test-pipeline.yml` already generates and bounded-heals brand-new
Playwright tests from `manual-tests/*.md`. That's safe because nothing real
depends on those tests yet — a bad generation attempt just gets rejected on
review.

Extending the same Copilot-CLI-driven healing to the actual regression suite
(`.github/workflows/playwright.yml`) is fundamentally riskier: if the app
genuinely regressed and a test correctly caught it, an unsupervised healer
could "fix" the test to match the new (possibly broken) behavior instead of
flagging the regression — silently defeating the exact thing this suite
exists to catch. `playwright.yml` must remain the untouched, canonical gate;
this is a separate, opt-in workflow (`.github/workflows/regression-heal.yml`)
that only ever proposes a human-reviewed PR, never changes what counts as
"passing."

## 2. The central safety mechanism: deterministic classification before any Copilot session exists

`scripts/classify-regression-failure.js` is a pure, regex-only function — no
LLM is ever in the stop/go decision for whether a failure is safe to heal.
Extends the failure table already in `docs/pipeline-plan.md` Section 5 with
an explicit conservative bias:

| Classification | Meaning | May heal? |
|---|---|---|
| `LOCATOR_DRIFT` | Timeout on a locator call, a strict-mode violation, or an action timeout — with no accompanying value comparison. | Yes |
| `ASSERTION_MISMATCH` | An explicit `Expected:`/`Received:` pair, or a `toBe`/`toEqual`/`toMatch`/`toContain` failure — a real value was compared and didn't match. This is exactly the shape a real app regression takes. | **Never** |
| `ENVIRONMENT_ISSUE` | A network/connection/auth error that survived the flake-filter re-run (see Section 3). | **Never** |
| `NEEDS_REVIEW` | Default-deny: anything that doesn't cleanly match `LOCATOR_DRIFT`. | **Never** |

Checked in priority order (see the script's comments for why): a value
comparison is checked FIRST, because `expect.poll`-based mismatches (this
repo has a real one — `profileTests.spec.ts`'s Full Name check) also say
"Timeout ... exceeded" in their error text, which would otherwise look
indistinguishable from a plain locator timeout. Verified directly against
three real error strings from this repo's own history (the `profileTests.spec.ts`
mismatch, a `getByRole(...).toBeVisible()` timeout, and the
`checkoutTests.spec.ts` strict-mode violation) before wiring it into the
workflow — see the script's own doc comment for the exact commands.

The rationale for default-deny: a wrong "stop" costs one extra human review.
A wrong "proceed" can let an agent quietly rewrite an assertion to hide a
real regression. Those costs are not symmetric, so ambiguity always resolves
to the cheap mistake.

Defense in depth: even for a spec that WAS classified `LOCATOR_DRIFT`, the
`regression-test-healer` agent persona (`.github/agents/regression-test-healer.agent.md`)
is instructed to independently stop — making no change at all — if it
discovers mid-investigation that the real fix would require changing an
`expect()`'s expected value or loosening an assertion. This guards against
classifier false negatives, not just agent overreach.

## 3. Getting machine-readable failure data without touching the real gate

`playwright.config.ts` now runs a JSON reporter alongside HTML:
`reporter: [['html'], ['json', { outputFile: 'playwright-report/results.json' }]]`.
This is additive only — `playwright.yml`'s pass/fail is still exactly
`npx playwright test`'s exit code, unaffected by an extra reporter running in
parallel.

`regression-heal.yml`'s `classify` job re-runs the full suite itself, at the
exact commit SHA the human operator supplies, rather than pulling artifacts
from the original failing `playwright.yml` run. This re-run does double duty:

- It's a **free flake-filter** — anything that passes on re-run is dropped
  before classification ever sees it, consistent with Section 5's existing
  "environment flake → retry once, no code change" guidance.
- It's how `scripts/parse-test-results.js` gets `results.json` to parse in
  the first place, without any cross-workflow artifact-download complexity.

## 4. Trigger: `workflow_dispatch`-only

Inputs: `sha` (required), `spec` (optional, scope to one file/pattern). No
`workflow_run` auto-trigger on every `playwright.yml` failure.

`manual-test-pipeline.yml` itself started at `max_files: 1` for manual
dispatch specifically to prove real cost/behavior before widening exposure —
on the *lower-risk* pipeline. Regression healing is strictly higher-risk, so
it deserves at least the same caution: a human looks at a failed run and
deliberately opts in to attempting a heal on it, rather than every red X on
`main` automatically spending Copilot credits and opening a PR. Auto-trigger
can be revisited once classification accuracy is proven manually across a
number of real runs.

## 5. Output: a shared branch + report, never auto-merged

Branch `regression-heal/<run_id>`, seeded by the `classify` job with
`regression-heal-report.md` — every failure, its classification, and (for
anything not `LOCATOR_DRIFT`) the full expected-vs-actual error text, shown
**up front**, before any heal attempt section. Each `heal` matrix job appends
its own outcome line rather than editing an existing table row in place
(simpler and avoids any in-place-text-mutation race between sequential
matrix jobs sharing one branch).

`finalize` always opens the PR as **draft + `needs-human`** whenever anything
needed review or any heal attempt hard-stopped/failed — never a plain,
mergeable-looking PR in that case. Only when 100% of failures were cleanly
classified `LOCATOR_DRIFT` and every one healed successfully does it open a
normal PR — which still requires a human to merge, and `playwright.yml`
re-running on that PR remains the real gate either way.

## 6. Infrastructure reused as-is, and lessons applied proactively

This workflow reuses, unmodified, several hard-won fixes already proven in
`manual-test-pipeline.yml` (see `docs/ci-setup.md` for the full incident
history) — applied here from the start rather than rediscovered the hard way:

- The exact `--allow-tool`/`--deny-tool` set (Sections 6 and 8 of
  `docs/ci-setup.md`): bare `shell` and `write` allows (narrower patterns
  like `shell(node scripts/bounded-run.js:*)` never actually match — Copilot
  CLI's permission matching is stem-based, not multi-token, for anything
  other than `git`/`gh`), with explicit denies for git write, the raw test
  runner, and `.env`/`.auth` reads. Denial genuinely overrides allow —
  confirmed by direct testing, not just documentation, when this set was
  first worked out.
- The shared-branch-per-run pattern, where each matrix job commits and
  pushes its own work directly before its disposable VM tears down (GitHub
  Actions jobs don't share a filesystem — an earlier version of
  `manual-test-pipeline.yml` silently discarded a whole run's output by
  missing this).
- The idempotent `gh label create needs-human --force` immediately before
  using that label — `gh pr create --label` fails outright, discarding the
  entire PR (including any genuinely good changes from other matrix jobs in
  the same run), if the label doesn't already exist.
- `scripts/bounded-run.js` gained optional `--csv-path`/`--state-dir` flags
  (default-compatible — `manual-test-pipeline.yml`'s call site needs no
  changes) so this pipeline's dead-letter CSV
  (`unresolved-regression-failures.csv`) and attempt-state directory
  (`.healing-state-regression/`) never interleave writes with the other
  pipeline's, in case both ever run concurrently.

## 7. Verification performed before relying on this

- `scripts/classify-regression-failure.js` unit-checked via its `--text=`
  mode against the three real error strings named in Section 2.
- `scripts/parse-test-results.js` verified against a synthetic Playwright
  JSON-reporter fixture with nested `describe` suites and multiple retry
  attempts per test — confirmed it correctly recurses nested suites, and
  correctly uses only the LAST retry's result/error (not an earlier,
  possibly-different-looking transient one).
- The two scripts' end-to-end composition (`parse-test-results.js` piped into
  `classify-regression-failure.js`) verified against that same fixture.
- Every `run:` block in `regression-heal.yml` extracted post-YAML-parse
  (via PyYAML) and syntax-checked with `bash -n` after substituting
  `${{ ... }}` GitHub Actions expressions with placeholders — including the
  heredoc'd report-building script in the `classify` job, which was also
  extracted and actually executed against a sample classified-failures array
  to confirm both its `GITHUB_OUTPUT` lines and its Markdown report render
  correctly.

## 8. Things to confirm on the first real dispatch (unverified until then)

- Whether `copilot`'s `--model auto` and AI-credit cost for a heal session
  here tracks similarly to `manual-test-pipeline.yml`'s generation sessions,
  or differs meaningfully (a repair task reading an existing spec vs.
  generating one from scratch could plausibly cost less or more).
- Whether the classifier's regexes hold up against failure shapes not yet
  seen in this repo's history — the default-deny bias means a miss just
  means an extra `NEEDS_REVIEW` entry, not a wrongly-healed test, but it's
  worth tracking which real failures land in `NEEDS_REVIEW` unnecessarily so
  the classifier can be sharpened over time without ever loosening the
  ASSERTION_MISMATCH/ENVIRONMENT_ISSUE boundaries.
- Whether `regression-test-healer`'s stop-bias instructions actually hold up
  under a real ambiguous case, not just the explicit examples in its
  `.agent.md` — this is instruction-following, not a structural guarantee,
  so the classify step's upstream filtering remains the real safety net.

## 9. Issue found and fixed on the first real dispatch: ANSI escape codes broke classification

The first real `regression-heal.yml` run (against `authenticationTests.spec.ts`'s
"authenticated user redirected from login" test — the same known app gap
identified earlier as TC_AUTH_014) surfaced a real classifier bug: a genuine
`expect(received).toMatch(expected)` failure — `Expected pattern: /\/AI-R-D---Github-copilot\/?$/`
vs. `Received string: ".../login"`, a textbook `ASSERTION_MISMATCH` — landed
in the generic `NEEDS_REVIEW` bucket instead.

Root cause: Playwright's `expect()` error formatter embeds real ANSI color
escape codes directly into the captured error text, even in the JSON
reporter's output (e.g. `expect(\x1b[22m\x1b[31mreceived\x1b[39m...` instead
of a clean `expect(received)`). Left unstripped, those codes fragment
`VALUE_COMPARISON_MATCHERS`'s token matching mid-string. Separately,
`toMatch()` failures say `Expected pattern:`/`Received string:`, not the
exact `Expected:`/`Received:` the original regex required — `toContain`,
`toEqual`, etc. have their own similar variants.

**The safety guarantee held regardless** — `NEEDS_REVIEW` is, like
`ASSERTION_MISMATCH`, in the never-auto-heal bucket, so nothing was
incorrectly healed. This was a labeling-accuracy bug, not a safety bug — but
worth fixing so the report's classification is actually informative.

Fixed in `scripts/classify-regression-failure.js`: strip ANSI escape codes
(`/\x1b\[[0-9;]*[a-zA-Z]/g`) before running any classification regex, and
broadened `EXPECTED_LINE`/`RECEIVED_LINE` to match `Expected <word(s)>:` /
`Received <word(s)>:` generally, not just the exact literal. Re-verified
against the real failure text (now correctly `ASSERTION_MISMATCH`) and all
five original test cases from Section 7 (no regressions).

See `docs/ci-setup.md` for the parallel log on `manual-test-pipeline.yml`,
and `docs/pipeline-plan.md` Section 5 for the failure-classification concept
this design extends.
