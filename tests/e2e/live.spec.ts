import { test, expect } from '@playwright/test';
test('opt-in real provider lookup through browser UI', async ({ page }) => {
  test.skip(process.env.RUN_LIVE !== '1', 'External service smoke test; run explicitly.');
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  page.on('requestfailed', request => console.error(request.url(), request.failure()?.errorText));
  await page.goto('/'); await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Scan a product', exact: true }).click();
  await page.getByLabel('Barcode number').fill('009800895007');
  await page.getByRole('button', { name: 'Look up product' }).click();
  await expect(page.getByText('LIVE PRODUCT RESULT', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('USDA FoodData Central (manufacturer-submitted)', { exact: false })).toBeVisible();
  await expect(page.getByTestId('product-result').getByText(/NUTELLA/).first()).toBeVisible();
  await expect(page.getByText('Allergen signal found', { exact: true })).toBeVisible();
  await page.getByTestId('product-result').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/live-lookup.png', fullPage: true });
});
