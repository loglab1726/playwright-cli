import {BasePage} from '@pages/BasePage'
import {OrdersPage} from '@pages/OrdersPage'
import {ProfilePage} from '@pages/ProfilePage'
import {AuthenticationPage} from '@pages/AuthenticationPage'

export class LandingPage extends BasePage {
    public async init(): Promise<this> {
        await this.page.goto('')
        await this.page.getByRole('button',{name: 'Profile'})
        .waitFor({state: 'visible', timeout: 5000});
        return this;
    }

    public async initUnauthenticated(): Promise<this> {
        await this.page.goto('')
        await this.page.getByRole('button', { name: 'Sign In' })
            .waitFor({ state: 'visible', timeout: 5000 });
        return this;
    }

    public async clickProfileButton(): Promise<ProfilePage> {
        await this.page.getByRole('button', { name: 'Profile' }).click();
        return new ProfilePage(this.page).init();
    }

    public async clickMyOrdersButton(): Promise<OrdersPage> {
        await this.page.getByRole('button', { name: 'My Orders' }).click();
        return new OrdersPage(this.page).init();
    }

    public async clickSignUpButton(): Promise<AuthenticationPage> {
        await this.page.getByRole('button', { name: 'Sign Up' }).click();
        return new AuthenticationPage(this.page).init();
    }

    public async isSignUpButtonVisible(): Promise<boolean> {
        return (await this.page.getByRole('button', { name: 'Sign Up' }).count()) > 0;
    }
}
