import { expect, test } from '@playwright/test';
import { en } from '../../src/i18n/en';
import { es } from '../../src/i18n/es';
import { vi } from '../../src/i18n/vi';
import { zhHant } from '../../src/i18n/zhHant';

test('choosing Español in Settings translates the app and results', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: en['demo.explore'] }).click();
  await page.getByRole('button', { name: en['nav.settings'], exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Language: English' })).toBeChecked();
  await page.getByRole('radio', { name: 'Language: Español' }).click();
  await expect(page.getByRole('heading', { name: es['settings.title'] })).toBeVisible();
  await expect(page.getByTestId('toast')).toContainText('Español');
  await expect(page.getByText(es['settings.translationNote'])).toBeVisible();
  await page.getByTestId('language-settings').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/language-settings-es.png' });

  await page.getByRole('button', { name: es['nav.overview'], exact: true }).click();
  await page.getByRole('button', { name: es['samples.try'].replace('{name}', 'Peanut crunch granola') }).click();
  // Product names and ingredients stay as the source wrote them; everything around them is Spanish.
  await expect(page.getByTestId('household-summary')).toContainText(es['summary.contains_other'].replace('{c}', '2').replace('{n}', '3'));
  await expect(page.getByTestId('person-result-Alex')).toContainText(es['allergen.peanuts']);
  await expect(page.getByTestId('person-result-DFK')).toContainText(es['person.noMatchReason']);
  await page.getByTestId('product-result').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/household-result-es.png' });
  expect(errors).toEqual([]);
});

test.describe('device language', () => {
  test.use({ locale: 'vi-VN' });
  test('starts in the device language until someone picks another', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: vi['demo.explore'] })).toBeVisible();
    await page.getByRole('button', { name: vi['demo.explore'] }).click();
    await page.getByRole('button', { name: vi['nav.settings'], exact: true }).click();
    await expect(page.getByRole('radio', { name: vi['settings.languageLabel'].replace('{name}', 'Tiếng Việt') })).toBeChecked();
  });
});

test.describe('Traditional Chinese device', () => {
  test.use({ locale: 'zh-TW' });
  test('a Taiwan device starts in Traditional, not Simplified, Chinese', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: zhHant['demo.explore'] }).click();
    await page.getByRole('button', { name: zhHant['nav.settings'], exact: true }).click();
    await expect(page.getByRole('radio', { name: zhHant['settings.languageLabel'].replace('{name}', '中文（繁體）') })).toBeChecked();
  });
});
