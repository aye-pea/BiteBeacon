import { expect, test } from '@playwright/test';

test('add a scanned product to the pantry, see expiry alerts, mark items used or thrown out and put one back', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();

  // Demo pantry is dated relative to today: one expired, one due tomorrow.
  const alert = page.getByTestId('pantry-alert');
  await expect(alert).toContainText('Expired: 1');
  await expect(alert).toContainText('Within 3 days: 1');
  await alert.click();
  await expect(page.getByRole('heading', { name: 'Pantry', exact: true })).toBeVisible();
  const oats = page.getByTestId('pantry-item-Simply Oat Crackers');
  await expect(oats).toContainText('Expired 2 days ago');
  await expect(oats).toContainText('Fictional demo result', { ignoreCase: true });
  await expect(page.getByTestId('pantry-item-Peanut Crunch Granola')).toContainText('Expires tomorrow');
  await page.screenshot({ path: 'artifacts/pantry-mobile.png', fullPage: true });

  // Swipe right marks used.
  const box = (await oats.boundingBox())!;
  await page.mouse.move(box.x + box.width * .15, box.y + box.height * .3);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width * (.15 + i * .08), box.y + box.height * .3);
  await page.mouse.up();
  await expect(page.getByTestId('toast')).toContainText('Simply Oat Crackers marked as used');
  await expect(oats).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Pantry', exact: true })).toBeVisible();

  // Buttons do the same without swiping.
  await page.getByRole('button', { name: 'Mark Peanut Crunch Granola as thrown out' }).click();
  await expect(page.getByTestId('pantry-item-Peanut Crunch Granola')).toHaveCount(0);
  await expect(page.getByTestId('pantry-alert')).toHaveCount(0);

  await page.getByRole('button', { name: 'Recent Scans', exact: true }).click();
  await expect(page.getByTestId('pantry-history-Simply Oat Crackers')).toContainText('Used');
  await expect(page.getByTestId('pantry-history-Peanut Crunch Granola')).toContainText('Thrown out');
  await page.getByRole('button', { name: 'Put Simply Oat Crackers back in the pantry' }).click();
  await expect(page.getByTestId('pantry-history-Simply Oat Crackers')).toHaveCount(0);

  // After a scan: Add to pantry? rejects an impossible date, then adds with a quick date.
  await page.getByRole('button', { name: 'Scan a Product', exact: true }).click();
  await page.getByRole('button', { name: 'Mystery Snack', exact: true }).click();
  const add = page.getByTestId('pantry-add');
  await expect(add.getByText('Add to pantry?')).toBeVisible();
  await add.getByLabel('Expiry date, year-month-day').fill('2026-02-30');
  await add.getByText('Add to pantry', { exact: true }).click();
  await expect(add.getByText('Enter a real date as YYYY-MM-DD, or choose No date.')).toBeVisible();
  await add.getByRole('radio', { name: 'In 2 weeks' }).click();
  await expect(add.getByText(/^Expires [A-Z]/)).toBeVisible();
  await add.getByText('Add to pantry', { exact: true }).click();
  await expect(page.getByTestId('toast')).toContainText('Mystery Snack added to your pantry');
  await expect(add.getByText('In your pantry: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Pantry', exact: true }).click();
  // Missing allergen data stays "not enough information" in the pantry, never an all-clear.
  await expect(page.getByTestId('pantry-item-Mystery Snack')).toContainText('Not enough information');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('evidence explains hidden allergen sources instead of repeating the allergen name', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Try Peanut Crunch Granola' }).click();
  // Narrow to Kha alone: untick Everyone (leaves Alex), tick Kha, untick Alex.
  await page.getByRole('checkbox', { name: 'Check for Everyone (8)' }).click();
  await page.getByRole('checkbox', { name: 'Check for Kha' }).click();
  await page.getByRole('checkbox', { name: 'Check for Alex' }).click();
  const why = page.getByTestId('result-evidence');
  await expect(why.getByText('"whey" comes from milk')).toBeVisible();
  await expect(why.getByText(/appears in the ingredients/)).toHaveCount(0);
  await expect(page.getByTestId('result-ingredients')).toContainText('whey (milk) powder');
});
