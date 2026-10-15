import { describe, expect, it } from 'vitest';
import { ALLERGENS, AllergenId, assess, assessPeople, cleanName, explain, highlightIngredients, householdSummary, Person, unionAllergies, validBarcode, validName, worstKind } from '../src/domain/allergens';
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
describe('result evidence', () => {
  const base = { ...SAMPLES[2], allergens: [], traces: [] };
  it('highlights the exact ingredient words that matched, keeping the original text', () => {
    const segs = highlightIngredients('Sugar, Whey powder, tahini.', ['milk', 'sesame']);
    expect(segs.map(s => s.text).join('')).toBe('Sugar, Whey powder, tahini.');
    expect(segs.filter(s => s.allergen)).toEqual([{ text: 'Whey', allergen: 'Milk', hidden: true }, { text: 'tahini', allergen: 'Sesame', hidden: true }]);
  });
  it('does not highlight cocoa butter or words inside other words', () => {
    expect(highlightIngredients('Cocoa butter, eggplant.', ['milk', 'eggs']).some(s => s.allergen)).toBe(false);
    expect(highlightIngredients('Cocoa butter, butter.', ['milk']).filter(s => s.allergen)).toEqual([{ text: 'butter', allergen: 'Milk', hidden: true }]);
  });
  it('only highlights selected allergens', () => {
    expect(highlightIngredients('Milk, peanuts.', ['peanuts']).filter(s => s.allergen).map(s => s.text)).toEqual(['peanuts']);
  });
  it('explains tags, traces and ingredient words separately', () => {
    const e = explain({ ...base, allergens: ['en:milk'], traces: ['en:tree-nuts'], ingredients: 'Whey, whey, almonds.' }, ['milk', 'tree-nuts']);
    expect(e).toEqual([
      { allergen: 'Milk', via: 'hidden', term: 'whey' },
      { allergen: 'Milk', via: 'tag', term: 'milk' },
      { allergen: 'Tree nuts', via: 'hidden', term: 'almonds' },
      { allergen: 'Tree nuts', via: 'trace', term: 'tree nuts' },
    ]);
  });
  it('marks only words that hide their allergen as hidden', () => {
    const segs = highlightIngredients('Milk, whey, Eggs, albumen, soy lecithin, tofu.', ['milk', 'eggs', 'soy']).filter(s => s.allergen);
    expect(segs.map(s => [s.text, !!s.hidden])).toEqual([['Milk', false], ['whey', true], ['Eggs', false], ['albumen', true], ['soy', false], ['tofu', true]]);
  });
  it('does not repeat a plain word the tags already name, but keeps hidden sources', () => {
    const e = explain({ ...base, allergens: ['en:milk'], ingredients: 'Milk, casein.' }, ['milk']);
    expect(e).toEqual([{ allergen: 'Milk', via: 'hidden', term: 'casein' }, { allergen: 'Milk', via: 'tag', term: 'milk' }]);
    expect(explain({ ...base, ingredients: 'Milk.' }, ['milk'])).toEqual([{ allergen: 'Milk', via: 'ingredient', term: 'milk' }]);
  });
  it('has evidence for every allergen assess() reports', () => {
    for (const p of SAMPLES) for (const sel of [['milk', 'peanuts'], ALLERGENS.map(a => a.id)] as AllergenId[][]) {
      const labels = new Set(explain(p, sel).map(e => e.allergen));
      for (const m of assess(p, sel).matches) expect(labels.has(m)).toBe(true);
    }
  });
  it('has no evidence for a no-match result', () => {
    expect(explain({ ...base, ingredients: 'Oats, salt.' }, ['milk'])).toEqual([]);
  });
});
describe('household results', () => {
  const alex: Person = { id: 'me', name: 'Alex', allergies: ['peanuts', 'tree-nuts'] };
  const kha: Person = { id: 'k', name: 'Kha', allergies: ['milk', 'eggs'] };
  const dfk: Person = { id: 'd', name: 'DFK', allergies: ['sesame'] };
  it('assesses each person against their own allergies', () => {
    const r = assessPeople(SAMPLES[0], [alex, kha, dfk]);
    expect(r.map(x => [x.person.name, x.assessment.kind, x.assessment.matches])).toEqual([['Alex', 'contains', ['Peanuts']], ['Kha', 'contains', ['Milk']], ['DFK', 'no-match', []]]);
    expect(householdSummary(r)).toMatchObject({ kind: 'contains', title: '2 of 3 people have an allergen signal' });
  });
  it('summarises by the most serious outcome, never as all-clear while anyone is uncertain', () => {
    expect(householdSummary(assessPeople(SAMPLES[1], [alex, dfk])).title).toBe('Possible traces for 1 of 2 people');
    expect(householdSummary(assessPeople(SAMPLES[3], [alex, dfk])).kind).toBe('unknown');
    expect(householdSummary(assessPeople(SAMPLES[2], [alex, kha, dfk]))).toMatchObject({ kind: 'no-match', title: 'No selected allergens found for all 3 people' });
    expect(householdSummary(assessPeople(SAMPLES[2], [alex, kha])).detail).toMatch(/not an allergy-free or safe-to-eat guarantee/);
  });
  it('orders severity contains > traces > unknown > no-match', () => {
    expect(worstKind(['no-match', 'unknown'])).toBe('unknown');
    expect(worstKind(['unknown', 'traces'])).toBe('traces');
    expect(worstKind(['traces', 'contains', 'no-match'])).toBe('contains');
    expect(worstKind([])).toBe('no-match');
  });
  it('unions allergies in canonical order for highlighting', () => {
    expect(unionAllergies([dfk, alex, kha])).toEqual(['milk', 'eggs', 'peanuts', 'tree-nuts', 'sesame']);
  });
  it('accepts names of 1 to 40 characters after trimming', () => {
    expect(cleanName('  Kha   Le ')).toBe('Kha Le');
    expect([validName('DFK'), validName('   '), validName('x'.repeat(40)), validName('x'.repeat(41))]).toEqual([true, false, true, false]);
  });
});
