import { describe, expect, it } from 'vitest';
import { ALLERGENS, AllergenId, assess, assessPeople, cleanName, explain, highlightIngredients, householdSummary, Person, unionAllergies, barcodeCandidates, expandUpcE, validBarcode, validName, worstKind } from '../src/domain/allergens';
import { parseProduct, SAMPLES } from '../src/data/products';

describe('allergy decisions', () => {
  it('separates all four demo outcomes', () => {
    expect(SAMPLES.map(p => assess(p, ['milk', 'peanuts']).kind)).toEqual(['contains', 'traces', 'no-match', 'unknown']);
  });
  it('flags nothing for someone with no allergies saved, without calling it safe', () => {
    const a = assess(SAMPLES[0], []);
    expect(a.kind).toBe('no-match');
    expect(a.reason).toBe('no-allergies');
    expect(a.matches).toEqual([]);
    expect(a.detail).toContain('not a safe-to-eat guarantee');
  });
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
  it.each([
    ['gluten', 'Water, barley malt, salt.'], ['gluten', 'Rolled oats.'], ['gluten', 'Enriched wheat flour.'],
    ['mollusks', 'Oyster sauce, garlic.'], ['mollusks', 'Fried calamari.'], ['mustard', 'Vinegar, mustard seed.'],
    ['celery', 'Carrot, celery, onion.'], ['sulfites', 'Grapes, sodium metabisulfite.'], ['sulfites', 'Apricots, sulphur dioxide.'],
    ['sulfites', 'Lemon juice, preservative (E223).'], ['lupin', 'Lupin flour, rice.'],
  ] as [AllergenId, string][])('finds %s in "%s"', (id, ingredients) => {
    expect(assess({ ...SAMPLES[2], ingredients }, [id]).kind).toBe('contains');
  });
  it('keeps Wheat wheat-only while Gluten covers every gluten grain', () => {
    const rye = { ...SAMPLES[2], ingredients: 'Rye flour, water, salt.' };
    expect(assess(rye, ['wheat']).kind).not.toBe('contains');
    expect(assess(rye, ['gluten']).kind).toBe('contains');
    expect(assess({ ...SAMPLES[2], ingredients: 'Maltodextrin, sugar.' }, ['gluten']).kind).not.toBe('contains');
  });
  it('treats a structured gluten tag as a match when Gluten is selected', () => {
    expect(assess({ ...SAMPLES[2], allergens: ['en:gluten'] }, ['gluten']).kind).toBe('contains');
    expect(assess({ ...SAMPLES[2], allergens: ['en:gluten'] }, ['wheat']).reason).toBe('gluten');
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
  it('credits a shared word to every selected allergen that uses it', () => {
    const e = explain({ ...SAMPLES[2], ingredients: 'Wheat flour, water.' }, ['wheat', 'gluten']);
    expect(e.map(x => x.allergen)).toEqual(['Wheat', 'Gluten']);
  });
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

describe('UPC-E', () => {
  it.each([
    ['04252614', '042100005264'], // last digit 0-2: manufacturer keeps that digit
    ['04904403', '049000000443'], // Coca-Cola 12 oz can
    ['01234531', '012300000451'], // last digit 3
    ['01234543', '012340000053'], // last digit 4
    ['01234565', '012345000065'], // last digit 5-9
    ['11234562', '112345000062'], // number system 1
  ])('expands %s to UPC-A %s', (upcE, upcA) => {
    expect(expandUpcE(upcE)).toBe(upcA);
    expect(validBarcode(upcA)).toBe(true);
  });
  it.each(['04252615', '24252614', '96385074', '042100005264', 'abcdefgh'])('rejects non-UPC-E %s', code => expect(expandUpcE(code)).toBeNull());
  it('tries UPC-E before EAN-8 when an 8-digit code could be either', () => {
    expect(barcodeCandidates('04252641')).toEqual(['042520000061', '04252641']);
    expect(barcodeCandidates('04252614')).toEqual(['042100005264']);
    expect(barcodeCandidates('96385074')).toEqual(['96385074']);
    expect(barcodeCandidates('012345678905')).toEqual(['012345678905']);
  });
  it('trusts the camera when it reads UPC-E', () => {
    expect(barcodeCandidates('04252641', true)).toEqual(['042520000061']);
    expect(barcodeCandidates('96385074', true)).toEqual([]);
  });
});
