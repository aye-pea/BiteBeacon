import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { lookupProduct, parseUsdaFoods } from '../src/data/products';

let time = 100000;
beforeEach(() => { time += 20000; vi.spyOn(Date, 'now').mockReturnValue(time); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const noUsda = () => json({ foods: [] });
// Routes USDA and Open Food Facts requests to separate fresh responses.
const route = (usda: () => Response | Promise<Response>, off: () => Response | Promise<Response>) =>
  vi.fn((url: string) => url.includes('api.nal.usda.gov') ? usda() : off());
const usdaFood = (overrides: Record<string, unknown> = {}) => ({ fdcId: 2517161, dataType: 'Branded', gtinUpc: '00016000275287', description: 'Cheerios Cereal',
  brandOwner: 'General Mills', brandName: 'Cheerios', ingredients: 'WHOLE GRAIN OATS, CORN STARCH, SUGAR, SALT.', publishedDate: '2023-04-27', modifiedDate: '2019-04-24', ...overrides });

it.each(['075720481279', '0075720481279', '00075720481279'])('blocks disputed Poland Spring identity for %s without querying provider', async barcode => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(lookupProduct(barcode)).rejects.toThrow('Product identity disputed');
  expect(fetcher).not.toHaveBeenCalled();
});
it('uses manufacturer-submitted USDA record first and skips community fallback', async () => {
  const fetcher = route(() => json({ foods: [usdaFood()] }), () => { throw new Error('should not call OFF'); });
  vi.stubGlobal('fetch', fetcher);
  expect(await lookupProduct('016000275287')).toMatchObject({ source: 'usda', sourceId: '2517161', name: 'Cheerios Cereal', brand: 'Cheerios', allergensKnown: true, ingredientLanguage: 'en' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(decodeURIComponent(fetcher.mock.calls[0][0])).toContain('00016000275287 0016000275287 016000275287');
});
it('ignores USDA fuzzy hits with a different GTIN', () => {
  expect(parseUsdaFoods({ foods: [usdaFood({ gtinUpc: '00016000322622' }), usdaFood({ gtinUpc: 16000275287 })] }, '016000275287')).toBeNull();
});
it('picks newest USDA record when several share a GTIN', () => {
  const product = parseUsdaFoods({ foods: [usdaFood({ fdcId: 1, publishedDate: '2020-01-01' }), usdaFood({ fdcId: 2, publishedDate: '2024-05-01' })] }, '016000275287');
  expect(product?.sourceId).toBe('2');
});
it('treats USDA record without ingredients as unknown data', () => {
  expect(parseUsdaFoods({ foods: [usdaFood({ ingredients: '' })] }, '016000275287')).toMatchObject({ allergensKnown: false, ingredientLanguage: 'unknown' });
});
it('rejects malformed USDA responses', () => {
  expect(() => parseUsdaFoods({ error: 'x' }, '016000275287')).toThrow('invalid response');
});
it('falls back to Open Food Facts when USDA has no exact match', async () => {
  const body = { code: '0012345678905', product: { code: '0012345678905', product_name: 'Test product' } };
  vi.stubGlobal('fetch', route(noUsda, () => json(body)));
  expect(await lookupProduct('012345678905')).toMatchObject({ source: 'openfoodfacts', name: 'Test Product' });
});
it('falls back to Open Food Facts when USDA is unavailable', async () => {
  const body = { code: '3017620422003', product: { code: '3017620422003', product_name: 'Nutella' } };
  vi.stubGlobal('fetch', route(() => json({}, 503), () => json(body)));
  expect(await lookupProduct('3017620422003')).toMatchObject({ source: 'openfoodfacts', name: 'Nutella' });
});
it('does not report not-found when USDA failed and community source misses', async () => {
  vi.stubGlobal('fetch', route(() => json({}, 429), () => new Response(null, { status: 404 })));
  await expect(lookupProduct('3017620422003')).rejects.toThrow('Wait a minute');
});
it.each([
  { code: '3017620422003', product: { code: '012345678905' } },
  { code: '012345678905', product: {} },
  { product: {} },
  { code: 3017620422003, product: {} },
])('rejects missing or mismatched provider identity %j', async body => {
  vi.stubGlobal('fetch', route(noUsda, () => json(body)));
  await expect(lookupProduct('3017620422003')).rejects.toThrow('unverified or different barcode');
});
it('does not send invalid barcodes to provider', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(lookupProduct('invalid')).rejects.toThrow('valid UPC'); expect(fetcher).not.toHaveBeenCalled();
});
it('returns missing product without inventing a result', async () => {
  vi.stubGlobal('fetch', route(noUsda, () => new Response(null, { status: 404 })));
  expect(await lookupProduct('3017620422003')).toBeNull();
});
it('handles provider throttling', async () => {
  vi.stubGlobal('fetch', route(noUsda, () => new Response(null, { status: 429 })));
  await expect(lookupProduct('3017620422003')).rejects.toThrow('Wait a minute');
});
it('handles network failure without returning an assessment', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  await expect(lookupProduct('3017620422003')).rejects.toThrow('No allergy assessment');
});
it('handles timeouts without returning an assessment', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
  await expect(lookupProduct('3017620422003')).rejects.toThrow('timed out');
});
it('spaces repeated lookups', async () => {
  const fetcher = route(noUsda, () => json({ status: 0 }));
  vi.stubGlobal('fetch', fetcher);
  await lookupProduct('3017620422003');
  await expect(lookupProduct('3017620422003')).rejects.toThrow('wait a few seconds');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
