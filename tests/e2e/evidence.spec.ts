import { expect, test } from '@playwright/test';

test('result explains which words and tags caused an allergen signal', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Try Peanut Crunch Granola' }).click();
  // Unticking Everyone narrows the check back to the account holder.
  await page.getByRole('checkbox', { name: 'Check for Everyone (8)' }).click();
  const result = page.getByTestId('product-result');
  await expect(result.getByText('Allergen signal found', { exact: true })).toBeVisible();
  const why = page.getByTestId('result-evidence');
  await expect(why.getByText('Why this result')).toBeVisible();
  await expect(why.getByText(/as an allergen|appears in the ingredients/).first()).toBeVisible();
  await why.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/evidence-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Simply Oat Crackers', exact: true }).click();
  await expect(page.getByText('No selected allergens found', { exact: true })).toBeVisible();
  await expect(page.getByTestId('result-evidence')).toHaveCount(0);
  expect(errors).toEqual([]);
});
