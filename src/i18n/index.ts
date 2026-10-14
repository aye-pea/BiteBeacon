import { en, MessageKey, Messages } from './en';
import { es } from './es';
import { zh } from './zh';
import { bn } from './bn';
import { vi } from './vi';

// Native names, so people can find their language whatever the app is currently showing.
export const LANGUAGES = [
  { code: 'en', name: 'English', locale: 'en-US' },
  { code: 'es', name: 'Español', locale: 'es-US' },
  { code: 'zh', name: '中文（简体）', locale: 'zh-CN' },
  { code: 'bn', name: 'বাংলা', locale: 'bn-BD' },
  { code: 'vi', name: 'Tiếng Việt', locale: 'vi-VN' },
] as const;
export type Lang = typeof LANGUAGES[number]['code'];
export const DICTIONARIES: Record<Lang, Messages> = { en, es, zh, bn, vi };
export const isLang = (value: unknown): value is Lang => LANGUAGES.some(l => l.code === value);
export const localeOf = (lang: Lang) => LANGUAGES.find(l => l.code === lang)!.locale;
export const languageName = (lang: Lang) => LANGUAGES.find(l => l.code === lang)!.name;

export type Params = Record<string, string | number>;
export function translate(lang: Lang, key: MessageKey, params: Params = {}): string {
  const template = DICTIONARIES[lang][key] ?? en[key];
  // Numbers use the language's own digits (Bengali shows ১২, not 12).
  const show = (v: string | number) => typeof v === 'number' ? v.toLocaleString(localeOf(lang)) : v;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => name in params ? show(params[name]) : whole);
}
type PluralBase<K> = K extends `${infer B}_one` ? B : never;
export type PluralKey = PluralBase<MessageKey>;
export const translatePlural = (lang: Lang, key: PluralKey, count: number, params: Params = {}) =>
  translate(lang, `${key}_${count === 1 ? 'one' : 'other'}` as MessageKey, { n: count, ...params });

// Device language, used until the person picks one in Settings. Chinese variants all map to Simplified for now.
export function detectLanguage(): Lang {
  let tag = '';
  try { tag = Intl.DateTimeFormat().resolvedOptions().locale; } catch { /* very old engines: fall back to English */ }
  if (typeof navigator !== 'undefined' && Array.isArray(navigator.languages) && navigator.languages[0]) tag = navigator.languages[0];
  const base = tag.toLowerCase().split(/[-_]/)[0];
  return isLang(base) ? base : 'en';
}

export type I18n = {
  lang: Lang;
  t: (key: MessageKey, params?: Params) => string;
  tp: (key: PluralKey, count: number, params?: Params) => string;
  list: (items: string[]) => string;
  date: (iso: string) => string;
  dateTime: (iso: string) => string;
  time: (iso: string) => string;
};
export function makeI18n(lang: Lang): I18n {
  const locale = localeOf(lang);
  return {
    lang,
    t: (key, params) => translate(lang, key, params),
    tp: (key, count, params) => translatePlural(lang, key, count, params),
    list: items => items.join(translate(lang, 'common.listSeparator')),
    date: iso => new Date(iso).toLocaleDateString(locale),
    dateTime: iso => new Date(iso).toLocaleString(locale),
    time: iso => new Date(iso).toLocaleTimeString(locale),
  };
}
export type { MessageKey } from './en';
