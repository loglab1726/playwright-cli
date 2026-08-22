import { BasePage } from '@pages/BasePage';

export class WishlistCheckoutPage extends BasePage {
  private readonly productName = 'Elegant Overlap Collar Top';
  private orderSuccessToast = '';
  private paymentProcessingSeen = false;

  public async init(): Promise<this> {
    await this.page.goto('');
    await this.page.getByRole('button', { name: 'Profile' }).waitFor({ state: 'visible', timeout: 5000 });
    await this.page.getByText(this.productName, { exact: true }).first()
      .waitFor({ state: 'visible', timeout: 10000 });
    return this;
  }

  public async addProductToWishlist(): Promise<this> {
    const productCard = this.page.getByText(this.productName, { exact: true }).first().locator('..');
    const emptyHeart = productCard.getByRole('button', { name: '♡' });
    if (await emptyHeart.count() > 0) {
      await emptyHeart.click();
    }
    return this;
  }

  public async openWishlist(): Promise<this> {
    await this.page.getByRole('link', { name: /♡/ }).click();
    return this;
  }

  public async isProductInWishlist(): Promise<boolean> {
    return (await this.page.getByText(this.productName, { exact: true }).count()) > 0;
  }

  public async getWishlistSummary(): Promise<string> {
    return this.page.getByText(/\d+ item(?:s|\(s\))? saved/).textContent()
      .then((value) => value?.trim() ?? '');
  }

  public async openWishlistedProduct(): Promise<this> {
    await this.page.getByText(this.productName, { exact: true }).locator('..')
      .getByRole('link').click();
    return this;
  }

  public async selectSize(size: string): Promise<this> {
    await this.page.getByText(size, { exact: true }).click();
    return this;
  }

  public async addToCart(): Promise<this> {
    const addButton = this.page.getByRole('button', { name: 'Add to Cart', exact: true });
    if (await addButton.count() > 0) {
      await addButton.click();
    }
    return this;
  }

  public async viewCart(): Promise<this> {
    await this.page.getByRole('button', { name: /In Cart.*View Cart/ }).click();
    return this;
  }

  public async proceedToCheckout(): Promise<this> {
    await this.page.getByRole('button', { name: 'Proceed to Checkout' }).click();
    return this;
  }

  public async selectCashOnDelivery(): Promise<this> {
    await this.page.getByText(/Cash on Delivery|COD/).click();
    return this;
  }

  public async selectPayPal(): Promise<this> {
    await this.page.getByText('PayPal', { exact: true }).click();
    return this;
  }

  public async continueCheckout(): Promise<this> {
    await this.page.getByRole('button', { name: /Continue/ }).click();
    return this;
  }

  public async fillDeliveryDetails(): Promise<this> {
    await this.page.getByPlaceholder(/Main Street/).fill('No. 45, Main Street');
    await this.page.getByPlaceholder('Colombo').fill('Colombo');
    await this.page.getByPlaceholder('+94 77 000 0000').fill('+94 77 000 0000');
    return this;
  }

  public async getDeliveryFieldValue(field: 'Street Address' | 'City' | 'Phone'): Promise<string> {
    const placeholders: Record<typeof field, string | RegExp> = {
      'Street Address': /Main Street/,
      City: 'Colombo',
      Phone: '+94 77 000 0000',
    };
    return this.page.getByPlaceholder(placeholders[field]).inputValue();
  }

  public async confirmOrder(): Promise<this> {
    await this.page.getByRole('button', { name: 'Confirm Order' }).click();
    return this;
  }

  public async proceedToPayPal(): Promise<this> {
    await this.page.getByRole('button', { name: 'Proceed to PayPal' }).click();
    return this;
  }

  public async observePaymentProcessing(): Promise<this> {
    const processingMessage = this.page.getByText('Processing your payment...', { exact: true });
    await processingMessage.waitFor({ state: 'visible', timeout: 5000 });
    this.paymentProcessingSeen = true;
    return this;
  }

  public async captureOrderSuccessToast(): Promise<this> {
    const toast = this.page.locator('.toast.toast-success', {
      hasText: /Order ORD-\d{6} placed successfully!/,
    });
    await toast.waitFor({ state: 'visible', timeout: 10000 });
    const content = await toast.textContent();
    this.orderSuccessToast = content?.match(/Order ORD-\d{6} placed successfully!/)?.[0] ?? '';
    return this;
  }

  public async isPaymentProcessingVisible(): Promise<boolean> {
    const processingMessage = this.page.getByText('Processing your payment...', { exact: true });
    const closeWarning = this.page.getByText('Please do not close this window', { exact: true });
    return this.paymentProcessingSeen || ((await processingMessage.count()) > 0
      && await processingMessage.isVisible()
      && (await closeWarning.count()) > 0
      && await closeWarning.isVisible());
  }

  public async isOrderSuccessVisible(): Promise<boolean> {
    const successHeading = this.page.getByRole('heading', { name: 'Order Placed Successfully!' });
    return (await successHeading.count()) > 0 && await successHeading.isVisible();
  }

  public async getOrderNumber(): Promise<string> {
    const orderText = this.page.getByText(/ORD-\d{6}/).first();
    const content = await orderText.textContent();
    return content?.match(/ORD-\d{6}/)?.[0] ?? '';
  }

  public async isSuccessContentVisible(): Promise<boolean> {
    const orderNumber = this.page.getByText(/ORD-\d{6}/).first();
    const thankYouMessage = this.page.getByText('Thank you for shopping with OneStyle!', { exact: true });
    const viewOrdersButton = this.page.getByRole('button', { name: 'View My Orders' });
    const continueButton = this.page.getByRole('button', { name: 'Continue Shopping' });
    return (await orderNumber.count()) > 0
      && (await thankYouMessage.count()) > 0
      && (await viewOrdersButton.count()) > 0
      && (await continueButton.count()) > 0;
  }

  public async getOrderSuccessToast(orderNumber: string): Promise<string> {
    return this.orderSuccessToast === `Order ${orderNumber} placed successfully!`
      ? this.orderSuccessToast
      : '';
  }

  public async returnToWishlist(): Promise<this> {
    await this.page.getByRole('link', { name: /♡/ }).click();
    return this;
  }

  public async isWishlistEmpty(): Promise<boolean> {
    return (await this.page.getByRole('heading', { name: 'Your wishlist is empty' }).count()) > 0;
  }
}
