import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 45000, use: { baseURL: 'http://localhost:8081', browserName: 'chromium', screenshot: 'only-on-failure',
    // The demo normally signs in as a random person in a random order; tests pin it to Alex first.
    storageState: 'tests/e2e/fixed-demo.json' },
  webServer: { command: 'npm run web -- --port 8081', url: 'http://localhost:8081', reuseExistingServer: true, timeout: 120000 },
});
