### Test Case ID

TC_AUTH_003

### Test Case Title

Sign Up form contains all required and optional fields

### Feature Area

Authentication

### Priority

High

### Preconditions

- Navigate to $BASE_URL
- User is not logged in
- Navigate to `$BASE_URL/login`
- Toggle to the Sign Up form by clicking the "Sign Up" span in the "Don't have an account? Sign Up" paragraph

### Test Steps

1. Check the form heading at the top of the Sign Up form.
2. Check the Name, Email, Mobile Number, Password, Confirm Password, and Address fields — verify each is present with the correct placeholder text.
3. Check the Gender dropdown — verify it is present with the correct options.
4. Check the Sign Up submit button — verify it is present and enabled.

### Expected Result

1. The heading reads "Sign Up".
2. Name text field is visible with placeholder "Your Name"
3. Email field is visible with placeholder "Email Address"
4. Gender combobox is visible; default option is "Select Gender"; available options: Select Gender / Male / Female / Other / Prefer not to say
5. Mobile Number text field is visible with placeholder "Mobile Number"
6. Password field is visible with placeholder "Password"
7. Confirm Password field is visible with placeholder "Confirm Password"
8. Address text field is visible with placeholder "Address (optional)"
9. The "Sign Up" submit button is visible and enabled; not in a loading state

### Notes and Assumptions

- Tags: Regression
- Address is optional — it must accept empty values without an error
- The form does not require a CAPTCHA or verification step per the AC
- Gender is a `<select>` combobox: `getByRole('combobox')`

### Defect Opportunity

- Any field missing from the rendered form
- Gender dropdown missing one of the required options
- Address field marked as required in the UI when the AC specifies it as optional
- Sign Up button in a disabled state on initial render