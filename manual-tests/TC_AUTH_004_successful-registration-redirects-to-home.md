### Test Case ID

TC_AUTH_004

### Test Case Title

Successful registration with valid data creates account and redirects to home

### Feature Area

Authentication

### Priority

High

### Preconditions

- Navigate to $BASE_URL
- User is not logged in
- Navigate to `$BASE_URL/login`
- Toggle to the Sign Up form by clicking the "Sign Up" span
- Prepare a unique email address not previously registered (e.g. testuser_TIMESTAMP@test.com)

### Test Steps

1. Fill in the "Your Name" field with a valid name of at least 3 characters (e.g. "Test User")
2. Fill in the "Email Address" field with a unique, valid email address
3. Select a gender from the Gender dropdown (e.g. "Male")
4. Fill in the "Mobile Number" field with a valid mobile number (e.g. "+94712345678")
5. Fill in the "Password" field with a password of at least 6 characters (e.g. "Pass@123")
6. Fill in the "Confirm Password" field with the same value as Password
7. Optionally fill in the "Address (optional)" field or leave it blank
8. Click the "Sign Up" button.
9. Wait for the page to update after submission.

### Expected Result

1. The "Your Name" field accepts the valid name without error
2. The "Email Address" field accepts the unique valid email without error
3. The Gender dropdown reflects the selected option (e.g. "Male") without error
4. The "Mobile Number" field accepts the valid number without error
5. The "Password" field accepts the 6+ character password without error
6. The "Confirm Password" field accepts the matching value without error
7. The "Address (optional)" field accepts any value or remains empty without error
8. The form is submitted; the "Sign Up" button label changes to "Creating Account..." and becomes disabled during the API call. The button remains disabled while the API call is in progress.
9. A toast notification is displayed: "Welcome, [name]! Account created." (where [name] matches the value entered in step 1)
10. The browser redirects to the Landing page (`/`)
11. The navbar shows: "Profile", "My Orders", and "Logout" buttons (authenticated state)
12. The Login / Sign In button is no longer visible in the navbar

### Notes and Assumptions

- Tags: Regression
- A unique email must be used on each manual test run to avoid a duplicate-email failure
- The account is created on the live backend; subsequent runs with the same email will fail with "Email already registered."
- The toast notification text includes the user's name — verify it matches the value entered in the Name field

### Defect Opportunity

- Redirect goes to a page other than `/`
- Toast notification does not appear or shows incorrect name
- The navbar remains in unauthenticated state after successful registration
- The "Creating Account..." loading state is skipped or too brief to observe
- Account is not persisted (navigating away and returning shows unauthenticated state)
