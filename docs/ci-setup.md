# CI setup checklist (do this before enabling the pipeline)

This repo's `.github/workflows/manual-test-pipeline.yml` invokes the `copilot`
CLI headlessly. Before turning it on:

## 0. Free-tier budget (read this first if you're on Copilot Free)

GitHub moved Copilot billing from a flat request counter to usage-based **AI
Credits** on 2026-06-01. Chat, agent mode, code review, and **Copilot CLI**
all draw from this same credit pool — code completions are the only thing
that stays unmetered. This matters a lot for this pipeline specifically:

- **Agentic sessions are expensive.** A single agent session doing real work
  on a capable model has been reported to run several hundred credits
  ($3-12+ equivalent) in one interaction. Every `copilot -p ...` invocation in
  the `generate-and-run` job — one per manual-tests file, with up to 3 heal
  attempts happening *inside* that single invocation — is exactly this kind
  of session.
- **There's no default spending cap.** Once your included credits are used
  up, Copilot keeps working and bills overage until you manually set a limit.
  **Before running this pipeline even once**, go to
  **Settings → Billing → GitHub Copilot → Set spending limit** and set it to
  **$0** if you want a hard stop instead of a surprise bill. This control was
  only added 2026-07-02 — don't assume it's already on.
- **Check your actual current allowance** at
  `github.com/settings/billing` rather than trusting any specific number
  written here or in older articles — the exact Free-tier figure is
  genuinely unclear from current public sources and may have changed again
  since this was written.
- **The workflow defaults are deliberately conservative as a result:**
  `workflow_dispatch.max_files` caps a manual run to 1 file by default, and
  `generate-and-run`'s `max-parallel` is set to `1`. Run one manual-tests
  file, check the actual credit cost at the billing URL above, and only then
  consider raising either number. Don't push a multi-file commit to
  `manual-tests/` (which triggers the pipeline automatically) until you've
  done that one-file test run via `workflow_dispatch`.
- The `--max-ai-credits=40` value in the `copilot -p` invocation itself is
  carried over from the original design and was never validated against
  post-2026-06-01 real costs — treat it as a starting guess, not a
  known-safe number.

## 1. Copilot CLI install + auth token

**The `copilot` binary is not preinstalled on GitHub-hosted runners.** An
earlier version of `manual-test-pipeline.yml` had a "Pre-flight — confirm
skill/agent are discoverable" step that ran `copilot plugins list --json` and
only printed a `::warning::` on failure (never fails the job), so the missing
binary went unnoticed: the later `copilot -p ...` step also failed with
"command not found," was swallowed by that step's `set +e`, and the job still
reported "Successful" with nothing generated and no PR opened. Fixed by
adding an explicit `npm install -g @github/copilot` step (requires Node.js
22+, satisfied by the existing `node-version: lts/*` in this job) before the
pre-flight check.

Add a repo (or org) secret named `COPILOT_GITHUB_TOKEN`. The workflow reads it
into the `COPILOT_GITHUB_TOKEN` environment variable for the `copilot -p ...`
step, which is first in the CLI's auth precedence order
(`COPILOT_GITHUB_TOKEN` > `GH_TOKEN` > `GITHUB_TOKEN`).

**Requirements** (per `docs/pipeline-plan.md` Section 9, item 2 — confirm
against current GitHub docs before relying on this, since Copilot CLI has
been changing quickly):
- Fine-grained PAT (v2) with the **"Copilot Requests"** permission, OR an
  OAuth token from the Copilot CLI app / `gh` CLI app.
- Classic PATs (`ghp_...`) are **not** supported — don't use one here.

## 1.5 App-under-test secrets (required — tests fail without these)

`playwright.config.ts` and `tests/fixtures.ts` load these via `dotenv` from a
local `.env` file for local runs, but **no `.env` file exists in CI** — the
`generate-and-run` job wires them in as repo secrets instead. Without these
set, every generated test fails immediately on a missing baseURL or
credential, which looks like the agent generated a broken test but isn't.

Add these as repo secrets (Settings → Secrets and variables → Actions → New
repository secret):

