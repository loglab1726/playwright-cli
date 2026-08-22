import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  /* JSON alongside HTML is additive only — playwright.yml's pass/fail is
   * still exactly `npx playwright test`'s exit code, this just gives
   * .github/workflows/regression-heal.yml a machine-readable file
   * (scripts/parse-test-results.js) to find which specs failed. */
  reporter: [['html'], ['json', { outputFile: 'playwright-report/results.json' }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.BASE_URL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    headless: process.env.HEADLESS !== 'false',

  },
  

  /* Configure projects for major browsers */
 /* Configure projects for major browsers */
  projects: [
    // The setup project
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Use the saved storage state for all tests in this project
        storageState: '.auth/user.json',
      },
      // Ensure the setup project runs before this one
      dependencies: ['setup'],
    },
  ],
})