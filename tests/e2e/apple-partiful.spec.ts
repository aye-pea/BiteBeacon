import { expect, test } from '@playwright/test';

// Apple and Partiful are Jonathan Tran's pastel look; on bitebeacon.org Auto still means Light/Dark (beta builds use Apple/Partiful).
test('Settings lists Apple and Partiful first, and each paints its own canvas', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const radios = page.getByTestId('appearance-settings').getByRole('radio');
  await expect(radios).toHaveText(['Auto', 'Apple', 'Partiful', 'Light', 'Dark', 'Presentation']);
  for (const [name, bg] of [['Apple', 'rgb(250, 250, 252)'], ['Partiful', 'rgb(21, 21, 30)']] as const) {
    await page.getByTestId('appearance-settings').getByRole('radio', { name: `Appearance: ${name}` }).click();
    await expect.poll(() => page.evaluate(() => {
      for (let n: Element | null = document.querySelector('[data-testid="page-scroll"]'); n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor; if (c !== 'rgba(0, 0, 0, 0)') return c;
      } return '';
    })).toBe(bg);
    const avatars = page.getByTestId(/^profile-avatar-/);
    await expect(avatars.first()).toHaveCSS('background-image', /linear-gradient/);
  }
  await page.reload();
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByTestId('appearance-settings').getByRole('radio', { name: 'Appearance: Partiful' })).toBeChecked();
  expect(errors).toEqual([]);
});
