export const ALLERGENS = [
  { id: 'milk', plain: ['milk'] as string[], label: 'Milk', mark: 'Mi', tags: ['milk'], words: ['milk', 'butter', 'whey', 'casein', 'caseinate', 'cream', 'cheese', 'yogurt'] },
  { id: 'eggs', plain: ['egg', 'eggs'] as string[], label: 'Eggs', mark: 'Eg', tags: ['eggs', 'egg'], words: ['egg', 'eggs', 'albumen', 'ovalbumin'] },
  { id: 'peanuts', plain: ['peanut', 'peanuts'] as string[], label: 'Peanuts', mark: 'Pe', tags: ['peanuts', 'peanut'], words: ['peanut', 'peanuts', 'groundnut'] },
  { id: 'tree-nuts', plain: [] as string[], label: 'Tree nuts', mark: 'Nu', tags: ['nuts', 'tree-nuts', 'almonds', 'hazelnuts', 'walnuts', 'cashews', 'pecans', 'pistachios', 'macadamia-nuts', 'brazil-nuts'], words: ['almond', 'almonds', 'hazelnut', 'hazelnuts', 'walnut', 'walnuts', 'cashew', 'cashews', 'pecan', 'pecans', 'pistachio', 'pistachios', 'macadamia', 'brazil nut'] },
  { id: 'soy', plain: ['soy', 'soya', 'soybean', 'soybeans'] as string[], label: 'Soy', mark: 'So', tags: ['soybeans', 'soy', 'soya'], words: ['soy', 'soya', 'soybean', 'soybeans', 'tofu', 'edamame'] },
  { id: 'wheat', plain: ['wheat'] as string[], label: 'Wheat', mark: 'Wh', tags: ['wheat'], words: ['wheat', 'semolina', 'spelt', 'durum', 'bulgur', 'farina'] },
  { id: 'fish', plain: ['fish'] as string[], label: 'Fish', mark: 'Fi', tags: ['fish'], words: ['fish', 'salmon', 'tuna', 'cod', 'anchovy', 'anchovies', 'haddock'] },
  { id: 'shellfish', plain: [] as string[], label: 'Crustacean shellfish', mark: 'Sh', tags: ['crustaceans', 'shrimp', 'crab', 'lobster'], words: ['shrimp', 'prawn', 'prawns', 'crab', 'lobster', 'crayfish'] },
  { id: 'sesame', plain: ['sesame'] as string[], label: 'Sesame', mark: 'Se', tags: ['sesame-seeds', 'sesame'], words: ['sesame', 'tahini', 'benne'] },
  // The six below complete the EU/UK, Canada and Australia lists. Open Food Facts tags them too; USDA only gives ingredient text.
  // Gluten covers every gluten grain, wheat included, for people with celiac disease; Wheat stays wheat-only.
  { id: 'gluten', plain: ['gluten'] as string[], label: 'Gluten', mark: 'Gl', tags: ['gluten'], words: ['gluten', 'wheat', 'semolina', 'spelt', 'durum', 'bulgur', 'farina', 'barley', 'rye', 'oat', 'oats', 'malt', 'malted', 'triticale', 'kamut', 'seitan', 'einkorn', 'emmer', 'farro'] },
  { id: 'mollusks', plain: ['mollusk', 'mollusks', 'mollusc', 'molluscs'] as string[], label: 'Mollusks', mark: 'Mo', tags: ['molluscs', 'mollusks'], words: ['mollusk', 'mollusks', 'mollusc', 'molluscs', 'clam', 'clams', 'mussel', 'mussels', 'oyster', 'oysters', 'scallop', 'scallops', 'squid', 'calamari', 'octopus', 'cuttlefish', 'abalone', 'snail', 'snails', 'escargot', 'whelk', 'whelks', 'conch'] },
  { id: 'mustard', plain: ['mustard'] as string[], label: 'Mustard', mark: 'Mu', tags: ['mustard'], words: ['mustard'] },
  { id: 'celery', plain: ['celery'] as string[], label: 'Celery', mark: 'Ce', tags: ['celery'], words: ['celery', 'celeriac'] },
  { id: 'sulfites', plain: ['sulfite', 'sulfites', 'sulphite', 'sulphites', 'sulfur dioxide', 'sulphur dioxide'] as string[], label: 'Sulfites', mark: 'Su', tags: ['sulphur-dioxide-and-sulphites', 'sulfites', 'sulphites'], words: ['sulfite', 'sulfites', 'sulphite', 'sulphites', 'sulfur dioxide', 'sulphur dioxide', 'bisulfite', 'bisulphite', 'metabisulfite', 'metabisulphite', 'e220', 'e221', 'e222', 'e223', 'e224', 'e225', 'e226', 'e227', 'e228'] },
  { id: 'lupin', plain: ['lupin', 'lupine'] as string[], label: 'Lupin', mark: 'Lu', tags: ['lupin'], words: ['lupin', 'lupine', 'lupini'] },
] as const;
export type AllergenId = typeof ALLERGENS[number]['id'];
export type Product = {
  barcode: string; name: string; brand: string; ingredients: string;
  allergens: string[]; traces: string[]; allergensKnown: boolean;
  source: 'sample' | 'usda' | 'openfoodfacts'; sourceId?: string; fetchedAt: string; updatedAt?: string; ingredientLanguage: 'en' | 'unknown';
};
// title/detail are the English wording; the UI translates from kind and reason.
export type Assessment = { kind: 'contains' | 'traces' | 'unknown' | 'no-match'; title: string; detail: string; matches: string[]; reason?: 'no-profile' | 'gluten' };
const tag = (s: string) => s.toLowerCase().replace(/^[a-z]{2}:/, '');
export function assess(product: Product, selected: AllergenId[]): Assessment {
  if (!selected.length) return { kind: 'unknown', title: 'Choose your allergies first', detail: 'No allergy profile is selected. This product has not been checked for you.', matches: [], reason: 'no-profile' };
  const active = ALLERGENS.filter(a => selected.includes(a.id));
  const contains = active.filter(a => a.tags.some(t => product.allergens.map(tag).includes(t)));
  const traces = active.filter(a => a.tags.some(t => product.traces.map(tag).includes(t)));
  // Ingredient text is only a conservative fallback. It is not a complete medical taxonomy.
  // Cocoa butter is a cocoa ingredient, not a dairy-butter signal. Structured tags still win.
  const ingredientText = product.ingredients.replace(/\bcocoa butter\b/gi, 'cocoa fat');
  const possible = active.filter(a => a.words.some(w => new RegExp(`\\b${w}\\b`, 'i').test(ingredientText)));
  const matches = Array.from(new Set([...contains, ...possible].map(a => a.label)));
  if (matches.length) return { kind: 'contains', title: 'Allergen signal found', detail: 'Your selected allergen appears in reported tags or ingredient text. Text matches can include precautionary statements. Check the package; do not rely on this app to decide to eat it.', matches };
  if (traces.length) return { kind: 'traces', title: 'May contain your allergen', detail: 'The source reports possible traces or cross-contact with your selected allergen. Check the physical label.', matches: traces.map(a => a.label) };
  const genericGluten = selected.includes('wheat') && [...product.allergens, ...product.traces].map(tag).includes('gluten');
  if (!product.ingredients.trim() || !product.allergensKnown || genericGluten || product.ingredientLanguage !== 'en') return { kind: 'unknown', title: 'Not enough information', detail: genericGluten ? 'The source lists gluten without identifying its grain. Wheat exposure cannot be ruled out.' : 'Ingredient or allergen information is incomplete, or ingredient language is unsupported. Missing data does not mean an allergen is absent.', matches: [], ...(genericGluten ? { reason: 'gluten' as const } : {}) };
  return { kind: 'no-match', title: 'No selected allergens found', detail: 'No match in the available data. This is not an allergy-free or safe-to-eat guarantee. Recipes, labels and cross-contact can differ; always check the package.', matches: [] };
}
export function validBarcode(value: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((n, d, i) => n + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - sum % 10) % 10 === check;
}

