import { expect, test } from './fixtures';
import { AuthenticationPage } from '@pages/AuthenticationPage';

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
});
