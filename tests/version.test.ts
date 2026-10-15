import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../src/version';

describe('app version', () => {
  it('matches app.json', () => {
    const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
    expect(app.expo.version).toBe(APP_VERSION);
  });
});
