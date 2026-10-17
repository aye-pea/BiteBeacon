import { expect, test } from '@playwright/test';

test('Settings groups name and sign-in under Account, language and appearance under App, with a back button', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  // The main menu: Account and App rows, the household, then About & Privacy.
  await expect(page.getByTestId('open-account-settings')).toBeVisible();
  await expect(page.getByTestId('open-app-settings')).toBeVisible();
  await expect(page.getByTestId('appearance-settings')).toHaveCount(0);
  await expect(page.getByTestId('language-settings')).toHaveCount(0);
  await expect(page.getByTestId('settings-back')).toHaveCount(0);
  await page.waitForTimeout(4500); // let the demo toast fade
  await page.screenshot({ path: 'artifacts/settings-menu-phone.png' });

  await page.getByTestId('open-account-settings').click();
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Your name' })).toBeVisible();
  await expect(page.getByTestId('settings-back')).toBeVisible();
  await page.screenshot({ path: 'artifacts/settings-account-phone.png' });
  await page.getByTestId('settings-back').click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await page.getByTestId('open-app-settings').click();
  await expect(page.getByRole('heading', { name: 'App', exact: true })).toBeVisible();
  await expect(page.getByTestId('language-settings')).toBeVisible();
  await expect(page.getByTestId('appearance-settings')).toBeVisible();
  await page.screenshot({ path: 'artifacts/settings-app-phone.png' });
  await page.getByTestId('settings-back').click();
  await expect(page.getByTestId('open-app-settings')).toBeVisible();

  // About & Privacy gets the same way back.
  await page.getByRole('button', { name: /About & Privacy/ }).click();
  await page.getByTestId('settings-back').click();
  await expect(page.getByTestId('open-account-settings')).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByTestId('open-app-settings').click();
  await expect(page.getByTestId('settings-back')).toBeVisible();
  await page.mouse.move(900, 500);
  await page.screenshot({ path: 'artifacts/settings-app-desktop.png' });
  await page.getByTestId('settings-back').click();
  await expect(page.getByTestId('open-app-settings')).toBeVisible();
  await page.screenshot({ path: 'artifacts/settings-menu-desktop.png' });
  expect(errors).toEqual([]);
});

test('on phones, a Settings submenu slides in from the right and Back slides the menu in from the left', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const slide = page.getByTestId('page-slide');
  const offset = () => slide.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
  await page.getByTestId('open-app-settings').click();
  await page.waitForTimeout(60);
  expect(await offset()).toBeGreaterThan(20); // still coming in from the right
  await expect.poll(offset).toBe(0);
  await page.getByTestId('settings-back').click();
  await page.waitForTimeout(60);
  expect(await offset()).toBeLessThan(-20); // the menu comes back from the left
  await expect.poll(offset).toBe(0);
  // Switching tabs doesn't slide.
  await page.getByRole('button', { name: 'Pantry', exact: true }).click();
  expect(await offset()).toBe(0);
});