| Secret name | Used for | Read by |
|---|---|---|
| `BASE_URL` | The app-under-test URL, e.g. `https://sedigaplanit.github.io/AI-R-D---Github-copilot/` | `playwright.config.ts`, `tests/auth.setup.ts` |
| `APP_URL` | Base URL for the `apiContext` fixture (pre-authenticated API calls) — may be the same value as `BASE_URL` if there's no separate API host | `tests/fixtures.ts` |
| `EMAIL_ADDRESS` | Login email for the test account | `tests/auth.setup.ts` |
| `PASSWORD` | Login password for the test account | `tests/auth.setup.ts` |

**Note on naming:** `.github/copilot-instructions.md` and `AGENTS.md`
previously documented these as `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`. That
was wrong — the actual code in `tests/auth.setup.ts` reads `EMAIL_ADDRESS`
and `PASSWORD`. Both docs have been corrected to match the code; use the
names in the table above, not the old doc names if you see them referenced
anywhere else (e.g. commit history, chat logs).

`.env.example` has also been corrected — it previously listed only
`AMPLIFY_*` variables left over from the removed OpenCode/Amplify adapter,
none of which the current code reads at all.

## 2. `gh` CLI auth for the finalize job

The `finalize` job in `manual-test-pipeline.yml` uses `gh pr create`. It's
wired to `secrets.GITHUB_TOKEN` (the default Actions token), which is
sufficient for opening a PR in the same repo. If branch protection or PR
creation is restricted beyond the default token's permissions in this org,
that job will need a PAT with `pull-requests: write` instead — swap the
`GH_TOKEN` env in that job if `gh pr create` fails with a permissions error.

## 3. Confirm before relying on in production (unverified items carried over from the design doc)

- `--sandbox` stability — confirm it isn't still experimental-only before
  treating it as CI isolation.
- Whether a skill's own `allowed-tools` frontmatter can widen back past a
  CLI-invocation `--deny-tool` flag, or whether deny always wins regardless of
  source. Until confirmed, the tightened `allowed-tools` in
  `.github/skills/playwright-cli/SKILL.md` should be treated as required, not
  a redundant belt-and-suspenders measure.
- Current `--max-ai-credits` cost-per-model figures, to sanity check the `40`
  used in the workflow is a sane ceiling and not either wasteful or too tight
  to let a real 3-attempt heal loop complete.
- **`--model claude-sonnet-4.6` is not available on this account/plan —
  fixed, using `--model auto` instead.** Confirmed locally: `copilot -p ...
  --model claude-sonnet-4.6` fails with `Error: Model "claude-sonnet-4.6"
  from --model flag is not available.` Several other explicit model names
  (`claude-sonnet-4.5`, `gpt-5`, `claude-opus-4.6`, `claude-haiku-4.5`) were
  probed and failed identically — only `--model auto` (let Copilot pick)
  actually works on this account. Both `manual-test-pipeline.yml` and
  `scripts/run-manual-test-locally.sh` now use `--model auto`. If your
  account/plan later supports pinning a specific model, re-check available
  names with an interactive `copilot` session (`/model`) before hardcoding
  one again — the CLI's error message doesn't itself list valid options.
- **`copilot plugins list --json` reports "The plugins command is not
  available" on this account/CLI version (1.0.80) — this is expected and
  harmless, not a sign anything is broken.** It reproduces identically in a
  local, authenticated session, so it isn't caused by a CI-only auth/install
  gap. The pre-flight step already tolerates this (`|| echo
  "::warning::..."`) and the job continues normally — don't treat this
  specific warning as something to fix.

## 4. Gap found and fixed in `.github/workflows/playwright.yml`

This file predates the pipeline work and `docs/pipeline-plan.md` explicitly
says to keep it unchanged as the independent validation gate. While wiring
the new workflow's app-under-test config, the same gap was found here too: it
ran `npx playwright test` on every push/PR but never set `BASE_URL`,
`APP_URL`, `EMAIL_ADDRESS`, or `PASSWORD` — the same four values from Section
1.5 above. Fixed by adding them to this workflow's `Run Playwright tests`
step `env:` block.

**Naming correction:** despite the "repo secrets" language in Section 1.5
above, this repo actually has these four configured as **repository
Variables** (Settings → Secrets and variables → Actions → Variables tab), not
Secrets — so both `playwright.yml` and `manual-test-pipeline.yml` read them as
`vars.BASE_URL` / `vars.APP_URL` / `vars.EMAIL_ADDRESS` / `vars.PASSWORD`, not
`secrets.*`. If you ever migrate these to real Secrets (recommended for
`PASSWORD` specifically, since Variables are plaintext and visible to anyone
with read access to the repo), switch both workflows back to `secrets.*` at
the same time.

