import { expect, test } from '@playwright/test';

test('Home has no tab: the BiteBeacon logo at the top opens it on phones and desktop', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  // Phones open on Scan, with no Home tab and no Toolbar setting.
  await expect(page.getByRole('button', { name: 'Scan a Product', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('Show Home in the toolbar')).toHaveCount(0);
  await page.getByTestId('brand-home').click();
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await page.waitForTimeout(4500); // let the demo toast fade
  await page.screenshot({ path: 'artifacts/logo-home-phone.png' });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toHaveCount(0);
  await page.getByTestId('brand-home').click();
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await page.mouse.move(900, 500);
  await page.screenshot({ path: 'artifacts/logo-home-desktop.png' });
  expect(errors).toEqual([]);
});

test('the Presentation theme uses the pitch deck colours and the footer shows version 1.2', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('open-app-settings').click();
  await page.getByTestId('appearance-settings').getByRole('radio', { name: 'Appearance: Presentation' }).click();
  await expect(page.getByTestId('appearance-settings').getByRole('radio', { name: 'Appearance: Presentation' })).toBeChecked();
  await expect(page.getByText('BiteBeacon · Version 1.2')).toBeVisible();
  await page.screenshot({ path: 'artifacts/presentation-settings.png' });
  await page.getByTestId('brand-home').click();
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

test('coming back to the browser window does not pop the sidebar open, but Tab still does', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  const sidebar = page.getByTestId('sidebar');
  const width = () => sidebar.evaluate(el => el.getBoundingClientRect().width);
  // Click a sidebar row, then move the mouse off the sidebar: focus stays on that row.
  await page.getByRole('button', { name: 'Pantry', exact: true }).click();
  await page.mouse.move(900, 500);
  await expect.poll(width).toBeLessThan(100);
  // Swiping to another full-screen app and back: the window loses focus, then the browser hands it back to the same row
  // (and Safari can report the mouse entering wherever it happens to sit).
  await page.evaluate(() => {
    const row = document.activeElement as HTMLElement;
    row.blur(); window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus')); row.focus();
    document.querySelector('[data-testid="sidebar"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
  });
  await page.waitForTimeout(400);
  expect(await width()).toBeLessThan(100);
  // Moving the mouse onto it still opens it, and leaving closes it.
  await page.getByRole('button', { name: 'Allergies', exact: true }).hover();
  await expect.poll(width).toBeGreaterThan(250);
  await page.mouse.move(900, 500);
  await expect.poll(width).toBeLessThan(100);
  // Keyboard users still get the open sidebar when Tab lands in it.
  await page.getByTestId('brand-home').focus();
  await page.keyboard.press('Tab');
  await expect.poll(width).toBeGreaterThan(250);
});

test('the account holder can save their own list with no allergies and still check for family', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Allergies', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Peanuts', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Tree nuts', exact: true }).click();
  await page.getByRole('button', { name: /Save allergy profile/ }).click();
  await expect(page.getByTestId('toast')).toContainText('Allergy profile saved.');
  await page.getByTestId('brand-home').click();
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
  await page.getByTestId('open-app-settings').click();
  await page.getByTestId('appearance-settings').getByRole('radio', { name: 'Appearance: Presentation' }).click();
  await expect(page.getByTestId('glass-logo')).toBeVisible();
  await page.getByTestId('brand-home').click();
  await expect.poll(() => page.getByTestId('glass-logo').locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.waitForTimeout(4500); // let the demo toast fade
  await page.screenshot({ path: 'artifacts/glass-logo-desktop.png' });
  await page.screenshot({ path: 'artifacts/glass-logo-closeup.png', clip: { x: 0, y: 0, width: 260, height: 120 } });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('open-app-settings').click();
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
