import { expect, Page, test } from '@playwright/test';

// Supabase is answered locally by page.route, so no real account or project is touched.
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const USER = { id: '0b0b0b0b-0000-4000-8000-000000000004', aud: 'authenticated', role: 'authenticated', email: 'pat@users.bitebeacon.org', app_metadata: {}, user_metadata: {}, created_at: '2026-10-15T00:00:00Z' };
// An account that never saved its own allergies: no profiles row and nobody in the household yet.
async function fakeSupabase(page: Page, profile?: Record<string, unknown>) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', aud: 'authenticated', exp })}.test`;
  const seen: { profileInserts: Record<string, unknown>[]; memberInserts: Record<string, unknown>[] } = { profileInserts: [], memberInserts: [] };
  const members: { id: string; name: string; allergies: string[] }[] = [];
  await page.route('**/auth/v1/token**', route => route.fulfill({ json: { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'test-refresh', user: USER } }));
  await page.route('**/auth/v1/user**', route => route.fulfill({ json: USER }));
  await page.route('**/rest/v1/rpc/username_sign_in_email**', route => route.fulfill({ json: 'pat@users.bitebeacon.org' }));
  await page.route('**/rest/v1/usernames**', route => route.fulfill({ json: { username: 'pat' } }));
  await page.route('**/rest/v1/profiles**', route => {
    const method = route.request().method();
    if (method === 'POST') { seen.profileInserts.push(route.request().postDataJSON()); return route.fulfill({ status: 201, body: '' }); }
    if (method === 'GET') return route.fulfill({ json: profile ? [profile] : [] });
    return route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/rest/v1/household_members**', route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: members });
    const body = route.request().postDataJSON(); seen.memberInserts.push(body);
    const row = { id: `m-${members.length + 1}`, name: body.name, allergies: body.allergies }; members.push(row);
    return route.fulfill({ status: 201, json: row });
  });
  await page.route('**/rest/v1/pantry_items**', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/rpc/is_admin**', route => route.fulfill({ json: false }));
  await page.route('**/rest/v1/rpc/record_scan**', route => route.fulfill({ json: null }));
  return seen;
}

test.skip(!process.env.EXPO_PUBLIC_SUPABASE_URL && !require('node:fs').existsSync('.env'), 'needs Supabase URL configured so the sign-in form shows');

test('the eye button shows and hides the password while signing in', async ({ page }) => {
  await fakeSupabase(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Already have an account? Sign in' }).click();
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('local-test-only-password');
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).not.toHaveAttribute('type', 'password');
  await expect(password).toHaveValue('local-test-only-password');
  await page.screenshot({ path: 'artifacts/password-visible.png' });
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
});

test('someone with no allergies of their own can add family and check food for them', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const seen = await fakeSupabase(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Already have an account? Sign in' }).click();
  await page.getByLabel('Username or email').fill('pat');
  await page.getByLabel('Password', { exact: true }).fill('local-test-only-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('toast')).toContainText('choose your allergies');
  await expect(page.getByTestId('page-scroll').getByRole('heading').first()).toHaveText('Allergies');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('Save your own allergy profile first')).toHaveCount(0);
  await expect(page.getByTestId('show-for-settings')).toHaveCount(0); // nobody to choose between yet
  await page.getByRole('button', { name: 'Add a person' }).click();
  await page.getByLabel("Person's name").fill('Mia');
  await page.getByRole('checkbox', { name: 'Peanuts for this person', exact: true }).click();
  await page.getByRole('button', { name: 'Add to household' }).click();
  await expect(page.getByTestId('member-form')).toHaveCount(0);
  expect(seen.memberInserts).toEqual([{ name: 'Mia', allergies: ['peanuts'], position: 0 }]);
  await expect(page.getByTestId('show-for-settings')).toBeVisible();
  await page.screenshot({ path: 'artifacts/family-without-own-allergies.png', fullPage: true });

  // The first household setting creates the empty profile row.
  await page.getByLabel('Your name').fill('Pat');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('button', { name: 'Save name' })).toHaveCount(0);
  expect(seen.profileInserts[0]).toMatchObject({ allergies: [], consent_version: '2026-09-30', display_name: 'Pat' });

  // The account holder is listed too, even with no allergies, but a scan must still check someone who has some.
  const showFor = page.getByTestId('show-for-settings');
  await expect(showFor.getByRole('checkbox')).toHaveCount(3); // Everyone, you, Mia
  await expect(showFor.getByRole('checkbox', { name: 'Default: Mia' })).toBeChecked();
  await expect(showFor.getByRole('checkbox', { name: /^Default: (You|Pat)$/ })).not.toBeChecked();
  await showFor.getByRole('checkbox', { name: /^Default: (You|Pat)$/ }).click();
  await expect(showFor.getByRole('checkbox', { name: /^Default: (You|Pat)$/ })).toBeChecked();
  await showFor.getByRole('checkbox', { name: 'Default: Mia' }).click();
  await expect(page.getByTestId('toast')).toContainText('Keep at least one person with allergies saved selected.');
  await expect(showFor.getByRole('checkbox', { name: 'Default: Mia' })).toBeChecked();
  // Scanning is open (it checks Mia's list) instead of sending Pat to choose allergies.
  await page.getByRole('button', { name: 'Scan a Product', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose allergies' })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/family-without-own-allergies-scan.png' });
  expect(errors).toEqual([]);
});

test('a first visit opens on Allergies, but a list saved with nothing selected opens the app as usual', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await fakeSupabase(page, { id: USER.id, allergies: [], consent_version: '2026-09-30', display_name: 'pat' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Already have an account? Sign in' }).click();
  await page.getByLabel('Username or email').fill('pat');
  await page.getByLabel('Password', { exact: true }).fill('local-test-only-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('toast')).toContainText('profile loaded');
  await expect(page.getByTestId('page-scroll').getByRole('heading').first()).toHaveText('Good food starts with a check.');
  expect(errors).toEqual([]);
});
