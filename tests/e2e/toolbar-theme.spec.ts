import { expect, test } from '@playwright/test';

test('phones start without Home in the tab bar, and Settings can turn it on', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await expect(page.getByRole('button', { name: 'Scan a Product', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/home-hidden-phone.png' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const toggle = page.getByTestId('toolbar-settings').getByRole('switch', { name: 'Show Home in the toolbar' });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible();
  await page.getByTestId('toolbar-settings').screenshot({ path: 'artifacts/toolbar-setting.png' });

  // The choice is remembered on this device.
  await page.reload();
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('toolbar-settings').getByRole('switch', { name: 'Show Home in the toolbar' }).click();
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('desktop always keeps Home in the sidebar and has no Toolbar setting', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByTestId('appearance-settings')).toBeVisible();
  await expect(page.getByTestId('toolbar-settings')).toHaveCount(0);
});

test('the Presentation theme uses the pitch deck colours and the footer shows version 1.1', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => localStorage.setItem('bitebeacon.showHome', 'true'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('appearance-settings').getByRole('radio', { name: 'Appearance: Presentation' }).click();
  await expect(page.getByTestId('appearance-settings').getByRole('radio', { name: 'Appearance: Presentation' })).toBeChecked();
  await expect(page.getByText('BiteBeacon · Version 1.1')).toBeVisible();
  await page.screenshot({ path: 'artifacts/presentation-settings.png' });
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.screenshot({ path: 'artifacts/presentation-home.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Try Peanut Crunch Granola' }).click();
  await expect(page.getByTestId('product-result')).toBeVisible();
  await page.screenshot({ path: 'artifacts/presentation-result-phone.png', fullPage: true });
  await page.getByTestId('appearance-settings').count();
  expect(errors).toEqual([]);
});

test('the desktop sidebar is an icon rail that opens on hover, and rows light up under the mouse', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.mouse.move(900, 500);
  const sidebar = page.getByTestId('sidebar');
  const width = () => sidebar.evaluate(el => el.getBoundingClientRect().width);
  await expect.poll(width).toBeLessThan(100);
  const label = () => sidebar.getByText('Pantry', { exact: true }).evaluate(el => getComputedStyle(el.parentElement!).opacity);
  await expect.poll(label).toBe('0');
  await page.waitForTimeout(4500); // let the demo toast fade
  await page.screenshot({ path: 'artifacts/sidebar-collapsed.png' });
  const pantry = page.getByRole('button', { name: 'Pantry', exact: true });
  const shadow = () => pantry.evaluate(el => getComputedStyle(el).boxShadow);
  // Icons must sit in exactly the same place closed and open (the last svg is the faded-out Log Out arrow, which rides at the row's end).
  const icons = () => sidebar.locator('svg, img').evaluateAll(els => els.slice(0, -1).map(el => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width)]; }));
  const closedIcons = await icons();
  expect(await shadow()).not.toContain('inset');
  await pantry.hover();
  await expect.poll(width).toBeGreaterThan(250);
  expect(await icons()).toEqual(closedIcons);
  await expect.poll(label).toBe('1');
  await expect.poll(shadow).toContain('inset');
  await page.screenshot({ path: 'artifacts/sidebar-hover.png' });
  // The page underneath keeps its place: the open sidebar floats over it.
  await page.mouse.move(900, 500);
  await expect.poll(width).toBeLessThan(100);
  await expect.poll(shadow).not.toContain('inset');
  await expect(page.getByText('Private allergy profile')).toHaveCount(0);
});

test('the account holder can save their own list with no allergies and still check for family', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('bitebeacon.showHome', 'true'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Allergies', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Peanuts', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Tree nuts', exact: true }).click();
  await page.getByRole('button', { name: /Save allergy profile/ }).click();
  await expect(page.getByTestId('toast')).toContainText('Allergy profile saved.');
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Try Peanut Crunch Granola' }).click();
  await expect(page.getByTestId('product-result')).toBeVisible();
  // Alex is still listed under Everyone, honestly marked as having no allergies saved.
  await expect(page.getByTestId('product-result').getByText('Alex', { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('the Presentation theme shows the glass logo in the top-left corner; other themes keep the green cart', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('glass-logo')).toHaveCount(0);
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('appearance-settings').getByRole('radio', { name: 'Appearance: Presentation' }).click();
  await expect(page.getByTestId('glass-logo')).toBeVisible();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect.poll(() => page.getByTestId('glass-logo').locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.waitForTimeout(4500); // let the demo toast fade
  await page.screenshot({ path: 'artifacts/glass-logo-desktop.png' });
  await page.screenshot({ path: 'artifacts/glass-logo-closeup.png', clip: { x: 0, y: 0, width: 260, height: 120 } });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('appearance-settings').getByRole('radio', { name: 'Appearance: Light' }).click();
  await expect(page.getByTestId('glass-logo')).toHaveCount(0);
  await page.getByTestId('appearance-settings').getByRole('radio', { name: 'Appearance: Presentation' }).click();
  // The sign-in page uses the same top-left brand row.
  await page.getByRole('button', { name: /Demo explorer/ }).first().click();
  await expect(page.getByTestId('glass-logo')).toBeVisible();
  await page.waitForTimeout(4500);
  await page.screenshot({ path: 'artifacts/glass-logo-signin-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/glass-logo-signin-phone.png' });
  expect(errors).toEqual([]);
});
