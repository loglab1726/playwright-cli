import { expect, test } from './fixtures';
import { WishlistCheckoutPage } from '@pages/WishlistCheckoutPage';

test.describe('Checkout', { tag: ['@ui', '@checkout', '@wishlist'] }, () => {
  test('removes a wishlisted item after purchase', async ({ open }) => {
    const checkoutPage = await open(WishlistCheckoutPage)
      .then((_) => _.addProductToWishlist())
      .then((_) => _.openWishlist());

    await expect.poll(() => checkoutPage.isProductInWishlist(), {
      timeout: 10000,
      intervals: [500, 1000],
      message: 'Waiting for the product to appear in the wishlist',
    }).toBe(true);
    await expect.poll(() => checkoutPage.getWishlistSummary(), {
      timeout: 10000,
      intervals: [500, 1000],
      message: 'Waiting for the wishlist item count',
    }).toMatch(/\d+ item(?:s|\(s\))? saved/);

    await checkoutPage.openWishlistedProduct()
      .then((_) => _.selectSize('M'))
      .then((_) => _.addToCart())
      .then((_) => _.viewCart())
      .then((_) => _.proceedToCheckout())
      .then((_) => _.selectCashOnDelivery())
      .then((_) => _.continueCheckout())
      .then((_) => _.fillDeliveryDetails());

    await expect.poll(() => checkoutPage.getDeliveryFieldValue('Street Address'), {
      timeout: 10000,
      intervals: [500, 1000],
      message: 'Waiting for the street address value',
    }).toBe('No. 45, Main Street');
    await expect.poll(() => checkoutPage.getDeliveryFieldValue('City'), {
      timeout: 10000,
      intervals: [500, 1000],
      message: 'Waiting for the city value',
    }).toBe('Colombo');
    await expect.poll(() => checkoutPage.getDeliveryFieldValue('Phone'), {
      timeout: 10000,
      intervals: [500, 1000],
      message: 'Waiting for the phone value',
    }).toBe('+94 77 000 0000');

    await checkoutPage.confirmOrder();
    await expect.poll(() => checkoutPage.isOrderSuccessVisible(), {
      timeout: 15000,
      intervals: [500, 1000, 2000],
      message: 'Waiting for order success screen',
    }).toBe(true);

    await checkoutPage.returnToWishlist();
    await expect.poll(() => checkoutPage.isWishlistEmpty(), {
      timeout: 10000,
      intervals: [500, 1000],
      message: 'Waiting for purchased item to be removed from wishlist',
    }).toBe(true);
  });

  test('submits PayPal delivery form and reaches the success screen', async ({ open }) => {
    const checkoutPage = await open(WishlistCheckoutPage)
      .then((_) => _.addProductToWishlist())
      .then((_) => _.openWishlist())
      .then((_) => _.openWishlistedProduct())
      .then((_) => _.selectSize('M'))
      .then((_) => _.addToCart())
      .then((_) => _.viewCart())
      .then((_) => _.proceedToCheckout())
      .then((_) => _.selectPayPal())
      .then((_) => _.continueCheckout())
      .then((_) => _.fillDeliveryDetails());

    await expect.poll(() => checkoutPage.getDeliveryFieldValue('Street Address'), {
      timeout: 10000,
      intervals: [500, 1000],
      message: 'Waiting for the PayPal street address value',
    }).toBe('No. 45, Main Street');
    await expect.poll(() => checkoutPage.getDeliveryFieldValue('City'), {
      timeout: 10000,
      intervals: [500, 1000],
      message: 'Waiting for the PayPal city value',
    }).toBe('Colombo');
    await expect.poll(() => checkoutPage.getDeliveryFieldValue('Phone'), {
      timeout: 10000,
      intervals: [500, 1000],
      message: 'Waiting for the PayPal phone value',
    }).toBe('+94 77 000 0000');

    await checkoutPage.proceedToPayPal()
      .then((_) => _.observePaymentProcessing());
    await expect.poll(() => checkoutPage.isPaymentProcessingVisible(), {
      timeout: 5000,
      intervals: [100, 250, 500],
      message: 'Waiting for the PayPal processing screen',
    }).toBe(true);
    await checkoutPage.captureOrderSuccessToast();

    await expect.poll(() => checkoutPage.isOrderSuccessVisible(), {
      timeout: 10000,
      intervals: [500, 1000, 2000],
      message: 'Waiting for the PayPal order success screen',
    }).toBe(true);
    await expect.poll(() => checkoutPage.getOrderNumber(), {
      timeout: 5000,
      intervals: [250, 500, 1000],
      message: 'Waiting for the generated PayPal order number',
    }).toMatch(/^ORD-\d{6}$/);
    await expect.poll(() => checkoutPage.isSuccessContentVisible(), {
      timeout: 5000,
      intervals: [250, 500, 1000],
      message: 'Waiting for complete PayPal success content',
    }).toBe(true);

    const orderNumber = await checkoutPage.getOrderNumber();
    await expect.poll(() => checkoutPage.getOrderSuccessToast(orderNumber), {
      timeout: 5000,
      intervals: [250, 500, 1000],
      message: 'Waiting for the PayPal success toast',
    }).toBe(`Order ${orderNumber} placed successfully!`);
  });
});
