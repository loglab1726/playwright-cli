# Regression healing report

Run: 32588095159
Target commit: 1e29f53fffc61bae8690df68fa7a5229911cf8e3

## ⚠️ Needs human review (never auto-healed)

These failures were deliberately NOT handed to the healer — see docs/regression-healing-plan.md for why each category is excluded.

### `authenticationTests.spec.ts` — authenticated user navigating to /login is redirected to home page
**Classification:** NEEDS_REVIEW

```
Error: URL should redirect to home page

URL should redirect to home page

[2mexpect([22m[31mreceived[39m[2m).[22mtoMatch[2m([22m[32mexpected[39m[2m)[22m

Expected pattern: [32m/\/AI-R-D---Github-copilot\/?$/[39m
Received string:  [31m"https://sedigaplanit.github.io/AI-R-D---Github-copilot/login"[39m

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate

  253 |       intervals: [250, 500],
  254 |       message: 'URL should redirect to home page',
> 255 |     }).toMatch(/\/AI-R-D---Github-copilot\/?$/);
      |        ^
  256 |
  257 |     await expect.poll(() => authPage.isAuthenticated(), {
  258 |       timeout: 5000,
    at /home/runner/work/playwright-cli/playwright-cli/tests/authenticationTests.spec.ts:255:8
```

## Attempted heals

None — every failure needed human review.
