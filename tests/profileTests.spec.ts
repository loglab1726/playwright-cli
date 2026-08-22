import {expect, test} from './fixtures';
import { LandingPage } from '@pages/LandingPage';

test.describe('Profile Page Tests', () => {

  test('Verify Profile Page Loads Correctly', async ({ open }) => {
    let profilePage = await open(LandingPage)
    .then((_)=> _.clickProfileButton())
  
    await expect.poll(async () => {
      return await profilePage.getFullName();
    },{
      timeout: 10000,
      intervals: [500],
      message: 'Waiting for Full Name to be populated on Profile Page'
    }).toBe('Test User');

  })
})