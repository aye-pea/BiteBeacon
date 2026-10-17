import { expect, test } from '@playwright/test';

test('employer demo: four outcomes, profile edits, session history and invalid barcode', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await expect(page.getByText('Good food starts with a check.')).toBeVisible();
  await page.screenshot({ path: 'artifacts/dashboard-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Try Peanut Crunch Granola' }).click();
  await expect(page.getByText('4 of 7 people have an allergen signal', { exact: true })).toBeVisible();
  // Unticking Everyone narrows the check back to the account holder.
  await page.getByRole('checkbox', { name: 'Check for Everyone (7)' }).click();
  await expect(page.getByText('Allergen signal found', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dark Chocolate Bites', exact: true }).click();
  await expect(page.getByText('May contain your allergen', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Simply Oat Crackers', exact: true }).click();
  await expect(page.getByText('No selected allergens found', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mystery Snack', exact: true }).click();
  await expect(page.getByText('Not enough information', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Allergies', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Peanuts', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Tree nuts', exact: true }).click();
  await page.getByRole('button', { name: 'Save allergy profile' }).click();
  // An empty own list saves too (someone may only shop for family).
  await expect(page.getByTestId('toast')).toContainText('Allergy profile saved.');
  await page.getByRole('button', { name: 'Allergies', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Sesame', exact: true }).click();
  await page.getByRole('button', { name: 'Save allergy profile' }).click();
  await page.getByRole('button', { name: 'Recent Scans', exact: true }).click();
  await expect(page.getByText('Peanut Crunch Granola', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Peanut Crunch Granola/ }).click();
  await expect(page.getByText('No selected allergens found', { exact: true })).toBeVisible();
  await page.getByLabel('Barcode number').fill('123');
  await page.getByRole('button', { name: 'Look up product' }).click();
  await expect(page.getByText(/Enter a valid UPC/)).toBeVisible();
  await page.getByRole('button', { name: 'Exit demo ↗' }).click();
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Recent Scans', exact: true }).click();
  await expect(page.getByText('Your next scan starts here.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile layout and no-result network path', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.screenshot({ path: 'artifacts/dashboard-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Scan a Product', exact: true }).click();
  await page.route('**/fdc/v1/foods/search**', route => route.fulfill({ json: { foods: [] } }));
  await page.route('**/api/v2/product/**', route => route.fulfill({ json: { status: 0 } }));
  await page.getByLabel('Barcode number').fill('3017620422003');
  await page.getByRole('button', { name: 'Look up product' }).click();
  await expect(page.getByText(/Product not found/)).toBeVisible();
  await expect(page.getByTestId('product-result')).toHaveCount(0);
  await page.getByRole('button', { name: 'Dark Chocolate Bites', exact: true }).click();
  await page.getByTestId('product-result').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/result-mobile.png', fullPage: true });
});

test('small phone allergy controls stay reachable and navigation resets scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Allergies', exact: true }).click();
  const save = page.getByRole('button', { name: 'Save allergy profile' });
  await expect(save).toBeInViewport();
  await expect(page.getByRole('heading', { name: 'Allergies', exact: true })).toBeInViewport();
  await page.getByRole('checkbox', { name: 'Crustacean shellfish', exact: true }).click();
  await expect(page.getByText('3 of 15 selected · Unsaved changes')).toBeVisible();
  await expect(save).toBeInViewport();
  await page.getByRole('button', { name: 'Reset changes' }).click();
  await expect(page.getByRole('checkbox', { name: 'Crustacean shellfish', exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Sesame', exact: true }).click();
  const sesame = await page.getByRole('checkbox', { name: 'Sesame', exact: true }).boundingBox();
  const saveBox = await save.boundingBox();
  expect(sesame!.y + sesame!.height).toBeLessThan(saveBox!.y);
  await page.screenshot({ path: 'artifacts/allergies-mobile.png' });
  // Saving pops a notification pinned to the top of the screen and goes to Scan; it fades on its own.
  await save.click();
  const toast = page.getByTestId('toast');
  await expect(toast).toContainText('Profile saved');
  await expect(toast).toContainText('Demo only: changes last until this session ends.');
  await expect(page.getByText('What’s in your next bite?')).toBeVisible();
  await expect.poll(async () => (await toast.boundingBox())?.y).toBeGreaterThanOrEqual(8);
  expect((await toast.boundingBox())!.y).toBeLessThan(40);
  await expect(toast).toHaveCount(0, { timeout: 6000 });
  // Phones open history from the Pantry page; the tab bar keeps five tabs.
  await page.getByRole('button', { name: 'Pantry', exact: true }).click();
  await page.getByRole('button', { name: 'Recent Scans', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recent scans', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Allergies', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Allergies', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('allergy rows wrap enlarged text without hiding controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Allergies', exact: true }).click();
  // Browser stress fixture; native Dynamic Type still requires device QA.
  await page.addStyleTag({ content: '[role="checkbox"] div { font-size: 32px !important; line-height: 1.4 !important; }' });
  const shellfish = page.getByRole('checkbox', { name: 'Crustacean shellfish', exact: true });
  await shellfish.click();
  await expect(shellfish).toBeChecked();
  expect(await shellfish.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  const label = shellfish.getByText('Crustacean shellfish', { exact: true });
  const labelBox = await label.boundingBox();
  const rowBox = await shellfish.boundingBox();
  expect(labelBox!.y + labelBox!.height).toBeLessThanOrEqual(rowBox!.y + rowBox!.height);
  await expect(page.getByRole('button', { name: 'Save allergy profile' })).toBeInViewport();
  await page.screenshot({ path: 'artifacts/allergies-large-text.png' });
});

test('the demo signs in as a random one of the demo people, others in shuffled order', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.addInitScript(() => localStorage.removeItem('bitebeacon.demoFixedOrder')); // undo the tests' fixed order
  await page.goto('/');
  // A stuck random number makes the shuffle predictable: Kha signs in, the others follow as DFK, Jonathan, Nafis, Banjo, BiteBeacon, Alex.
  await page.evaluate(() => { Math.random = () => 0; });
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await expect(page.getByTestId('toast')).toContainText('household of 7: Kha, DFK, Jonathan, Nafis, Banjo, BiteBeacon, Alex');
  await page.getByRole('button', { name: 'Allergies', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Kha', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Milk' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Peanuts' })).not.toBeChecked();
  await expect(page.getByRole('radio', { name: 'Capstone', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
