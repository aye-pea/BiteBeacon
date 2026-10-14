import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { DICTIONARIES, makeI18n, translate } from '../src/i18n';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

describe('translations', () => {
  for (const [lang, messages] of Object.entries(DICTIONARIES)) {
    it(`${lang} has every key, no blanks and the same placeholders as English`, () => {
      expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort());
      for (const [key, source] of Object.entries(en) as [keyof typeof en, string][]) {
        expect(messages[key].trim(), `${lang} ${key}`).not.toBe('');
        expect(placeholders(messages[key]), `${lang} ${key}`).toEqual(placeholders(source));
      }
    });
    if (lang !== 'en') it(`${lang} is actually translated`, () => {
      const same = (Object.keys(en) as (keyof typeof en)[]).filter(k => messages[k] === en[k] && /[a-z]{4}/.test(en[k]));
      expect(same.length, same.join(', ')).toBeLessThan(15);
    });
  }
  it('fills placeholders and picks plural forms', () => {
    const { t, tp } = makeI18n('en');
    expect(t('result.checkedPerson', { name: 'Sam', allergies: 'Fish' })).toBe('Checked against Sam’s saved profile: Fish.');
    expect(tp('toast.checkedMine', 1)).toBe('Checked against your 1 saved allergy');
    expect(tp('toast.checkedMine', 2)).toBe('Checked against your 2 saved allergies');
    expect(translate('es', 'nav.settings')).not.toBe('');
  });
});
