import { setZXingModuleOverrides } from 'barcode-detector';

// Browsers without a built-in BarcodeDetector (Safari, Firefox, desktop Chrome on some systems) use expo-camera's
// barcode-detector polyfill. Its WebAssembly decoder would otherwise download from a public CDN; we serve our own copy
// from public/ (checked against the installed package by tests/webScanner.test.ts).
setZXingModuleOverrides({
  locateFile: (path: string, prefix: string) => path.endsWith('.wasm') ? new URL(path, document.baseURI).href : prefix + path,
});

/** Camera scanning needs getUserMedia, which browsers only offer on https pages (and localhost). */
export const cameraAvailable = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
