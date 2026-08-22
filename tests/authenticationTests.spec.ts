import { expect, test } from './fixtures';
import { AuthenticationPage } from '@pages/AuthenticationPage';
import { LandingPage } from '@pages/LandingPage';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', { tag: ['@ui', '@auth'] }, () => {
  test('registers a new account and redirects to home', async ({ open }) => {
    const name = 'Test User';
    const email = `testuser_${Date.now()}@test.com`;
    const password = 'Pass@123';
    const mobile = '+94712345678';

    const authPage = await open(AuthenticationPage)
      .then((_) => _.ensureSignUpForm())
      .then((_) => _.fillName(name))
      .then((_) => _.fillEmail(email))
      .then((_) => _.selectGender('Male'))
      .then((_) => _.fillMobile(mobile))
      .then((_) => _.fillPassword(password))
      .then((_) => _.fillConfirmPassword(password));

    await expect.poll(() => authPage.getFieldValue('Your Name'), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Name field should be filled',
    }).toBe(name);

    await expect.poll(() => authPage.getFieldValue('Email Address'), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Email field should be filled',
    }).toBe(email);

    await expect.poll(() => authPage.getSelectedGender(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Gender should be selected as Male',
    }).toBe('Male');

    await expect.poll(() => authPage.getFieldValue('Mobile Number'), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Mobile field should be filled',
    }).toBe(mobile);

    await expect.poll(() => authPage.getFieldValue('Password'), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Password field should be filled',
    }).toBe(password);

    await expect.poll(() => authPage.getFieldValue('Confirm Password'), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Confirm Password field should be filled',
    }).toBe(password);

    await authPage.clickSignUp();

    await expect.poll(() => authPage.getWelcomeToast(name), {
      timeout: 10000,
      intervals: [250, 500, 1000],
      message: 'Welcome toast should appear',
    }).toBe(`Welcome, ${name}! Account created.`);

    await expect.poll(() => authPage.getCurrentUrl(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'URL should redirect to home page',
    }).toMatch(/\/AI-R-D---Github-copilot\/?$/);

    await expect.poll(() => authPage.isAuthenticated(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'User should be authenticated',
    }).toBe(true);

    await expect.poll(() => authPage.isSignInVisible(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Sign in should not be visible',
    }).toBe(false);
  });

  test('toggles from Login to Sign Up form via Sign Up link', { tag: '@smoke' }, async ({ open }) => {
    const authPage = await open(AuthenticationPage);

    await expect.poll(() => authPage.getHeadingText(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Heading should display "Login"',
    }).toBe('Login');

    await expect.poll(() => authPage.getAuthToggleParagraphText(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Toggle paragraph should contain "Sign Up"',
    }).toContain('Sign Up');

    await authPage.clickSignUpLinkFromLogin();

    await expect.poll(() => authPage.getHeadingText(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Heading should change to "Sign Up"',
    }).toBe('Sign Up');

    await expect.poll(() => authPage.isSignUpFormVisible(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Sign Up form should be visible',
    }).toBe(true);

    await expect.poll(() => authPage.getAuthToggleParagraphText(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Toggle paragraph should change to "Already have an account? Login"',
    }).toContain('Already have an account? Login');

    await expect.poll(() => authPage.getCurrentUrl(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'URL should remain on /login',
    }).toContain('/login');
  });

  test('landing page hero Sign Up button navigates to Sign Up form', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('');
    await page.getByRole('button', { name: 'Sign Up' }).waitFor({
      state: 'visible',
      timeout: 5000,
    });

    await expect.poll(() => page.getByRole('button', { name: 'Sign Up' }).isVisible(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Sign Up button should be visible in hero section',
    }).toBe(true);

    await page.getByRole('button', { name: 'Sign Up' }).click();

    await expect.poll(() => page.url(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'URL should navigate to /login',
    }).toContain('/login');

    const authPage = new AuthenticationPage(page);
    
    await expect.poll(() => authPage.getHeadingText(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Sign Up form should be displayed (heading reads "Sign Up")',
    }).toBe('Sign Up');

    await expect.poll(() => authPage.isSignUpFormVisible(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Sign Up form fields should be visible',
    }).toBe(true);

    const signUpButton = page.getByRole('button', { name: 'Sign Up', exact: true });
    await expect.poll(async () => (await signUpButton.count()) > 0, {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Sign Up submit button should be present and enabled',
    }).toBe(true);

    const alreadyHaveAccountText = page.getByText('Already have an account? Login');
    await expect.poll(async () => (await alreadyHaveAccountText.count()) > 0, {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Already have an account paragraph should be visible',
    }).toBe(true);
  });

  test('Sign Up form fields present and correct', async ({ open }) => {
    const authPage = await open(AuthenticationPage).then((_) => _.ensureSignUpForm());

    await expect.poll(() => authPage.getHeadingText(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Heading should read "Sign Up"',
    }).toBe('Sign Up');

    await expect.poll(() => authPage.getPlaceholderForField('Your Name'), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Name field placeholder should be "Your Name"',
    }).toBe('Your Name');

    await expect.poll(() => authPage.getPlaceholderForField('Email Address'), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Email field placeholder should be "Email Address"',
    }).toBe('Email Address');

    await expect.poll(() => authPage.getPlaceholderForField('Mobile Number'), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Mobile Number placeholder should be "Mobile Number"',
    }).toBe('Mobile Number');

    await expect.poll(() => authPage.getPlaceholderForField('Password'), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Password placeholder should be "Password"',
    }).toBe('Password');

    await expect.poll(() => authPage.getPlaceholderForField('Confirm Password'), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Confirm Password placeholder should be "Confirm Password"',
    }).toBe('Confirm Password');

    await expect.poll(() => authPage.getPlaceholderForField('Address (optional)'), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Address placeholder should be "Address (optional)"',
    }).toBe('Address (optional)');

    await expect.poll(() => authPage.getSelectedGender(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Default gender should be "Select Gender"',
    }).toBe('Select Gender');

    await expect.poll(() => authPage.getGenderOptions(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Gender options should be present and correct',
    }).toEqual(['Select Gender', 'Male', 'Female', 'Other', 'Prefer not to say']);

    await expect.poll(() => authPage.isSignUpButtonEnabled(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Sign Up button should be enabled',
    }).toBe(true);

    await expect.poll(() => authPage.isSignUpButtonLoading(), {
      timeout: 3000,
      intervals: [250, 500],
      message: 'Sign Up button should not be in loading state',
    }).toBe(false);
  });

  test('authenticated user navigating to /login is redirected to home page', { tag: '@smoke' }, async ({ open }) => {
    const authPage = await open(AuthenticationPage).then((_) => _.navigateToLogin());

    await expect.poll(() => authPage.getCurrentUrl(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'URL should redirect to home page',
    }).toMatch(/\/AI-R-D---Github-copilot\/?$/);

    await expect.poll(() => authPage.isAuthenticated(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'User should be authenticated (Profile, My Orders, Logout visible)',
    }).toBe(true);

    await expect.poll(() => authPage.isLoginFormVisible(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Login form should not be displayed',
    }).toBe(false);

    await expect.poll(() => authPage.isMyOrdersButtonVisible(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'My Orders button should be visible',
    }).toBe(true);

    await expect.poll(() => authPage.isLogoutButtonVisible(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'Logout button should be visible',
    }).toBe(true);
  });
});