## 5. Known issue found and fixed: generated code wasn't persisting

An earlier version of `manual-test-pipeline.yml` had `generate-and-run` write
files and (via agent-driven `git commit`) commit them locally, then relied on
a separate `finalize` job to push. GitHub Actions jobs each run on their own
disposable VM with no shared filesystem, so `finalize`'s fresh checkout never
saw anything `generate-and-run` did — the job reported "Successful" (it hit
an early "nothing to commit" exit) while silently discarding all generated
code. `generate-and-run` itself would report success too, since it never
attempted to push in the first place.

Fixed by moving the commit+push into `generate-and-run` itself, against a
shared per-run branch (`manual-test-pipeline/<run_id>`) that each sequential
matrix job fetches and continues. The agent no longer has any git write
access at all (`shell(git add:*)`, `shell(git commit:*)`, `shell(git push:*)`
are explicitly denied) — only the workflow commits, after inspecting the
actual on-disk result. `finalize` now only opens the PR once, checking
whether that branch has anything worth opening a PR for.

If a `generate-and-run` job ever reports success again with no
corresponding PR appearing, check the job's own logs for the "Commit and
push generated changes" step first — that's the step whose failure would
reproduce this exact symptom.

## 6. Serious issue found and fixed: `--allow-tool` could never scope to `scripts/bounded-run.js`, so the agent never actually ran it

`copilot help permissions` documents that shell permission matching happens
on the **stem** of the command, and that multi-token matching (e.g. `git
push`, `gh pr create`) is special-cased specifically for `git`/`gh`. Confirmed
by direct testing (both locally and reproduced in a live `generate-and-run`
job): `--allow-tool 'shell(node scripts/bounded-run.js:*)'` **never matches**
an actual `node scripts/bounded-run.js <spec>` invocation — only the bare
executable name (`node`) is recognized as the stem for a generic command, so
every single attempt was silently denied with "Permission denied and could
not request permission from user."

**Impact — worse than it sounds:** since `--no-ask-user` is set, the agent
can't fall back to asking for permission; it just gives up on running the
wrapper and writes up its own analysis as a final answer instead (e.g. "test
already covered, no changes needed"). The workflow's `outcome: success`
determination only checks the Copilot process's exit code and whether
`unresolved-test-failures.csv` grew — neither of those catches this, because
the agent still exits cleanly. **Every "successful" run so far — including
the one that produced PR #1 — never actually executed
`scripts/bounded-run.js` at all.** The "MANDATORY EXECUTION" requirement in
`.github/copilot-instructions.md` / `AGENTS.md` (generation is never complete
until the test has actually been run) was silently unenforced the whole time.

Fixed by broadening the allow pattern to `shell(node:*)` in both
`manual-test-pipeline.yml` and `scripts/run-manual-test-locally.sh` — the
narrowest pattern that actually works, confirmed by testing the same command
against both patterns side by side.

**This does weaken the Section 4 Layer B guarantee.** The explicit denies for
`shell(npx playwright test:*)` and `shell(npm test:*)` still block those two
specific bypass commands, but `shell(node:*)` now also allows *any other*
`node ...` invocation — e.g. the agent could still reach Playwright some
other way (calling its JS API directly from a one-off script, or
`node ./node_modules/.bin/playwright`) without going through the wrapper.
Layer A (`scripts/bounded-run.js`'s own durable, on-disk attempt counter)
remains the real enforcement; Layer B is now a partial mitigation relying on
the agent's instructions, not a structural guarantee, until Copilot CLI
supports finer-grained shell permission matching (see `docs/pipeline-plan.md`
Section 9, item 5, which flagged a related but distinct uncertainty about
this permission system before this specific limitation was confirmed).

**A prior, incorrect diagnosis:** an earlier fix attempt added a
backslash-path variant of the allow pattern (`shell(node scripts\bounded-run.js:*)`)
to `scripts/run-manual-test-locally.sh`, guessing the cause was a Windows
path-separator mismatch. It wasn't — the same failure reproduced identically
on Linux CI with the forward-slash-only pattern, which is what led to finding
the real cause above.

See `docs/pipeline-plan.md` Section 9 for the full list this was drawn from.
