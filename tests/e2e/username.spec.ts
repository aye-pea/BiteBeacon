import { expect, Page, test } from '@playwright/test';

// Supabase is answered locally by page.route, so no real account or project is touched.
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const USER = { id: '0b0b0b0b-0000-4000-8000-000000000003', aud: 'authenticated', role: 'authenticated', email: 'sam_k@users.bitebeacon.org', app_metadata: {}, user_metadata: {}, created_at: '2026-10-15T00:00:00Z' };
async function fakeSupabase(page: Page) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', aud: 'authenticated', exp })}.test`;
  const session = { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'test-refresh' };
  const seen: { signup?: Record<string, unknown>; signIn?: Record<string, unknown>; lookup?: Record<string, unknown>; emailChange?: Record<string, unknown>; password?: Record<string, unknown>; reset?: Record<string, unknown> } = {};
  let user: Record<string, unknown> = { ...USER };
  // Off: an email change applies at once. On: Supabase holds it in new_email until the link is opened.
  const opts = { confirmChanges: false };
  await page.route('**/auth/v1/signup**', route => { seen.signup = route.request().postDataJSON(); return route.fulfill({ json: { ...session, user } }); });
  await page.route('**/auth/v1/token**', route => {
    seen.signIn = route.request().postDataJSON();
    if (seen.signIn?.password === 'not-my-password') return route.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } });
    return route.fulfill({ json: { ...session, user } });
  });
  await page.route('**/auth/v1/user**', route => {
    if (route.request().method() === 'PUT' && route.request().postDataJSON().password) { seen.password = route.request().postDataJSON(); return route.fulfill({ json: user }); }
    if (route.request().method() === 'PUT') { seen.emailChange = route.request().postDataJSON(); const email = String(seen.emailChange?.email); user = opts.confirmChanges ? { ...user, new_email: email } : { ...user, email }; }
    return route.fulfill({ json: user });
  });
  await page.route('**/auth/v1/recover**', route => { seen.reset = route.request().postDataJSON(); return route.fulfill({ json: {} }); });
  await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204, body: '' }));
  await page.route('**/rest/v1/rpc/username_sign_in_email**', route => { seen.lookup = route.request().postDataJSON(); return route.fulfill({ json: 'sam@example.com' }); });
  await page.route('**/rest/v1/usernames**', route => route.fulfill({ json: { username: 'sam_k' } }));
  await page.route('**/rest/v1/profiles**', route => route.fulfill({ json: { allergies: ['milk'], display_name: null, default_everyone: false, default_member_id: null, language: null } }));
  await page.route('**/rest/v1/household_members**', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/pantry_items**', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/rpc/is_admin**', route => route.fulfill({ json: false }));
  return Object.assign(seen, { opts });
}

test.skip(!process.env.EXPO_PUBLIC_SUPABASE_URL && !require('node:fs').existsSync('.env'), 'needs Supabase URL configured so the sign-in form shows');

test('signs up with a username, then adds a recovery email in Settings', async ({ page }) => {
  const seen = await fakeSupabase(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill('Bad Name');
  await page.getByLabel('Password', { exact: true }).fill('local-test-only-password');
  await page.getByRole('checkbox').first().click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(/Usernames are 3–20 characters/)).toBeVisible();
  expect(seen.signup).toBeUndefined();

  await page.getByLabel('Username', { exact: true }).fill('Sam_K');
  await page.getByTestId('signup-email').fill('not-an-email');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  expect(seen.signup).toBeUndefined();
  await page.getByTestId('signup-email').fill('');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByTestId('toast')).toContainText('Signed in');
  expect(seen.signup?.email).toBe('sam_k@users.bitebeacon.org');
  expect(seen.emailChange).toBeUndefined();

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('open-account-settings').click();
  const card = page.getByTestId('sign-in-settings');
  await expect(card).toContainText('Username: sam_k');
  await expect(card).toContainText('No email added');
  await page.getByTestId('recovery-email').fill('sam@example.com');
  await page.getByTestId('recovery-email-again').fill('sam@exmple.com');
  await page.getByRole('button', { name: 'Save email' }).click();
  await expect(page.getByTestId('settings-feedback')).toContainText('don’t match');
  expect(seen.emailChange).toBeUndefined();
  await page.getByTestId('recovery-email-again').fill('sam@example.com');
  await page.getByRole('button', { name: 'Save email' }).click();
  await expect(page.getByTestId('settings-feedback')).toContainText('Recovery email saved');
  expect(seen.emailChange?.email).toBe('sam@example.com');
  await expect(card).toContainText('Recovery email: sam@example.com');

  // Changing to another address shows the new one straight away.
  await page.getByTestId('recovery-email').fill('sam.k@example.com');
  await page.getByTestId('recovery-email-again').fill('sam.k@example.com');
  await page.getByRole('button', { name: 'Save email' }).click();
  await expect(card).toContainText('Recovery email: sam.k@example.com');
  await expect(page.getByTestId('recovery-pending')).toHaveCount(0);

  // When Supabase wants the new address confirmed first, the old one stays and the pending one is named.
  seen.opts.confirmChanges = true;
  await page.getByTestId('recovery-email').fill('sam.new@example.com');
  await page.getByTestId('recovery-email-again').fill('sam.new@example.com');
  await page.getByRole('button', { name: 'Save email' }).click();
  await expect(page.getByTestId('settings-feedback')).toContainText('Check sam.new@example.com');
  await expect(card).toContainText('Recovery email: sam.k@example.com');
  await expect(page.getByTestId('recovery-pending')).toContainText('Changing to sam.new@example.com');
});