// Evidence explains an assessment; it never changes one. It reuses assess()'s tags and vocabulary so the two cannot disagree.
// 'ingredient' = the allergen is named outright ("milk"); 'hidden' = a word that comes from it without saying so ("whey" → milk).
export type Evidence = { allergen: string; via: 'tag' | 'trace' | 'ingredient' | 'hidden'; term: string };
export type Segment = { text: string; allergen?: string; hidden?: boolean };
const isHidden = (allergen: string, term: string) => !ALLERGENS.find(a => a.label === allergen)!.plain.includes(term.toLowerCase());
const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function ingredientHits(text: string, selected: AllergenId[]) {
  const cocoa = Array.from(text.matchAll(/\bcocoa butter\b/gi), m => [m.index!, m.index! + m[0].length]);
  const hits: { start: number; end: number; allergen: string }[] = [];
  for (const a of ALLERGENS.filter(a => selected.includes(a.id))) for (const w of a.words) for (const m of text.matchAll(new RegExp(`\\b${escape(w)}\\b`, 'gi'))) {
    const start = m.index!, end = start + m[0].length;
    if (!cocoa.some(([s, e]) => start >= s && end <= e)) hits.push({ start, end, allergen: a.label });
  }
  // Earliest first, longest wins on ties; highlightIngredients drops overlaps so each character is highlighted once.
  return hits.sort((x, y) => x.start - y.start || y.end - x.end);
}
export function highlightIngredients(text: string, selected: AllergenId[]): Segment[] {
  const segments: Segment[] = []; let at = 0;
  for (const h of ingredientHits(text, selected)) {
    if (h.start < at) continue;
    if (h.start > at) segments.push({ text: text.slice(at, h.start) });
    const word = text.slice(h.start, h.end);
    segments.push({ text: word, allergen: h.allergen, ...(isHidden(h.allergen, word) ? { hidden: true } : {}) }); at = h.end;
  }
  if (at < text.length) segments.push({ text: text.slice(at) });
  return segments;
}
export function explain(product: Product, selected: AllergenId[]): Evidence[] {
  const out: Evidence[] = [];
  const add = (e: Evidence) => { if (!out.some(o => o.allergen === e.allergen && o.via === e.via && o.term === e.term)) out.push(e); };
  const clean = (t: string) => tag(t).replace(/-/g, ' ');
  for (const a of ALLERGENS.filter(a => selected.includes(a.id))) {
    for (const t of product.allergens) if ((a.tags as readonly string[]).includes(tag(t))) add({ allergen: a.label, via: 'tag', term: clean(t) });
    for (const t of product.traces) if ((a.tags as readonly string[]).includes(tag(t))) add({ allergen: a.label, via: 'trace', term: clean(t) });
  }
  // A plain word adds nothing once a tag already names that allergen ("milk" next to tag "milk"); hidden sources always stay.
  // Each allergen is scanned on its own, so a word shared by two ("wheat" for Wheat and Gluten) is evidence for both.
  const tagged = new Set(out.filter(e => e.via === 'tag').map(e => e.allergen));
  for (const id of selected) for (const s of highlightIngredients(product.ingredients, [id])) if (s.allergen && (s.hidden || !tagged.has(s.allergen))) add({ allergen: s.allergen, via: s.hidden ? 'hidden' : 'ingredient', term: s.text.toLowerCase() });
  // Group by allergen so each one's reasons read together; within one, hidden sources lead because they are the ones people miss.
  const order = (e: Evidence) => ALLERGENS.findIndex(a => a.label === e.allergen) * 10 + ['hidden', 'tag', 'ingredient', 'trace'].indexOf(e.via);
  return out.sort((x, y) => order(x) - order(y));
}

