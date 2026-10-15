import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// public/zxing_reader.wasm is a copy of the browser barcode decoder. If expo-camera upgrades barcode-detector,
// the copy must be refreshed: cp node_modules/zxing-wasm/dist/reader/zxing_reader.wasm public/
describe('self-hosted browser barcode decoder', () => {
  it('matches the zxing-wasm version barcode-detector loads', () => {
    const require = createRequire(import.meta.url);
    const installed = readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm', { paths: [require.resolve('barcode-detector')] }));
    const hosted = readFileSync('public/zxing_reader.wasm');
    expect(createHash('sha256').update(hosted).digest('hex')).toBe(createHash('sha256').update(installed).digest('hex'));
  });
});
