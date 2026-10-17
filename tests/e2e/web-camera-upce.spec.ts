import { expect, test } from '@playwright/test';
import { fakeCamera, upcEModules } from './fake-camera';

// The 0 275415 4 water bottle. The browser decoder reports UPC-E already expanded (0027541000054).
test.use(fakeCamera('fake-upce-camera.y4m', upcEModules('02754154')));

test('browser camera expands a UPC-E barcode and finds the product', async ({ page }) => {
  const looked: string[] = [];
  await page.route('**/fdc/v1/**', route => route.fulfill({ json: { foods: [] } }));
  await page.route('**/api/v2/product/**', route => { looked.push(route.request().url());
    return route.fulfill({ json: { status: 1, code: '0027541000054', product: { code: '0027541000054', product_name: 'Camera test water', brands: 'Test',
      lang: 'en', ingredients_text_en: 'Purified water.', allergens_tags: [], traces_tags: [] } } }); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Scan a Product', exact: true }).click();
  await page.getByRole('button', { name: 'Open camera' }).click();
  await expect(page.getByTestId('product-result')).toContainText('Camera Test Water', { timeout: 20000 });
  expect(looked.some(url => url.includes('27541000054'))).toBe(true);
});
