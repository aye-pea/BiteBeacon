import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Draws an EAN-13 barcode into a Y4M video and gives it to Chromium as the camera, so the browser scanner
// (expo-camera + barcode-detector + our self-hosted WebAssembly decoder) is exercised end to end.
const BARCODE = '3017620422003';
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const R = L.map(c => [...c].map(b => b === '1' ? '0' : '1').join(''));
const G = R.map(c => [...c].reverse().join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
function ean13Modules(code: string) {
  const d = [...code].map(Number);
  const left = d.slice(1, 7).map((n, i) => (PARITY[d[0]][i] === 'L' ? L : G)[n]).join('');
  const right = d.slice(7).map(n => R[n]).join('');
  return `101${left}01010${right}101`;
}
function y4m(width: number, height: number) {
  const modules = ean13Modules(BARCODE), scale = 4;
  const x0 = Math.floor((width - modules.length * scale) / 2), y0 = Math.floor(height * .3), y1 = Math.floor(height * .7);
  const luma = Buffer.alloc(width * height, 235);
  for (let y = y0; y < y1; y++) for (let m = 0; m < modules.length; m++) if (modules[m] === '1') luma.fill(16, y * width + x0 + m * scale, y * width + x0 + (m + 1) * scale);
  const chroma = Buffer.alloc((width / 2) * (height / 2) * 2, 128);
  return Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F15:1 Ip A1:1 C420jpeg\n`), Buffer.from('FRAME\n'), luma, chroma]);
}
const video = resolve('test-results', 'fake-barcode-camera.y4m');
mkdirSync('test-results', { recursive: true });
writeFileSync(video, y4m(640, 480));

test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] },
});

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
  await expect(page.getByTestId('product-result')).toContainText('Camera test spread', { timeout: 20000 });
  await expect(page.getByTestId('product-result')).toContainText(BARCODE);
  // The decoder, when a polyfill is needed, comes from this site, never a public CDN.
  if (!(await page.evaluate(() => 'BarcodeDetector' in globalThis))) expect(wasm.length).toBeGreaterThan(0);
  for (const url of wasm) expect(new URL(url).host).toBe('localhost:8081');
  expect(errors).toEqual([]);
});
