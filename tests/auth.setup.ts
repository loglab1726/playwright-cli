import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../.auth/user.json');

setup('authenticate', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: 'Profile' })).toBeVisible();
  
  // 6. Save the storage state
  await page.context().storageState({ path: authFile });
});