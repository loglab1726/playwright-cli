### Test Case ID

TC_AUTH_001

### Test Case Title

Sign Up form toggles from Login page via "Sign Up" link

### Feature Area

Authentication

### Priority

High

### Preconditions

- Navigate to $BASE_URL
- User is not logged in
- Navigate to `$BASE_URL/login`
- The Login form is displayed with heading "Login"

### Test Steps

1. Click the "Sign Up" text in the "Don't have an account? Sign Up" paragraph below the Login form.

### Expected Result

1. The "Don't have an account? Sign Up" paragraph with the "Sign Up" link is visible below the Login form.
2. The page remains on `/login` (URL does not change).
   - The heading changes from "Login" to "Sign Up"
   - The Login form (Email Address, Password, Login button) is replaced by the Sign Up form
   - The Sign Up form is displayed and ready to fill in
   - A new paragraph "Already have an account? Login" appears below the Sign Up form

### Notes and Assumptions

- Tags: Regression
- The "Sign Up" text is a `<span>` inside the paragraph — it is not an `<a>` link; clicking the paragraph text toggles the form without navigating
- Toggle is client-side only; no page reload occurs
- Locator for the clickable span: `locator('.loginsignup-switch span:has-text("Sign Up")')`

### Defect Opportunity

- Clicking the paragraph area outside the span may not trigger the toggle
- The heading may fail to update if the toggle state is not properly managed
- The Sign Up form may be hidden/visible by CSS but still present in DOM, causing false positives if using element existence checks alone