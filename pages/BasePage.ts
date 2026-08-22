import { Page } from '@playwright/test';

export abstract class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Forces all inheriting page objects to implement an initialization method.
   * This ensures safe asynchronous setup, like waiting for a critical element to render.
   */
  abstract init(): Promise<this>
}