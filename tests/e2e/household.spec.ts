import { expect, test } from '@playwright/test';

test('one scan shows a result for each household member', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await expect(page.getByTestId('toast')).toContainText('household of 3');
  await page.getByRole('button', { name: 'Try Peanut crunch granola' }).click();
  await expect(page.getByTestId('household-summary')).toContainText('2 of 3 people have an allergen signal');
  await expect(page.getByTestId('person-result-Alex')).toContainText('Allergen signal found: Peanuts');
  await expect(page.getByTestId('person-result-Kha')).toContainText('Allergen signal found: Milk');
  await expect(page.getByTestId('person-result-DFK')).toContainText('No selected allergens found');
  await expect(page.getByTestId('person-result-DFK')).toContainText('Not a safe-to-eat guarantee');
  await expect(page.getByRole('radio', { name: 'Check for Everyone (3)' })).toBeChecked();
  await expect(page.getByText(/Checked against 3 household profiles/)).toBeVisible();
  await page.getByTestId('product-result').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/household-result-mobile.png', fullPage: true });

  // Switching to one person shows the single-person result and only their highlighted words.
  await page.getByRole('radio', { name: 'Check for DFK' }).click();
  await expect(page.getByTestId('household-summary')).toHaveCount(0);
  await expect(page.getByText('No selected allergens found', { exact: true })).toBeVisible();
  await expect(page.getByLabel(/matches/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('settings add, edit and remove people and set who results show by default', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText('3 of 9 people')).toBeVisible();
  await page.screenshot({ path: 'artifacts/settings-mobile.png', fullPage: true });

  // Validation keeps the form open with an inline message.
  await page.getByRole('button', { name: 'Add a person' }).click();
  await page.getByRole('button', { name: 'Add to household' }).click();
  await expect(page.getByTestId('settings-feedback')).toContainText('Enter a name of 1 to 40 characters.');
  await page.getByLabel("Person's name").fill('  Sam  ');
  await page.getByRole('button', { name: 'Add to household' }).click();
  await expect(page.getByTestId('settings-feedback')).toContainText('Choose at least one allergy for Sam.');
  await page.getByRole('checkbox', { name: 'Fish for this person', exact: true }).click();
  await page.getByRole('button', { name: 'Add to household' }).click();
  await expect(page.getByTestId('member-form')).toHaveCount(0);
  await expect(page.getByText('4 of 9 people')).toBeVisible();

  // Edit Kha: drop milk, add soy.
  await page.getByRole('button', { name: 'Edit Kha' }).click();
  await page.getByRole('checkbox', { name: 'Milk for this person', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Soy for this person', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Eggs · Soy', { exact: true })).toBeVisible();

  // Rename the account holder.
  await page.getByLabel('Your name').fill('Alex P');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('button', { name: 'Save name' })).toHaveCount(0);

  // Default to Sam, then check a product: only Sam is checked.
  await page.getByRole('radio', { name: 'Default: Sam' }).click();
  await expect(page.getByRole('radio', { name: 'Default: Sam' })).toBeChecked();
  await page.getByRole('button', { name: 'Scan a Product', exact: true }).click();
  await page.getByRole('button', { name: 'Simply oat crackers', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Check for Sam' })).toBeChecked();
  await expect(page.getByText('Checked against Sam’s saved profile: Fish.')).toBeVisible();

  // Removing the default person falls back to the account holder.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Sam' }).click();
  await expect(page.getByText(/Results will show you by default instead/)).toBeVisible();
  await page.getByRole('button', { name: 'Remove Sam' }).last().click();
  await expect(page.getByText('3 of 9 people')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Default: Alex P' })).toBeChecked();
  expect(errors).toEqual([]);
});
