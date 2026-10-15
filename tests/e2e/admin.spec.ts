import { expect, Page, test } from '@playwright/test';
import { en as EN } from '../../src/i18n/en';

// Supabase is answered locally by page.route, so no real account or project is touched.
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const USER = { id: '0b0b0b0b-0000-4000-8000-000000000002', aud: 'authenticated', role: 'authenticated', email: 'admin-test@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' };
const day = (back: number) => { const d = new Date(); d.setDate(d.getDate() - back); return d.toISOString().slice(0, 10); };
const STATS = {
  generated_at: new Date().toISOString(), scans: 1204, accounts: 37, profiles: 33, members: 41, signups_7d: 6, signups_30d: 19,
  active_1d: 4, active_7d: 15, active_30d: 28,
  signups_by_day: Array.from({ length: 30 }, (_, i) => ({ day: day(29 - i), count: [0, 1, 0, 2, 1, 0, 0, 3, 1, 0][i % 10] })),
  recent_sign_ins: [{ email: 'admin-test@example.test', created_at: '2026-10-01T00:00:00Z', last_sign_in_at: new Date().toISOString() }, { email: 'new.person@example.test', created_at: '2026-10-14T00:00:00Z', last_sign_in_at: null }],
  allergens: { peanuts: 21, milk: 17, 'tree-nuts': 12, eggs: 9, gluten: 6, sesame: 5, shellfish: 3 },
  household_sizes: { 1: 18, 2: 7, 3: 5, 4: 3 }, languages: { device: 22, es: 6, zh: 3, en: 2 },
  pantry: { items: 88, active: 52, with_expiry: 61, accounts: 11 },
};
async function fakeSupabase(page: Page, admin: boolean, extra: object = {}) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', aud: 'authenticated', exp })}.test`;
  const calls = { scans: 0, stats: 0 };
  await page.route('**/auth/v1/token**', route => route.fulfill({ json: { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'test-refresh', user: USER } }));
  await page.route('**/auth/v1/user**', route => route.fulfill({ json: USER }));
  await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204, body: '' }));
  await page.route('**/rest/v1/profiles**', route => route.fulfill({ json: { allergies: ['milk'], display_name: null, default_everyone: false, default_member_id: null, language: null } }));
  await page.route('**/rest/v1/household_members**', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/pantry_items**', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/rpc/is_admin**', route => route.fulfill({ json: admin }));
  await page.route('**/rest/v1/rpc/admin_stats**', route => { calls.stats++; return admin ? route.fulfill({ json: { ...STATS, ...extra, scans: STATS.scans + calls.scans } }) : route.fulfill({ status: 400, json: { message: 'admin_only' } }); });
  await page.route('**/rest/v1/rpc/record_scan**', async route => { calls.scans++; expect(route.request().postData() ?? '').not.toMatch(/\d{8}/); await route.fulfill({ status: 204, body: '' }); });
  await page.route('**/fdc/v1/**', route => route.fulfill({ json: { foods: [] } }));
  await page.route('**/api/v2/product/**', route => route.fulfill({ json: { status: 0 } }));
  return calls;
}
async function signIn(page: Page) {
  await page.getByRole('button', { name: 'Already have an account? Sign in' }).click();
  await page.getByLabel('Username or email').fill(USER.email);
  await page.getByLabel('Password', { exact: true }).fill('local-test-only-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('toast')).toContainText('Signed in · profile loaded');
}
async function lookUp(page: Page) {
  await page.getByRole('button', { name: 'Scan a Product', exact: true }).click();
  await page.getByLabel('Barcode number').fill('3017620422003');
  await page.getByRole('button', { name: 'Look up product' }).click();
  await expect(page.getByText(/not found/i).first()).toBeVisible();
}

test.skip(!process.env.EXPO_PUBLIC_SUPABASE_URL && !require('node:fs').existsSync('.env'), 'needs Supabase URL configured so the sign-in form shows');

test('admins see the live dashboard, and each lookup adds one to the anonymous total', async ({ page }) => {
  const calls = await fakeSupabase(page, true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await signIn(page);
  await lookUp(page);
  await expect.poll(() => calls.scans).toBe(1);

  await page.getByRole('button', { name: 'Admin Dashboard', exact: true }).click();
  await expect(page.getByTestId('admin-scans')).toContainText('1,205');
  await expect(page.getByTestId('admin-accounts')).toContainText('37');
  await expect(page.getByText('new.person@example.test')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 1900 });
  await page.screenshot({ path: 'artifacts/admin-dashboard.png' });
});

test('limited admins see scans, accounts, activity and sign-ins, without pantry, household, allergen or language panes', async ({ page }) => {
  await fakeSupabase(page, true, { full: false });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await signIn(page);
  await page.getByRole('button', { name: 'Admin Dashboard', exact: true }).click();
  await expect(page.getByTestId('admin-scans')).toContainText('1,204');
  await expect(page.getByTestId('admin-accounts')).toContainText('37');
  await expect(page.getByTestId('admin-active')).toBeVisible();
  await expect(page.getByTestId('admin-signups')).toBeVisible();
  await expect(page.getByText('new.person@example.test')).toBeVisible();
  await expect(page.getByTestId('admin-members')).toHaveCount(0);
  await expect(page.getByTestId('admin-pantry')).toHaveCount(0);
  for (const key of ['admin.allergens', 'admin.households', 'admin.languages'] as const) await expect(page.getByText(EN[key], { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/admin-dashboard-limited.png', fullPage: true });
});

test('the dashboard is hidden from other accounts and from the demo; sample taps are not counted', async ({ page }) => {
  const calls = await fakeSupabase(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await signIn(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByTestId('open-admin')).toHaveCount(0);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /App details/ }).click();
  await page.getByRole('button', { name: 'Sign out & clear session' }).click();
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Scan a Product', exact: true }).click();
  await page.getByRole('button', { name: 'Peanut Crunch Granola' }).click();
  await expect(page.getByTestId('product-result')).toBeVisible();
  expect(calls.scans).toBe(0);
  // Demo lookups count too, signed out.
  await lookUp(page);
  await expect.poll(() => calls.scans).toBe(1);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByTestId('open-admin')).toHaveCount(0);
  expect(calls.stats).toBe(0);
});
