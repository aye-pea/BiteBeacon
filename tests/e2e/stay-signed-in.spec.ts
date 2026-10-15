import { expect, Page, test } from '@playwright/test';

// Supabase Auth and the REST API are answered locally by page.route, so no real account or project is touched.
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const USER = { id: '0b0b0b0b-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'stay-test@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-10-15T00:00:00Z' };
async function fakeSupabase(page: Page) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', aud: 'authenticated', exp })}.test`;
  await page.route('**/auth/v1/token**', route => route.fulfill({ json: { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'test-refresh', user: USER } }));
  await page.route('**/auth/v1/user**', route => route.fulfill({ json: USER }));
  await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204, body: '' }));
  await page.route('**/rest/v1/profiles**', route => route.fulfill({ json: { allergies: ['milk'], display_name: null, default_everyone: false, default_member_id: null, language: null } }));
  await page.route('**/rest/v1/household_members**', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/pantry_items**', route => route.fulfill({ json: [] }));
}
async function signIn(page: Page, stay: boolean) {
  await page.getByRole('button', { name: 'Already have an account? Sign in' }).click();
  await page.getByLabel('Email address').fill(USER.email);
  await page.getByLabel('Password').fill('local-test-only-password');
  const box = page.getByRole('checkbox', { name: /Stay signed in on this browser/ });
  await expect(box).toBeChecked();
  if (!stay) await box.click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('toast')).toContainText('Signed in · profile loaded');
}

test.skip(!process.env.EXPO_PUBLIC_SUPABASE_URL && !require('node:fs').existsSync('.env'), 'needs Supabase URL configured so the sign-in form shows');

test('stay signed in survives a reload; turning it off ends the session with the tab', async ({ page }) => {
  await fakeSupabase(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await signIn(page, true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Scan a product', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('sb-')))).toBe(true);

  // Sign out clears the stored session.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /App details/ }).click();
  await page.getByRole('button', { name: 'Sign out & clear session' }).click();
  await page.reload();
  await expect(page.getByLabel('Email address')).toBeVisible();

  await signIn(page, false);
  expect(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('sb-')))).toBe(false);
  await page.reload();
  await expect(page.getByLabel('Email address')).toBeVisible();
  // The choice is remembered for next time.
  await page.getByRole('button', { name: 'Already have an account? Sign in' }).click();
  await expect(page.getByRole('checkbox', { name: /Stay signed in on this browser/ })).not.toBeChecked();
});
