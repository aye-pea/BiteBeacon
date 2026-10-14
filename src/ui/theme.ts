import { Platform, TextStyle, useColorScheme } from 'react-native';

// Grouped-background palette: tinted canvas, content cards, one green accent kept for actions and selection.
// Dark values are dimmer canvases with brighter foregrounds, not inversions (dark-mode.md › Dark Mode colors).
const light = {
  bg: '#F2F4EF', paper: '#FFFFFF', chrome: '#FBFCF8', ink: '#17332B', muted: '#56655D', faint: '#606F67',
  green: '#1F5A45', greenDeep: '#173F32', greenSoft: '#E6EFE2', greenSoftPressed: '#D7E5D1', lime: '#D8EF8A', onAccent: '#FFFFFF',
  border: '#E3E8DF', borderStrong: '#C9D4C4', pale: '#EEF1EA', separator: 'rgba(23,51,43,0.12)', fill: '#F4F6F1',
  red: '#A2322C', redPressed: '#7E2521', redSoft: '#FCEBE8', amber: '#86560F', amberSoft: '#FBF0D9', amberPressed: '#F3E3BD', blue: '#2C5872', blueSoft: '#E6EFF4',
  toast: '#17332B', toastText: '#FFFFFF', shadow: 'rgba(23,51,43,0.04)', shadowRaised: 'rgba(23,51,43,0.18)',
};
export type Palette = typeof light;
const dark: Palette = {
  bg: '#0E1311', paper: '#1A201D', chrome: '#141916', ink: '#E9EFEA', muted: '#A7B3AB', faint: '#97A49C',
  green: '#86D0A8', greenDeep: '#A6E0C0', greenSoft: '#1E3229', greenSoftPressed: '#284236', lime: '#D8EF8A', onAccent: '#0E1311',
  border: '#2A322E', borderStrong: '#3B4640', pale: '#232A26', separator: 'rgba(233,239,234,0.14)', fill: '#242B27',
  red: '#FF928A', redPressed: '#FFB3AD', redSoft: '#3A1E1C', amber: '#F0C46C', amberSoft: '#32280F', amberPressed: '#40341A', blue: '#93C6E8', blueSoft: '#152839',
  toast: '#E9EFEA', toastText: '#0E1311', shadow: 'rgba(0,0,0,0)', shadowRaised: 'rgba(0,0,0,0.5)',
};
/** Light palette, for the few module-level defaults that render before a scheme is known. */
export const C = light;
export const shadowOf = (P: Palette) => ({ card: `0px 1px 2px ${P.shadow}`, raised: `0px 12px 32px ${P.shadowRaised}` });
export const shadow = shadowOf(light);
// Web cannot drive transforms on the native thread.
export const nativeDriver = Platform.OS !== 'web';

// iOS Dynamic Type "Large" sizes (typography.md › Specifications). Body stays at the 17 pt default.
export const type: Record<'largeTitle' | 'title2' | 'title3' | 'headline' | 'body' | 'subhead' | 'footnote' | 'caption', TextStyle> = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.4 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 24 },
  subhead: { fontSize: 15, lineHeight: 21 },
  footnote: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },
};

export type Tone = 'success' | 'info' | 'warning' | 'danger';
const toneOf = (P: Palette): Record<Tone, { fg: string; bg: string }> => ({
  success: { fg: P.green, bg: P.greenSoft }, info: { fg: P.blue, bg: P.blueSoft },
  warning: { fg: P.amber, bg: P.amberSoft }, danger: { fg: P.red, bg: P.redSoft },
});
export const tone = toneOf(light);

export type Scheme = 'light' | 'dark';
export const palettes: Record<Scheme, Palette> = { light, dark };
export const themes: Record<Scheme, { C: Palette; tone: Record<Tone, { fg: string; bg: string }>; shadow: ReturnType<typeof shadowOf> }> = {
  light: { C: light, tone: toneOf(light), shadow: shadowOf(light) },
  dark: { C: dark, tone: toneOf(dark), shadow: shadowOf(dark) },
};
/** Follows the device's light or dark appearance; there is deliberately no in-app switch (dark-mode.md). */
export function useScheme(): Scheme { return useColorScheme() === 'dark' ? 'dark' : 'light'; }
/** Builds a StyleSheet for both appearances once, at module load. */
export function bothSchemes<T>(make: (P: Palette, sh: ReturnType<typeof shadowOf>) => T): Record<Scheme, T> {
  return { light: make(light, shadowOf(light)), dark: make(dark, shadowOf(dark)) };
}
