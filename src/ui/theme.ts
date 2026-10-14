import { Platform } from 'react-native';

export const C = {
  bg: '#F3F5EF', paper: '#FFFFFF', ink: '#17332B', muted: '#5B6B63', faint: '#8A988F',
  green: '#1F5A45', greenDeep: '#173F32', greenSoft: '#E6EFE2', lime: '#D8EF8A',
  border: '#DFE6DB', borderStrong: '#C9D4C4', pale: '#EDF2E8',
  red: '#A2322C', redSoft: '#FCEBE8', amber: '#86560F', amberSoft: '#FBF0D9', blue: '#2C5872', blueSoft: '#E6EFF4',
};
export const shadow = { card: '0px 1px 2px rgba(23,51,43,0.05), 0px 10px 28px rgba(23,51,43,0.06)', raised: '0px 12px 32px rgba(23,51,43,0.18)' };
// Web cannot drive transforms on the native thread.
export const nativeDriver = Platform.OS !== 'web';

export type Tone = 'success' | 'info' | 'warning' | 'danger';
export const tone: Record<Tone, { fg: string; bg: string }> = {
  success: { fg: C.green, bg: C.greenSoft }, info: { fg: C.blue, bg: C.blueSoft },
  warning: { fg: C.amber, bg: C.amberSoft }, danger: { fg: C.red, bg: C.redSoft },
};
