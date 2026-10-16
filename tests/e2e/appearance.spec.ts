import { expect, Page, test } from '@playwright/test';

// These flows start from the sample cards on Home, which phones hide until Settings turns Home on.
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('bitebeacon.showHome', 'true')));

const LIGHT = 'rgb(242, 244, 239)', DARK = 'rgb(14, 19, 17)';
const canvas = (page: Page) => page.getByTestId('page-scroll').evaluate(el => {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const bg = getComputedStyle(node).backgroundColor;
    if (bg !== 'rgba(0, 0, 0, 0)') return bg;
  }
  return '';
});

// Auto (the default) follows the device appearance; Settings can pin Light or Dark.
for (const [scheme, background] of [['light', LIGHT], ['dark', DARK]] as const) {
  test(`${scheme} appearance follows the device setting`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore employer demo' }).click();
    await page.getByRole('button', { name: 'Try Peanut Crunch Granola' }).click();
    await expect(page.getByTestId('product-result')).toBeVisible();
    expect(await canvas(page)).toBe(background);
    expect(errors).toEqual([]);
  });
}

test('Settings can pin Dark or Light over the device setting, and it is remembered', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const card = page.getByTestId('appearance-settings');
  await expect(card.getByRole('radio', { name: 'Appearance: Auto' })).toBeChecked();
  await card.getByRole('radio', { name: 'Appearance: Dark' }).click();
  await expect.poll(() => canvas(page)).toBe(DARK);
  await page.reload();
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await expect.poll(() => canvas(page)).toBe(DARK);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByTestId('appearance-settings').getByRole('radio', { name: 'Appearance: Light' }).click();
  await expect.poll(() => canvas(page)).toBe(LIGHT);
  await page.getByTestId('appearance-settings').getByRole('radio', { name: 'Appearance: Auto' }).click();
  await expect.poll(() => canvas(page)).toBe(DARK);
  expect(errors).toEqual([]);
});
