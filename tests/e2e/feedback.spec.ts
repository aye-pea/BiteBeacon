import { expect, test } from '@playwright/test';

test('lookup shows progress, inline outcome near the button, and transient confirmations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await expect(page.getByTestId('toast')).toContainText('Demo ready');
  await page.getByRole('button', { name: 'Scan a Product', exact: true }).click();

  // Hold both providers so the in-flight state is observable, then report no match.
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/fdc/v1/**', async route => { await gate; await route.fulfill({ json: { foods: [] } }); });
  await page.route('**/api/v2/product/**', async route => { await gate; await route.fulfill({ json: { status: 0 } }); });
  await page.getByLabel('Barcode number').fill('3017620422003');
  await expect(page.getByText('13 digits · check digit matches')).toBeVisible();
  await page.getByRole('button', { name: 'Look up product' }).click();
  const progress = page.getByRole('progressbar', { name: 'Checking product' });
  await expect(progress).toBeVisible();
  await expect(page.getByRole('button', { name: 'Checking product…' })).toBeDisabled();
  release();
  await expect(progress).toHaveCount(0);
  const outcome = page.getByRole('alert');
  await expect(outcome).toContainText('Product not found');
  await expect(outcome).toBeInViewport();

  await page.getByRole('button', { name: 'Dark Chocolate Bites', exact: true }).click();
  await expect(page.getByTestId('toast')).toContainText('Checked for 8 people');
  await expect(page.getByTestId('product-result')).toBeInViewport();
});
