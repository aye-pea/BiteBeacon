import { Product, validBarcode } from '../domain/allergens';
// Codes let the UI show the message in the person's language; message stays English for logs and tests.
export type LookupErrorCode = 'invalid' | 'incomplete' | 'busy' | 'unavailable' | 'timeout' | 'unreachable' | 'mismatch' | 'badBarcode' | 'disputed' | 'wait';
export class LookupError extends Error {
  constructor(public code: LookupErrorCode, message: string) { super(message); this.name = 'LookupError'; }
}

const sample = (name: string, ingredients: string, allergens: string[], traces: string[], barcode: string, allergensKnown = true): Product => ({
  name, brand: 'PANTRY LAB · FICTIONAL SAMPLE', ingredients, allergens, traces, barcode, allergensKnown,
  source: 'sample', fetchedAt: new Date().toISOString(), ingredientLanguage: 'en',
});
export const SAMPLES: Product[] = [
  sample('Peanut crunch granola', 'Rolled oats, peanuts, honey, milk powder, sea salt.', ['en:peanuts', 'en:milk'], [], 'SAMPLE-01'),
  sample('Dark chocolate bites', 'Cocoa mass, sugar, cocoa butter.', [], ['en:peanuts', 'en:milk'], 'SAMPLE-02'),
  sample('Simply oat crackers', 'Oats, sunflower oil, sea salt.', [], [], 'SAMPLE-03'),
  sample('Mystery snack', '', [], [], 'SAMPLE-04', false),
];

export function parseProduct(data: unknown, barcode: string): Product | null {
  if (!data || typeof data !== 'object') throw new LookupError('invalid', 'Product source returned an invalid response.');
  const body = data as Record<string, unknown>;
  if (body.status === 0 || (body.status === 'failure' && !body.product)) return null;
  if (!body.product || typeof body.product !== 'object') throw new LookupError('incomplete', 'Product source returned incomplete data. Try again later.');
  const p = body.product as Record<string, unknown>;
  const text = (v: unknown) => typeof v === 'string' ? v : '';
  const tags = (v: unknown) => Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
  return { barcode, name: text(p.product_name_en) || text(p.product_name) || 'Unnamed product', brand: text(p.brands) || 'Brand not listed',
    ingredients: text(p.ingredients_text_en) || text(p.ingredients_text), allergens: tags(p.allergens_tags), traces: tags(p.traces_tags),
    allergensKnown: Array.isArray(p.allergens_tags) && p.allergens_tags.every(t => typeof t === 'string'), source: 'openfoodfacts', fetchedAt: new Date().toISOString(),
    ingredientLanguage: text(p.ingredients_text_en).trim() || p.lang === 'en' ? 'en' : 'unknown',
    updatedAt: typeof p.last_modified_t === 'number' && Number.isFinite(p.last_modified_t) && p.last_modified_t > 0 && p.last_modified_t < 1e11 ? new Date(p.last_modified_t * 1000).toISOString() : undefined };
}
const gtin14 = (code: string) => code.padStart(14, '0');
// Equivalent GTIN spellings (UPC-A, EAN-13, GTIN-14, zero-padded EAN-8) for provider search.
const gtinForms = (barcode: string) => {
  const full = gtin14(barcode);
  return [14, 13, 12, 8].map(n => full.slice(14 - n)).filter(form => /^0*$/.test(full.slice(0, 14 - form.length)));
};

