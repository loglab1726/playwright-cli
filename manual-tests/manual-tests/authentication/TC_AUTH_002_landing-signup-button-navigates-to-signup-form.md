### Test Case ID

TC_AUTH_002

### Test Case Title

Landing page hero "Sign Up" button navigates to Sign Up form

### Feature Area

Authentication

### Priority

High

### Preconditions

- Navigate to $BASE_URL
- User is not logged in
- The Landing page hero section is visible
- The "Sign Up" button is visible in the hero section (only shown to unauthenticated users)

### Test Steps

1. Click the "Sign Up" button in the hero section of the Landing page.

### Expected Result

1. The "Sign Up" button is visible in the hero section for unauthenticated users.
2. The browser navigates to `/login`.
   - The Sign Up form is pre-selected and displayed (heading reads "Sign Up", not "Login")
   - All Sign Up form fields are visible: Your Name, Email Address, Gender dropdown, Mobile Number, Password, Confirm Password, Address (optional)
   - The Sign Up submit button is present and enabled
   - The paragraph "Already have an account? Login" is visible below the form

### Notes and Assumptions

- Tags: Regression
- The hero "Sign Up" button must NOT be visible when the user is authenticated (Profile/My Orders/Logout nav is shown instead)
- Locator: `getByRole('button', { name: 'Sign Up' })` on the Landing page

### Defect Opportunity

- The hero Sign Up button may be visible to authenticated users
- Clicking the button may navigate to `/login` but display the Login form instead of the Sign Up form
- The Sign Up form may not be pre-selected on direct navigation
