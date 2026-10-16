import { expect, test } from '@playwright/test';

// Contact-photo letters: one capital normally, two letters when first letters collide, far-apart colours when even those match.
test('household avatars tell apart people who share a first letter', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('open-app-settings').click();
  await page.getByTestId('appearance-settings').getByRole('radio', { name: 'Appearance: Apple' }).click();
  await page.getByTestId('settings-back').click();
  const label = (id: string) => page.getByTestId(`profile-avatar-${id}`);
  await expect(label('self')).toHaveText('A');
  await expect(label('demo-kha')).toHaveText('K');
  await expect(label('demo-dfk')).toHaveText('D');
  await expect(label('demo-nafis')).toHaveText('N');
  await expect(label('demo-jonathan')).toHaveText('J');

  await page.getByRole('button', { name: 'Add a person' }).click();
  await page.getByLabel("Person's name").fill('Jonas');
  await page.getByRole('checkbox', { name: 'Fish for this person', exact: true }).click();
  await page.getByRole('button', { name: 'Add to household' }).click();
  await expect(page.getByTestId('member-form')).toHaveCount(0);
  await expect(label('demo-jonathan')).toHaveText('Jo');
  const jonas = page.getByTestId(/^profile-avatar-/).filter({ hasText: /^Jo$/ });
  await expect(jonas).toHaveCount(2);
  const fills = await jonas.evaluateAll(els => els.map(e => getComputedStyle(e).backgroundImage));
  expect(fills[0]).toMatch(/linear-gradient/);
  expect(fills[0]).not.toEqual(fills[1]);
  await page.screenshot({ path: 'artifacts/avatar-initials.png', fullPage: true });
  expect(errors).toEqual([]);
});
