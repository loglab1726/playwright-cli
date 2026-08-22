import {BasePage} from "@pages/BasePage";

export class ProfilePage extends BasePage {
    public async init(): Promise<this> {
        await this.page.getByRole('heading', { name: 'My Profile' })
        .waitFor({state: 'visible', timeout: 5000});
        return this;
    }

    public async getFullName(): Promise<string> {
        return await this.page.locator('.profile-field:has-text("Full Name")')
        .locator('input').inputValue();
    }
}