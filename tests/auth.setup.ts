import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../.auth/user.json');

setup('authenticate', async ({ page }) => {
  // The backend (onestyle-backend.onrender.com) is on Render's free tier and
  // can take 30-60s to cold-start after a period of inactivity, so give this
  // test more room than the default 30s.
  setup.setTimeout(90_000);

  // 1. Navigate to the base URL
  await page.goto(process.env.BASE_URL || '/');
  
  // 2. Click Sign In (Playwright auto-waits for visibility and actionability)
  await page.getByRole('button', { name: 'Sign In' }).click();
  
  // 3. Web-first assertion: wait for the URL to change
  await expect(page).toHaveURL(/.*login/); 

  // 4. Perform the UI login
  await page.getByRole('textbox', { name: 'Email Address' }).fill(process.env.EMAIL_ADDRESS!);
  await page.getByRole('textbox', { name: 'Password' }).fill(process.env.PASSWORD!);
  await page.getByRole('button', { name: 'Login' }).click();

  // 5. Await the web-first assertion to ensure login success
  // Generous timeout: the backend (onestyle-backend.onrender.com) is on Render's
  // free tier and can take 30-60s to cold-start after a period of inactivity.
  await expect(page.getByRole('button', { name: 'Profile' })).toBeVisible({ timeout: 60_000 });
  
  // 6. Save the storage state
  await page.context().storageState({ path: authFile });
});