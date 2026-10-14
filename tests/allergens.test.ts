import { describe, expect, it } from 'vitest';
import { ALLERGENS, assess, validBarcode } from '../src/domain/allergens';
import { parseProduct, SAMPLES } from '../src/data/products';

describe('allergy decisions', () => {
  it('separates all four demo outcomes', () => {
    expect(SAMPLES.map(p => assess(p, ['milk', 'peanuts']).kind)).toEqual(['contains', 'traces', 'no-match', 'unknown']);
  });
  it('requires an active profile', () => { expect(assess(SAMPLES[0], []).kind).toBe('unknown'); });
  it('keeps positive tags even when ingredients missing', () => { expect(assess({ ...SAMPLES[0], ingredients: '' }, ['peanuts']).kind).toBe('contains'); });
  it('never clears an incomplete product', () => {
    expect(assess({ ...SAMPLES[2], ingredients: '' }, ['milk']).kind).toBe('unknown');
    expect(assess({ ...SAMPLES[2], allergensKnown: false }, ['milk']).kind).toBe('unknown');
  });
  it('keeps generic gluten distinct from wheat', () => {
    expect(assess({ ...SAMPLES[2], allergens: ['en:gluten'] }, ['wheat']).kind).toBe('unknown');
  });
  it('keeps unsupported ingredient language unknown unless positive tags exist', () => {
    expect(assess({ ...SAMPLES[2], ingredientLanguage: 'unknown' }, ['milk']).kind).toBe('unknown');
    expect(assess({ ...SAMPLES[0], ingredientLanguage: 'unknown' }, ['milk']).kind).toBe('contains');
  });
  it('spots English ingredient synonyms as a conservative signal', () => {
    expect(assess({ ...SAMPLES[2], ingredients: 'Sugar, whey, tahini.' }, ['milk', 'sesame']).matches).toEqual(['Milk', 'Sesame']);
  });
  it('does not interpret a negated claim as proof of absence', () => {
    expect(assess({ ...SAMPLES[2], ingredients: 'Milk-free chocolate.' }, ['milk']).kind).toBe('contains');
  });
  it('uses whole words instead of matching egg inside eggplant', () => {
    expect(assess({ ...SAMPLES[2], ingredients: 'Eggplant, salt.' }, ['eggs']).kind).toBe('no-match');
  });
  it('does not treat cocoa butter as dairy butter, but preserves milk tags', () => {
    expect(assess({ ...SAMPLES[2], ingredients: 'Cocoa butter, sugar.' }, ['milk']).kind).toBe('no-match');
    expect(assess({ ...SAMPLES[2], ingredients: 'Cocoa butter.', allergens: ['en:milk'] }, ['milk']).kind).toBe('contains');
  });
  it.each(ALLERGENS)('matches structured tags for $label', allergen => {
    expect(assess({ ...SAMPLES[2], allergens: [`en:${allergen.tags[0]}`] }, [allergen.id]).kind).toBe('contains');
  });
  it('recalculates for changed allergies', () => {
    expect(assess(SAMPLES[0], ['sesame']).kind).toBe('no-match');
    expect(assess(SAMPLES[0], ['milk']).kind).toBe('contains');
  });
});
describe('barcode validation', () => {
  it.each(['3017620422003', '012345678905', '96385074', '00012345678905'])('accepts correct check digit: %s', code => expect(validBarcode(code)).toBe(true));
  it.each(['3017620422004', 'abc', '123', '', 'https://example.com', 'SAMPLE-01', '12345678'])('rejects malformed code: %s', code => expect(validBarcode(code)).toBe(false));
});
describe('provider normalization', () => {
  it('handles missing products', () => expect(parseProduct({ status: 0 }, '123')).toBeNull());
  it('keeps missing fields uncertain', () => {
    const p = parseProduct({ product: { product_name: 'Test' } }, '012345678905')!;
    expect(p.allergensKnown).toBe(false);
    expect(assess(p, ['milk']).kind).toBe('unknown');
  });
  it('rejects malformed responses', () => { expect(() => parseProduct('bad', '123')).toThrow(); expect(() => parseProduct({}, '123')).toThrow(); });
  it('filters untrusted tag values', () => {
    const p = parseProduct({ product: { allergens_tags: [null, {}, 'en:milk'], last_modified_t: Infinity } }, '012345678905')!;
    expect(p.allergens).toEqual(['en:milk']); expect(p.updatedAt).toBeUndefined();
  });
});
