# CI setup checklist (do this before enabling the pipeline)

This repo's `.github/workflows/manual-test-pipeline.yml` invokes the `copilot`
CLI headlessly. Before turning it on:

## 1. Copilot CLI auth token

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

See `docs/pipeline-plan.md` Section 9 for the full list this was drawn from.
