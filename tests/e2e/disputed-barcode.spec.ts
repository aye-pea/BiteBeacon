import { expect, test } from '@playwright/test';

test('disputed bottle barcode clears previous assessment and never enters history', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Try Peanut crunch granola' }).click();
  await expect(page.getByTestId('product-result')).toBeVisible();
  await page.getByLabel('Barcode number').fill('075720481279');
  await page.getByRole('button', { name: 'Look up product' }).click();
  await expect(page.getByText(/Product identity disputed for this barcode/)).toBeVisible();
  await expect(page.getByTestId('product-result')).toHaveCount(0);
  await page.getByRole('button', { name: 'Recent Scans', exact: true }).click();
  await expect(page.getByRole('button', { name: /Peanut crunch granola/ })).toBeVisible();
  await expect(page.getByText(/Light Mayonnaise/)).toHaveCount(0);
});