// Household: the same per-person assessment, run once for each person being checked.
export type Person = { id: string; name: string; allergies: AllergenId[] };
export type PersonResult = { person: Person; assessment: Assessment; evidence: Evidence[] };
export const MAX_MEMBERS = 8;
const SEVERITY: Record<Assessment['kind'], number> = { 'no-match': 0, unknown: 1, traces: 2, contains: 3 };
export const worstKind = (kinds: Assessment['kind'][]) => kinds.reduce<Assessment['kind']>((w, k) => SEVERITY[k] > SEVERITY[w] ? k : w, 'no-match');
export const unionAllergies = (people: Person[]) => ALLERGENS.map(a => a.id).filter(id => people.some(p => p.allergies.includes(id)));
export const cleanName = (value: string) => value.trim().replace(/\s+/g, ' ');
export const validName = (value: string) => cleanName(value).length >= 1 && cleanName(value).length <= 40;
export function assessPeople(product: Product, people: Person[]): PersonResult[] {
  return people.map(person => ({ person, assessment: assess(product, person.allergies), evidence: explain(product, person.allergies) }));
}
export function householdSummary(results: PersonResult[]): { kind: Assessment['kind']; title: string; detail: string; count: number; total: number } {
  const n = results.length;
  const kind = worstKind(results.map(r => r.assessment.kind));
  const count = results.filter(r => r.assessment.kind === kind).length;
  const people = (c: number) => `${c} of ${n} people`;
  const caution = 'Check the package before serving. A result for one person says nothing about anyone else.';
  const counts = { count, total: n };
  if (kind === 'contains') return { ...counts, kind, title: `${people(count)} ${count === 1 ? 'has' : 'have'} an allergen signal`, detail: caution };
  if (kind === 'traces') return { ...counts, kind, title: `Possible traces for ${people(count)}`, detail: caution };
  if (kind === 'unknown') return { ...counts, kind, title: `Not enough information for ${people(count)}`, detail: 'Missing data does not mean an allergen is absent. ' + caution };
  return { ...counts, kind, title: `No selected allergens found for all ${n} people`, detail: 'This is not an allergy-free or safe-to-eat guarantee for anyone. Recipes, labels and cross-contact can differ; always check the package.' };
}
