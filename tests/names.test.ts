import { describe, expect, it } from 'vitest';
import { titleCase } from '../src/domain/names';

describe('titleCase', () => {
  it('capitalises lowercase and ALL CAPS product names', () => {
    expect(titleCase('peanut crunch granola')).toBe('Peanut Crunch Granola');
    expect(titleCase('HONEY NUT CHEERIOS CEREAL')).toBe('Honey Nut Cheerios Cereal');
  });
  it('keeps small joining words lowercase except at the start', () => {
    expect(titleCase('MACARONI AND CHEESE WITH BROCCOLI')).toBe('Macaroni and Cheese with Broccoli');
    expect(titleCase('the original potato chips')).toBe('The Original Potato Chips');
  });
  it('leaves mixed-case words, numbers and short acronyms alone', () => {
    expect(titleCase("McVitie's digestives")).toBe("McVitie's Digestives");
    expect(titleCase('BBQ CHIPS 12 OZ')).toBe('BBQ Chips 12 Oz');
    expect(titleCase('ready-to-eat oats')).toBe('Ready-to-Eat Oats');
  });
  it('tidies spacing and keeps non-Latin names', () => {
    expect(titleCase('  dark   chocolate ')).toBe('Dark Chocolate');
    expect(titleCase('pâte à tartiner')).toBe('Pâte À Tartiner');
    expect(titleCase('')).toBe('');
  });
});
