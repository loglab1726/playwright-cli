### Test Case ID

TC_AUTH_005

### Test Case Title

Toggle back to Login form from Sign Up form

### Feature Area

Authentication

### Priority

Medium

### Preconditions

- Navigate to $BASE_URL
- User is not logged in
- Navigate to `$BASE_URL/login`
- Toggle to the Sign Up form by clicking the "Sign Up" span (Sign Up heading is visible)

### Test Steps

1. Click the "Login" text in the "Already have an account? Login" paragraph below the Sign Up form.

### Expected Result

1. The "Already have an account? Login" paragraph with the "Login" link is visible below the Sign Up form.
2. The page remains on `/login` (URL does not change).
   - The heading changes from "Sign Up" to "Login"
   - The Sign Up form fields are replaced by the Login form (Email Address, Password, Login button)
   - The paragraph below the form changes back to "Don't have an account? Sign Up"

### Notes and Assumptions

- Tags: Regression
- The "Login" text is a `<span>` inside the paragraph — it is not an `<a>` link
- Toggle is client-side; no page reload occurs
- Locator for the clickable span: `locator('.loginsignup-switch span:has-text("Login")')`
- Any data entered in the Sign Up form fields before toggling is not preserved — this is expected behaviour

### Defect Opportunity

- Clicking the paragraph outside the span may not trigger the toggle
- The heading may not revert to "Login"
- The Sign Up form may remain partially visible after toggling back