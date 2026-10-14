export const ALLERGENS = [
  { id: 'milk', label: 'Milk', mark: 'Mi', tags: ['milk'], words: ['milk', 'butter', 'whey', 'casein', 'caseinate', 'cream', 'cheese', 'yogurt'] },
  { id: 'eggs', label: 'Eggs', mark: 'Eg', tags: ['eggs', 'egg'], words: ['egg', 'eggs', 'albumen', 'ovalbumin'] },
  { id: 'peanuts', label: 'Peanuts', mark: 'Pe', tags: ['peanuts', 'peanut'], words: ['peanut', 'peanuts', 'groundnut'] },
  { id: 'tree-nuts', label: 'Tree nuts', mark: 'Nu', tags: ['nuts', 'tree-nuts', 'almonds', 'hazelnuts', 'walnuts', 'cashews', 'pecans', 'pistachios', 'macadamia-nuts', 'brazil-nuts'], words: ['almond', 'almonds', 'hazelnut', 'hazelnuts', 'walnut', 'walnuts', 'cashew', 'cashews', 'pecan', 'pecans', 'pistachio', 'pistachios', 'macadamia', 'brazil nut'] },
  { id: 'soy', label: 'Soy', mark: 'So', tags: ['soybeans', 'soy', 'soya'], words: ['soy', 'soya', 'soybean', 'soybeans', 'tofu', 'edamame'] },
  { id: 'wheat', label: 'Wheat', mark: 'Wh', tags: ['wheat'], words: ['wheat', 'semolina', 'spelt', 'durum', 'bulgur', 'farina'] },
  { id: 'fish', label: 'Fish', mark: 'Fi', tags: ['fish'], words: ['fish', 'salmon', 'tuna', 'cod', 'anchovy', 'anchovies', 'haddock'] },
  { id: 'shellfish', label: 'Crustacean shellfish', mark: 'Sh', tags: ['crustaceans', 'shrimp', 'crab', 'lobster'], words: ['shrimp', 'prawn', 'prawns', 'crab', 'lobster', 'crayfish'] },
  { id: 'sesame', label: 'Sesame', mark: 'Se', tags: ['sesame-seeds', 'sesame'], words: ['sesame', 'tahini', 'benne'] },
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

// Household: the same per-person assessment, run once for each person being checked.
export type Person = { id: string; name: string; allergies: AllergenId[] };
export type PersonResult = { person: Person; assessment: Assessment };
export const MAX_MEMBERS = 8;
const SEVERITY: Record<Assessment['kind'], number> = { 'no-match': 0, unknown: 1, traces: 2, contains: 3 };
export const worstKind = (kinds: Assessment['kind'][]) => kinds.reduce<Assessment['kind']>((w, k) => SEVERITY[k] > SEVERITY[w] ? k : w, 'no-match');
export const cleanName = (value: string) => value.trim().replace(/\s+/g, ' ');
export const validName = (value: string) => cleanName(value).length >= 1 && cleanName(value).length <= 40;
export function assessPeople(product: Product, people: Person[]): PersonResult[] {
  return people.map(person => ({ person, assessment: assess(product, person.allergies) }));
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
