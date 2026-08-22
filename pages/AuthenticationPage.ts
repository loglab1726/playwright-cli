import { BasePage } from '@pages/BasePage';

export class AuthenticationPage extends BasePage {
  public async init(): Promise<this> {
    await this.page.goto('login');
    // Wait for either the auth form heading (unauthenticated) OR the Profile
    // button (redirected/authenticated). Use parallel waits with the same
    // timeout so tests initializing this page object don't hang.
    try {
      await Promise.race([
        this.page.getByRole('heading', { name: /Sign Up|Login/ }).waitFor({ state: 'visible', timeout: 5000 }),
        this.page.getByRole('button', { name: 'Profile' }).waitFor({ state: 'visible', timeout: 5000 }),
      ]);
    } catch {
      // If neither appears within the timeout, allow tests to continue and
      // surface failures through their explicit assertions. Do not throw here
      // to keep initialization non-fatal for downstream checks.
    }
    return this;
  }

  public async ensureSignUpForm(): Promise<this> {
    const signUpHeading = this.page.getByRole('heading', { name: 'Sign Up' });
    if (!(await signUpHeading.isVisible())) {
      await this.page.getByText('Sign Up', { exact: true }).click();
    }
    await signUpHeading.waitFor({ state: 'visible', timeout: 5000 });
    return this;
  }

  public async fillName(value: string): Promise<this> {
    await this.page.getByRole('textbox', { name: 'Your Name' }).fill(value);
    return this;
  }

  public async fillEmail(value: string): Promise<this> {
    await this.page.getByRole('textbox', { name: 'Email Address' }).fill(value);
    return this;
  }

  public async selectGender(label: string): Promise<this> {
    await this.page.getByRole('combobox').selectOption({ label });
    return this;
  }

  public async fillMobile(value: string): Promise<this> {
    await this.page.getByRole('textbox', { name: 'Mobile Number' }).fill(value);
    return this;
  }

  public async fillPassword(value: string): Promise<this> {
    await this.page.getByRole('textbox', { name: 'Password', exact: true }).fill(value);
    return this;
  }

  public async fillConfirmPassword(value: string): Promise<this> {
    await this.page.getByRole('textbox', { name: 'Confirm Password' }).fill(value);
    return this;
  }

  public async clickSignUp(): Promise<this> {
    await this.page.getByRole('button', { name: 'Sign Up', exact: true }).click();
    return this;
  }

  public async getFieldValue(name: 'Your Name' | 'Email Address' | 'Mobile Number' | 'Password' | 'Confirm Password'): Promise<string> {
    return this.page.getByRole('textbox', { name, exact: true }).inputValue();
  }

  public async getSelectedGender(): Promise<string> {
    return this.page.getByRole('combobox').locator('option:checked').textContent()
      .then((value) => value?.trim() ?? '');
  }

  public async getWelcomeToast(name: string): Promise<string> {
    return this.page.getByText(`Welcome, ${name}! Account created.`).textContent()
      .then((value) => value?.trim().replace(/^✓\s*/, '') ?? '');
  }

  public async getCurrentUrl(): Promise<string> {
    return this.page.url();
  }

  public async isAuthenticated(): Promise<boolean> {
    return (await this.page.getByRole('button', { name: 'Profile' }).count()) > 0
      && (await this.page.getByRole('button', { name: 'My Orders' }).count()) > 0
      && (await this.page.getByRole('button', { name: 'Logout' }).count()) > 0;
  }

  public async isSignInVisible(): Promise<boolean> {
    return (await this.page.getByRole('button', { name: 'Sign In' }).count()) > 0;
  }

  public async clickSignUpLinkFromLogin(): Promise<this> {
    await this.page.locator('.loginsignup-switch span:has-text("Sign Up")').click();
    return this;
  }

  public async getHeadingText(): Promise<string> {
    const authForm = this.page.locator('.loginsignup-container, [data-testid="auth-form"]').first();
    const heading = authForm.getByRole('heading', { level: 1 });
    return heading.textContent()
      .then((value) => value?.trim() ?? '');
  }

  public async getAuthToggleParagraphText(): Promise<string> {
    return this.page.locator('.loginsignup-switch').textContent()
      .then((value) => value?.trim() ?? '');
  }

  public async isSignUpFormVisible(): Promise<boolean> {
    return (await this.page.getByRole('textbox', { name: 'Your Name' }).count()) > 0;
  }

  public async getPlaceholderForField(name: string): Promise<string> {
    return this.page.getByRole('textbox', { name, exact: true }).getAttribute('placeholder')
      .then((v) => v?.trim() ?? '');
  }

  public async getGenderOptions(): Promise<string[]> {
    return this.page.getByRole('combobox').locator('option').allTextContents()
      .then((arr) => arr.map((s) => s.trim()));
  }

  public async isSignUpButtonEnabled(): Promise<boolean> {
    const btn = this.page.getByRole('button', { name: 'Sign Up', exact: true });
    return btn.isEnabled();
  }

  public async isSignUpButtonLoading(): Promise<boolean> {
    const btn = this.page.getByRole('button', { name: 'Sign Up', exact: true });
    const ariaBusy = await btn.getAttribute('aria-busy');
    if (ariaBusy === 'true') return true;
    try {
      return await btn.evaluate((el) => (el as HTMLElement).classList.contains('loading'));
    } catch {
      return false;
    }
  }

  public async navigateToLogin(): Promise<this> {
    await this.page.goto('login');
    return this;
  }

  public async isLoginFormVisible(): Promise<boolean> {
    return (await this.page.getByRole('heading', { name: 'Login' }).count()) > 0;
  }

  public async isLogoutButtonVisible(): Promise<boolean> {
    return (await this.page.getByRole('button', { name: 'Logout' }).count()) > 0;
  }

  public async isMyOrdersButtonVisible(): Promise<boolean> {
    return (await this.page.getByRole('button', { name: 'My Orders' }).count()) > 0;
  }
}
