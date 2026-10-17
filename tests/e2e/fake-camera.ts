import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Draws a barcode into a Y4M video and gives it to Chromium as the camera, so the browser scanner
// (expo-camera + barcode-detector + our self-hosted WebAssembly decoder) is exercised end to end.
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const R = L.map(c => [...c].map(b => b === '1' ? '0' : '1').join(''));
const G = R.map(c => [...c].reverse().join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
export function ean13Modules(code: string) {
  const d = [...code].map(Number);
  const left = d.slice(1, 7).map((n, i) => (PARITY[d[0]][i] === 'L' ? L : G)[n]).join('');
  const right = d.slice(7).map(n => R[n]).join('');
  return `101${left}01010${right}101`;
}
// UPC-E with number system 0: the six digits' odd/even pattern encodes the check digit.
const UPC_E_PARITY = ['GGGLLL', 'GGLGLL', 'GGLLGL', 'GGLLLG', 'GLGGLL', 'GLLGGL', 'GLLLGG', 'GLGLGL', 'GLGLLG', 'GLLGLG'];
export function upcEModules(code: string) {
  const d = [...code].map(Number);
  return `101${d.slice(1, 7).map((n, i) => (UPC_E_PARITY[d[7]][i] === 'L' ? L : G)[n]).join('')}010101`;
}
function y4m(width: number, height: number, modules: string) {
  const scale = 4;
  const x0 = Math.floor((width - modules.length * scale) / 2), y0 = Math.floor(height * .3), y1 = Math.floor(height * .7);
  const luma = Buffer.alloc(width * height, 235);
  for (let y = y0; y < y1; y++) for (let m = 0; m < modules.length; m++) if (modules[m] === '1') luma.fill(16, y * width + x0 + m * scale, y * width + x0 + (m + 1) * scale);
  const chroma = Buffer.alloc((width / 2) * (height / 2) * 2, 128);
  return Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F15:1 Ip A1:1 C420jpeg\n`), Buffer.from('FRAME\n'), luma, chroma]);
}
/** Playwright options that give Chromium a fake camera showing these barcode modules. */
export function fakeCamera(name: string, modules: string) {
  const video = resolve('test-results', name);
  mkdirSync('test-results', { recursive: true });
  writeFileSync(video, y4m(640, 480, modules));
  return { permissions: ['camera'],
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] } };
}