test('signs in with a username via the lookup, and sends a reset link to an added email', async ({ page }) => {
  const seen = await fakeSupabase(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Already have an account? Sign in' }).click();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByTestId('reset-email').fill('sam@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(/reset link is on its way/)).toBeVisible();
  expect(seen.reset?.email).toBe('sam@example.com');

  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await page.getByLabel('Username or email').fill('sam_k');
  await page.getByLabel('Password', { exact: true }).fill('local-test-only-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('toast')).toContainText('Signed in · profile loaded');
  expect(seen.lookup).toEqual({ p_username: 'sam_k', p_password: 'local-test-only-password' });
  expect(seen.signIn?.email).toBe('sam@example.com');
});

test('an email typed at sign-up is saved as the recovery email straight away', async ({ page }) => {
  const seen = await fakeSupabase(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill('sam_k');
  await page.getByTestId('signup-email').fill(' sam@example.com ');
  await page.getByLabel('Password', { exact: true }).fill('local-test-only-password');
  await page.getByRole('checkbox').first().click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByTestId('toast')).toContainText('Signed in');
  expect(seen.signup?.email).toBe('sam_k@users.bitebeacon.org');
  expect(seen.emailChange?.email).toBe('sam@example.com');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('open-account-settings').click();
  await expect(page.getByTestId('sign-in-settings')).toContainText('Recovery email: sam@example.com');
});

test('changes the password in Settings after checking the current one', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const seen = await fakeSupabase(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Already have an account? Sign in' }).click();
  await page.getByLabel('Username or email').fill('sam_k');
  await page.getByLabel('Password', { exact: true }).fill('local-test-only-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('toast')).toContainText('profile loaded');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('open-account-settings').click();
  const card = page.getByTestId('password-settings');
  await card.getByLabel('Current password').fill('not-my-password');
  await card.getByLabel('New password').fill('a-brand-new-password');
  await card.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Your current password is incorrect.')).toBeVisible();
  expect(seen.password).toBeUndefined();

  await card.getByLabel('Current password').fill('local-test-only-password');
  await card.getByLabel('New password').fill('short');
  await card.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Use at least 12 characters for the new password.')).toBeVisible();

  await card.getByLabel('New password').fill('a-brand-new-password');
  await expect(card.getByLabel('New password')).toHaveAttribute('type', 'password');
  await card.getByTestId('toggle-new-password').click();
  await expect(card.getByLabel('New password')).not.toHaveAttribute('type', 'password');
  await expect(card.getByLabel('Current password')).not.toHaveAttribute('type', 'password'); // one eye shows both
  await card.getByTestId('toggle-current-password').click();
  await expect(card.getByLabel('New password')).toHaveAttribute('type', 'password');
  await expect(card.getByLabel('Current password')).toHaveAttribute('type', 'password');
  await card.screenshot({ path: 'artifacts/change-password.png' });
  await card.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Password changed.')).toBeVisible();
  expect(seen.signIn).toMatchObject({ email: 'sam_k@users.bitebeacon.org', password: 'local-test-only-password' });
  expect(seen.password).toMatchObject({ password: 'a-brand-new-password' });
  await expect(card.getByLabel('Current password')).toHaveValue('');
  expect(errors).toEqual([]);
});
