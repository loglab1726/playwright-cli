import { BasePage } from '@pages/BasePage';
import type { Locator } from '@playwright/test';

export class OrdersPage extends BasePage {
  public async init(): Promise<this> {
    await this.page.getByRole('heading', { name: 'Order History' })
      .waitFor({ state: 'visible', timeout: 15000 });
    await this.page.locator('.orderhistory-card').first()
      .waitFor({ state: 'visible', timeout: 15000 });
    return this;
  }

  public async getSubtitleText(): Promise<string> {
    const subtitle = this.page.getByText(/\d+\s+orders placed/i).first();
    return (await subtitle.count()) > 0 ? ((await subtitle.textContent()) ?? '').trim() : '';
  }

  public getFirstOrderCard(): Locator {
    return this.page.locator('.orderhistory-card').first();
  }

  public async getOrderNumber(card: Locator): Promise<string> {
    return (await card.locator('.orderhistory-order-id').textContent())?.trim() ?? '';
  }

  public async getOrderDate(card: Locator): Promise<string> {
    return (await card.locator('.orderhistory-date').textContent())?.trim() ?? '';
  }

  public async getStatusBadge(card: Locator): Promise<string> {
    return (await card.locator('.orderhistory-status').textContent())?.trim() ?? '';
  }

  public async getOrderTotal(card: Locator): Promise<string> {
    return (await card.locator('.orderhistory-total').textContent())?.trim() ?? '';
  }

  public async getFirstItemName(card: Locator): Promise<string> {
    return (await card.locator('.orderhistory-item-name').first().textContent())?.trim() ?? '';
  }

  public async getFirstItemMeta(card: Locator): Promise<string> {
    return (await card.locator('.orderhistory-item-meta').first().textContent())?.trim() ?? '';
  }

  public async getFirstLineTotal(card: Locator): Promise<string> {
    return (await card.locator('.orderhistory-item-subtotal').first().textContent())?.trim() ?? '';
  }

  public async getFooterSummary(card: Locator): Promise<string> {
    return (await card.locator('.orderhistory-card-footer').textContent())?.trim() ?? '';
  }
}
