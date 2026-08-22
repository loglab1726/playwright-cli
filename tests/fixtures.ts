import { test as base, expect, request, APIRequestContext } from '@playwright/test';

// Define the types for your custom fixtures
type MyFixtures = {
  open: <T>(pageObjectClass: { new (page: any): T }) => Promise<T>;
  apiContext: APIRequestContext;
};

// Extend the base test with our custom fixtures
export const test = base.extend<MyFixtures>({
  // The 'open' fixture initializes page objects cleanly
  open: async ({ page }, use) => {
    await use(async <T>(pageObjectClass: { new (p: typeof page): T } & { init?: () => Promise<any> }) => {
      const pageObject = new pageObjectClass(page);
      if (typeof (pageObject as any).init === 'function') {
        await (pageObject as any).init();
      }
      return pageObject as T;
    });
  },

  // The 'apiContext' fixture for pre-authenticated API calls
  apiContext: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({
      baseURL: process.env.APP_URL,
      // You can add global auth headers here later:
      // extraHTTPHeaders: { 'Authorization': `Bearer ${process.env.API_TOKEN}` }
    });
    await use(context);
    await context.dispose();
  },
});

export { expect };