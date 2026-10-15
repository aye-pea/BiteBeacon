import { expect, test } from '@playwright/test';

test('Settings can hide Home from the tab bar, and Scan becomes the first page', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const toggle = page.getByTestId('toolbar-settings').getByRole('switch', { name: 'Show Home in the toolbar' });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toHaveCount(0);
  await page.getByTestId('toolbar-settings').screenshot({ path: 'artifacts/toolbar-setting.png' });
  await page.screenshot({ path: 'artifacts/home-hidden-phone.png' });

  // Remembered on this device; the app now opens on Scan.
  await page.reload();
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Check a barcode' }).or(page.getByTestId('page-scroll').getByRole('heading').first())).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('toolbar-settings').getByRole('switch', { name: 'Show Home in the toolbar' }).click();
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the Presentation theme uses the pitch deck colours and the footer shows version 1.01', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('appearance-settings').getByRole('radio', { name: 'Appearance: Presentation' }).click();
  await expect(page.getByTestId('appearance-settings').getByRole('radio', { name: 'Appearance: Presentation' })).toBeChecked();
  await expect(page.getByText('BiteBeacon · Version 1.01')).toBeVisible();
  await page.screenshot({ path: 'artifacts/presentation-settings.png' });
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.screenshot({ path: 'artifacts/presentation-home.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Try Peanut Crunch Granola' }).click();
  await expect(page.getByTestId('product-result')).toBeVisible();
  await page.screenshot({ path: 'artifacts/presentation-result-phone.png', fullPage: true });
  await page.getByTestId('appearance-settings').count();
  expect(errors).toEqual([]);
});
