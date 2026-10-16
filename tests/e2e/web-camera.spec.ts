import { expect, test } from '@playwright/test';
import { ean13Modules, fakeCamera } from './fake-camera';

const BARCODE = '3017620422003';

test.use(fakeCamera('fake-barcode-camera.y4m', ean13Modules(BARCODE)));

test('browser camera scans a barcode and checks the product', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const wasm: string[] = []; page.on('request', r => { if (r.url().endsWith('.wasm')) wasm.push(r.url()); });
  await page.route('**/fdc/v1/**', route => route.fulfill({ json: { foods: [] } }));
  await page.route('**/api/v2/product/**', route => route.fulfill({ json: { status: 1, code: BARCODE, product: { code: BARCODE,
    product_name: 'Camera test spread', brands: 'Test', lang: 'en', ingredients_text_en: 'Sugar, palm oil, hazelnuts, skim milk, cocoa.',
    allergens_tags: ['en:milk', 'en:nuts'], traces_tags: [] } } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Scan a Product', exact: true }).click();
  await expect(page.getByText('Point your camera at a UPC or EAN barcode.')).toBeVisible();
  await page.getByRole('button', { name: 'Open camera' }).click();
  await expect(page.getByTestId('product-result')).toContainText('Camera Test Spread', { timeout: 20000 });
  await expect(page.getByTestId('product-result')).toContainText(BARCODE);
  // The decoder, when a polyfill is needed, comes from this site, never a public CDN.
  if (!(await page.evaluate(() => 'BarcodeDetector' in globalThis))) expect(wasm.length).toBeGreaterThan(0);
  for (const url of wasm) expect(new URL(url).host).toBe('localhost:8081');
  expect(errors).toEqual([]);
});