// USDA FoodData Central Branded Foods: manufacturer-submitted label data (GS1 GDSN / Label Insight).
// No structured allergen or trace fields; allergen checks use the full ingredient statement.
export function parseUsdaFoods(data: unknown, barcode: string): Product | null {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { foods?: unknown }).foods)) throw new LookupError('invalid', 'Product source returned an invalid response.');
  const text = (v: unknown) => typeof v === 'string' ? v.trim() : '';
  const matches = ((data as { foods: unknown[] }).foods).filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .filter(f => f.dataType === 'Branded' && typeof f.gtinUpc === 'string' && /^\d{8,14}$/.test(f.gtinUpc) && gtin14(f.gtinUpc) === gtin14(barcode));
  if (!matches.length) return null;
  // Several records can share a GTIN after label changes; newest publication wins.
  const f = matches.sort((a, b) => text(b.publishedDate).localeCompare(text(a.publishedDate)))[0];
  const ingredients = text(f.ingredients);
  const updated = Date.parse(text(f.modifiedDate) || text(f.publishedDate));
  return { barcode, name: text(f.description) || 'Unnamed product', brand: text(f.brandName) || text(f.brandOwner) || 'Brand not listed',
    ingredients, allergens: [], traces: [], allergensKnown: ingredients !== '', source: 'usda', sourceId: typeof f.fdcId === 'number' ? String(f.fdcId) : undefined,
    fetchedAt: new Date().toISOString(), ingredientLanguage: ingredients ? 'en' : 'unknown', updatedAt: Number.isFinite(updated) ? new Date(updated).toISOString() : undefined };
}
let lastRequest = 0;
// User reported Poland Spring; provider returned Hellmann's on 2026-09-30.
// Keep disputed identities blocked until the source record is verified/corrected.
const disputedBarcodes = new Set(['00075720481279']);
const usdaKey = process.env.EXPO_PUBLIC_USDA_FDC_API_KEY || 'DEMO_KEY';
async function getJson(url: string, native: boolean): Promise<{ status: number; data?: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: native ? { 'User-Agent': 'PantryCheck-Demo/0.1 (local-development)' } : undefined });
    if (response.status === 404) return { status: 404 };
    if (response.status === 429) throw new LookupError('busy', 'Product source is busy. Wait a minute and try again.');
    if (!response.ok) throw new LookupError('unavailable', 'Product lookup is unavailable. Check the package and try again later.');
    return { status: response.status, data: await response.json() as unknown };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new LookupError('timeout', 'Product lookup timed out. Check your connection and try again.');
    if (error instanceof TypeError) throw new LookupError('unreachable', 'Could not reach the product source. Check your connection and try again. No allergy assessment is available.');
    throw error;
  } finally { clearTimeout(timeout); }
}
async function lookupUsda(barcode: string, native: boolean): Promise<Product | null> {
  const query = encodeURIComponent(gtinForms(barcode).join(' '));
  const { data } = await getJson(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${query}&dataType=Branded&pageSize=25&api_key=${encodeURIComponent(usdaKey)}`, native);
  return data === undefined ? null : parseUsdaFoods(data, barcode);
}
async function lookupOpenFoodFacts(barcode: string, native: boolean): Promise<Product | null> {
  const fields = 'code,product_name,product_name_en,brands,ingredients_text,ingredients_text_en,lang,allergens_tags,traces_tags,last_modified_t';
  const { data } = await getJson(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${fields}&app_name=PantryCheck-Demo&app_version=0.1`, native);
  if (data === undefined) return null;
  const product = parseProduct(data, barcode);
  if (!product) return null;
  const body = data as { code?: unknown; product: { code?: unknown } };
  const codes = [body.code, body.product.code].filter(code => code !== undefined);
  if (!codes.length || codes.some(code => typeof code !== 'string' || !validBarcode(code) || gtin14(code) !== gtin14(barcode))) {
    throw new LookupError('mismatch', 'Product source returned an unverified or different barcode. No allergy assessment available. Check the package label.');
  }
  return product;
}
// Manufacturer-submitted USDA record first; community Open Food Facts only when USDA has no exact GTIN match.
export async function lookupProduct(barcode: string, native = false): Promise<Product | null> {
  if (!validBarcode(barcode)) throw new LookupError('badBarcode', 'Enter a valid UPC or EAN barcode, including its check digit (8, 12, 13 or 14 digits).');
  if (disputedBarcodes.has(gtin14(barcode))) throw new LookupError('disputed', 'Product identity disputed for this barcode: Open Food Facts lists Hellmann’s Light Mayonnaise, but a Poland Spring bottle was reported. No allergy assessment available. Check the physical package label.');
  if (Date.now() - lastRequest < 4500) throw new LookupError('wait', 'Please wait a few seconds before another product lookup.');
  lastRequest = Date.now();
  let usdaError: unknown;
  try {
    const product = await lookupUsda(barcode, native);
    if (product) return product;
  } catch (error) { usdaError = error; }
  const product = await lookupOpenFoodFacts(barcode, native);
  // USDA failure plus community miss cannot prove the product is absent; surface the USDA error.
  if (!product && usdaError) throw usdaError;
  return product;
}
