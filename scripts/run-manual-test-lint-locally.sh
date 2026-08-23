#!/usr/bin/env bash
# scripts/run-manual-test-lint-locally.sh
#
# Local mirror of the `lint` job in .github/workflows/manual-test-lint.yml.
# Lets you check manual-tests/*.md files before pushing instead of waiting
# on CI to tell you a section is missing.
#
# Usage:
#   ./scripts/run-manual-test-lint-locally.sh
#     Lints whatever manual-tests/*.md files differ from origin/main (or
#     main, if there's no origin) — same intent as the CI diff against the
#     push/PR base SHA. Falls back to linting every manual-tests/*.md file
#     if no usable base ref is found, same as CI does on a first push.
#
#   ./scripts/run-manual-test-lint-locally.sh manual-tests/TC_AUTH_001_*.md
#     Lints exactly the files you pass, skipping the diff step entirely.
#
# No prerequisites beyond Node — this doesn't touch Copilot CLI, .env, or
# the live app; it's a pure static check of the .md files.

set -euo pipefail

if [ "$#" -gt 0 ]; then
  FILES=("$@")
else
  BASE_REF=""
  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    BASE_REF="origin/main"
  elif git rev-parse --verify main >/dev/null 2>&1; then
    BASE_REF="main"
  fi

  if [ -z "$BASE_REF" ]; then
    echo "No usable base ref (origin/main or main) — linting all manual-tests files."
    mapfile -t FILES < <(git ls-files 'manual-tests/*.md')
  else
    mapfile -t FILES < <(git diff --name-only --diff-filter=ACMR "$BASE_REF" HEAD -- 'manual-tests/*.md')
    if [ "${#FILES[@]}" -eq 0 ]; then
      echo "No manual-tests/*.md files changed relative to $BASE_REF — nothing to lint."
    fi
  fi
fi

if [ "${#FILES[@]}" -eq 0 ]; then
  exit 0
fi

echo "== Linting: ${FILES[*]} =="
node scripts/lint-manual-test.js "${FILES[@]}"
