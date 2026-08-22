# Regression healing report

Run: 32589341729
Target commit: 4209be0106c4371ff502b6ee19b418823536f1e0

## ⚠️ Needs human review (never auto-healed)

These failures were deliberately NOT handed to the healer — see docs/regression-healing-plan.md for why each category is excluded.

### `authenticationTests.spec.ts` — authenticated user navigating to /login is redirected to home page
**Classification:** ASSERTION_MISMATCH

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

### `profileTests.spec.ts` — Verify Profile Page Loads Correctly
**Classification:** ASSERTION_MISMATCH

```
Error: Waiting for Full Name to be populated on Profile Page

Waiting for Full Name to be populated on Profile Page

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32m"[7mT[27mest[7m User[27m"[39m
Received: [31m"[7mt[27mest"[39m

Call Log:
- Timeout 10000ms exceeded while waiting on the predicate

  14 |       intervals: [500],
  15 |       message: 'Waiting for Full Name to be populated on Profile Page'
> 16 |     }).toBe('Test User');
     |        ^
  17 |
  18 |   })
  19 | })
    at /home/runner/work/playwright-cli/playwright-cli/tests/profileTests.spec.ts:16:8
```

## Attempted heals

None — every failure needed human review.
