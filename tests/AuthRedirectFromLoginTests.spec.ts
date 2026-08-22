import { expect, test } from './fixtures';
import { AuthenticationPage } from '@pages/AuthenticationPage';

// Use pre-saved authenticated storage state so the user is already logged in
test.use({ storageState: '.auth/user.json' });

test.describe('Authentication', { tag: ['@ui', '@auth', '@smoke'] }, () => {
  test('authenticated user navigating to /login is redirected to home page (TC_AUTH_014)', async ({ open }) => {
    const authPage = await open(AuthenticationPage).then((_) => _.navigateToLogin());

    await expect.poll(() => authPage.getCurrentUrl(), {
      timeout: 5000,
      intervals: [250, 500],
      message: 'URL should not remain on /login and should redirect to home page',
    }).not.toContain('/login');

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
