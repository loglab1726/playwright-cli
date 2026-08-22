import { expect, test } from './fixtures';
import { LandingPage } from '@pages/LandingPage';

test.describe('Orders Page', { tag: ['@ui', '@orders'] }, () => {
  test('displays order cards with the expected content', { tag: '@smoke' }, async ({ open }) => {
    const ordersPage = await open(LandingPage)
      .then((_) => _.clickMyOrdersButton());

    const firstOrderCard = ordersPage.getFirstOrderCard();

    await expect.poll(() => ordersPage.getSubtitleText(), {
      timeout: 15000,
      intervals: [500, 1000],
      message: 'Waiting for the order count subtitle to appear',
    }).toMatch(/\d+\s+orders placed/i);

    await expect.poll(() => firstOrderCard.isVisible(), {
      timeout: 15000,
      intervals: [500, 1000],
      message: 'Waiting for the first order card to render',
    }).toBe(true);

    await expect.poll(() => ordersPage.getOrderNumber(firstOrderCard), {
      timeout: 10000,
      intervals: [500, 1000],
      message: 'Waiting for the order number in the card header',
    }).toMatch(/^ORD-\d{6}$/);

    await expect.poll(() => ordersPage.getOrderDate(firstOrderCard), {
      timeout: 10000,
      intervals: [500, 1000],
      message: 'Waiting for the order date in the card header',
    }).toMatch(/^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/);

    await expect.poll(() => ordersPage.getStatusBadge(firstOrderCard), {
      timeout: 10000,
      intervals: [500, 1000],
      message: 'Waiting for the Delivered badge',
    }).toBe('Delivered');

    await expect.poll(() => ordersPage.getOrderTotal(firstOrderCard), {
      timeout: 10000,
      intervals: [500, 1000],
      message: 'Waiting for the total amount in the card header',
    }).toMatch(/^LKR\s+\d+\.\d{2}$/);

    await expect.poll(() => ordersPage.getFirstItemName(firstOrderCard), {
      timeout: 10000,
      intervals: [500, 1000],
      message: 'Waiting for the first product name on the order card',
    }).not.toBe('');

    await expect.poll(() => ordersPage.getFirstItemMeta(firstOrderCard), {
      timeout: 10000,
      intervals: [500, 1000],
      message: 'Waiting for the quantity and unit price details',
    }).toMatch(/Qty:\s*\d+\s*[·•]\s*LKR\s+\d+(?:\.\d{2})?\s+each/i);

    await expect.poll(() => ordersPage.getFirstLineTotal(firstOrderCard), {
      timeout: 10000,
      intervals: [500, 1000],
      message: 'Waiting for the line item subtotal',
    }).toMatch(/^LKR\s+\d+\.\d{2}$/);

    await expect.poll(() => ordersPage.getFooterSummary(firstOrderCard), {
      timeout: 10000,
      intervals: [500, 1000],
      message: 'Waiting for the card footer item count',
    }).toMatch(/\d+\s+item(?:s)?/i);

    await expect.poll(() => ordersPage.getFooterSummary(firstOrderCard), {
      timeout: 10000,
      intervals: [500, 1000],
      message: 'Waiting for the Total paid label and amount',
    }).toMatch(/Total paid:\s*LKR\s+\d+\.\d{2}/i);
  });
});
