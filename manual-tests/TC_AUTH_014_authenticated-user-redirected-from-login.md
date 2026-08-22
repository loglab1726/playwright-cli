### Test Case ID

TC_AUTH_014

### Test Case Title

Authenticated user navigating to /login is redirected to home page

### Feature Area

Authentication

### Priority

High

### Preconditions

- Navigate to $BASE_URL
- User is logged in (authenticated) — Profile, My Orders, and Logout buttons are visible in the navbar

### Test Steps

1. With the user already authenticated, navigate directly to `$BASE_URL/login` by typing the URL in the address bar.

### Expected Result

1. The browser navigates to the `/login` URL and the app immediately redirects automatically to the Landing page (`/`):
   - The URL changes to `$BASE_URL/` (or `$BASE_URL`)
   - The Landing page content is displayed
   - The navbar shows: Profile, My Orders, and Logout buttons (authenticated state)
   - The Login form is NOT displayed

### Notes and Assumptions

- Tags: Regression
- This is a Direct URL Access test — the authenticated user bypasses normal navigation
- The redirect must happen without any user interaction; it is automatic
- Per `.playwright-mcp/pages/02-login.md`: the `/login` route redirects to `/` if already authenticated

### Defect Opportunity

- The `/login` page is shown to an authenticated user (no redirect occurs)
- The redirect occurs but lands on an unintended page (not `/`)
- The redirect loop causes an infinite redirect or error state
- The authenticated nav state is lost after the redirect