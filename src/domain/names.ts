// Product names arrive as the source wrote them: USDA is often ALL CAPS, Open Food Facts often lowercase.
// Shown in Title Case ("Peanut Crunch Granola"). Words already in mixed case (McVitie's, PepsiCo) are kept,
// short all-caps words with no vowels (BBQ, XL) stay capitals, and small joining words stay lowercase.
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'de', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'w/']);
const mixed = (w: string) => w !== w.toLowerCase() && w !== w.toUpperCase();
const cap = (w: string) => w.replace(/\p{L}/u, ch => ch.toUpperCase());
// Hyphenated parts are each capitalised (Ready-To-Eat would read oddly, so only the first part's small words follow SMALL).
const word = (w: string, first: boolean): string => {
  if (!/\p{L}/u.test(w) || mixed(w)) return w;
  if (w === w.toUpperCase() && w.length <= 3 && !/[aeiouy]/i.test(w)) return w;
  const lower = w.toLowerCase();
  if (!first && SMALL.has(lower)) return lower;
  return lower.split('-').map((part, i) => i > 0 && SMALL.has(part) ? part : cap(part)).join('-');
};
export function titleCase(name: string): string {
  let first = true;
  return name.trim().replace(/\s+/g, ' ').split(' ').map(w => { const out = word(w, first); if (/\p{L}/u.test(w)) first = false; return out; }).join(' ');
}
