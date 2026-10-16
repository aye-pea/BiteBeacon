import { expect, test } from '@playwright/test';

// These flows start from the sample cards on Home, which phones hide until Settings turns Home on.

test('one scan shows a result for each household member', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByTestId('brand-home').click(); // phones open on Scan; the logo goes Home
  await expect(page.getByTestId('toast')).toContainText('household of 8');
  await page.getByRole('button', { name: 'Try Peanut Crunch Granola' }).click();
  await expect(page.getByTestId('household-summary')).toContainText('4 of 8 people have an allergen signal');
  await expect(page.getByTestId('person-result-Alex')).toContainText('Allergen signal found: Peanuts');
  await expect(page.getByTestId('person-result-Kha')).toContainText('Allergen signal found: Milk');
  await expect(page.getByTestId('person-result-DFK')).toContainText('No selected allergens found');
  await expect(page.getByTestId('person-result-DFK')).toContainText('Not a safe-to-eat guarantee');
  await expect(page.getByTestId('person-result-Nafis')).toContainText('Allergen signal found: Gluten');
  await expect(page.getByTestId('person-result-BiteBeacon')).toContainText('Allergen signal found: Peanuts');
  for (const name of ['Jonathan', 'Banjo', 'Capstone'])
    await expect(page.getByTestId(`person-result-${name}`)).toContainText('No selected allergens found');
  await expect(page.getByRole('checkbox', { name: 'Check for Everyone (8)' })).toBeChecked();
  await expect(page.getByText(/Checked against 8 household profiles/)).toBeVisible();
  await page.getByTestId('product-result').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/household-result-mobile.png', fullPage: true });

  // Any combination: untick Everyone (leaves Alex), tick DFK, and the result covers Alex and DFK only.
  await page.getByRole('checkbox', { name: 'Check for Everyone (8)' }).click();
  await page.getByRole('checkbox', { name: 'Check for DFK' }).click();
  await expect(page.getByRole('checkbox', { name: 'Check for Everyone (8)' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Check for Alex' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Check for DFK' })).toBeChecked();
  await expect(page.getByTestId('person-result-Kha')).toHaveCount(0);
  await expect(page.getByText(/Checked against 2 household profiles: Alex, DFK/)).toBeVisible();

  // Down to one person shows the single-person result and only their highlighted words.
  await page.getByRole('checkbox', { name: 'Check for Alex' }).click();
  await expect(page.getByTestId('household-summary')).toHaveCount(0);
  await expect(page.getByText('No selected allergens found', { exact: true })).toBeVisible();
  await expect(page.getByLabel(/matches/)).toHaveCount(0);

  // The last person can't be unticked.
  await page.getByRole('checkbox', { name: 'Check for DFK' }).click();
  await expect(page.getByRole('checkbox', { name: 'Check for DFK' })).toBeChecked();
  await expect(page.getByTestId('toast')).toContainText('Keep at least one person selected.');
  expect(errors).toEqual([]);
});

test('settings add, edit and remove people and set who results show by default', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByTestId('brand-home').click(); // phones open on Scan; the logo goes Home
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText('8 of 9 people')).toBeVisible();
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
  await expect(page.getByText('9 of 9 people')).toBeVisible();

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

  // Default to any combination: Kha and Sam. Unticking Everyone leaves just the account holder first.
  const showFor = page.getByTestId('show-for-settings');
  await showFor.getByRole('checkbox', { name: 'Default: Everyone (9)' }).click();
  await expect(showFor.getByRole('checkbox', { name: 'Default: Alex P' })).toBeChecked();
  await expect(showFor.getByRole('checkbox', { name: 'Default: Kha' })).not.toBeChecked();
  await showFor.getByRole('checkbox', { name: 'Default: Kha' }).click();
  await expect(showFor.getByRole('checkbox', { name: 'Default: Kha' })).toBeChecked();
  await showFor.getByRole('checkbox', { name: 'Default: Sam' }).click();
  await expect(showFor.getByRole('checkbox', { name: 'Default: Sam' })).toBeChecked();
  await showFor.getByRole('checkbox', { name: 'Default: Alex P' }).click();
  await expect(page.getByTestId('toast')).toContainText('Results now show Kha, Sam by default');
  for (const [name, on] of [['Alex P', false], ['Kha', true], ['DFK', false], ['Sam', true]] as const)
    await expect(showFor.getByRole('checkbox', { name: `Default: ${name}` })).toBeChecked({ checked: on });
  await page.getByRole('button', { name: 'Scan a Product', exact: true }).click();
  await page.getByRole('button', { name: 'Simply Oat Crackers', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Check for Kha' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Check for Sam' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Check for Alex P' })).not.toBeChecked();
  await expect(page.getByText(/Checked against 2 household profiles: Kha, Sam/)).toBeVisible();

  // Removing one of several default people keeps the rest.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Sam' }).click();
  await expect(page.getByText(/Results will show you by default instead/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove Sam' }).last().click();
  await expect(page.getByText('8 of 9 people')).toBeVisible();
  await expect(showFor.getByRole('checkbox', { name: 'Default: Kha' })).toBeChecked();
  await expect(showFor.getByRole('checkbox', { name: 'Default: Alex P' })).not.toBeChecked();

  // Removing the only default person falls back to the account holder.
  await page.getByRole('button', { name: 'Remove Kha' }).click();
  await expect(page.getByText(/Results will show you by default instead/)).toBeVisible();
  await page.getByRole('button', { name: 'Remove Kha' }).last().click();
  await expect(page.getByText('7 of 9 people')).toBeVisible();
  await expect(showFor.getByRole('checkbox', { name: 'Default: Alex P' })).toBeChecked();
  expect(errors).toEqual([]);
});

test('the Allergies page switches between household members and saves each list', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByTestId('brand-home').click(); // phones open on Scan; the logo goes Home
  await page.getByRole('button', { name: 'Allergies', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Allergies', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Alex', exact: true })).toBeChecked();
  for (const name of ['Kha', 'DFK', 'Jonathan', 'Nafis', 'Banjo', 'BiteBeacon', 'Capstone'])
    await expect(page.getByRole('radio', { name, exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Peanuts' })).toBeChecked();

  await page.getByRole('radio', { name: 'Kha', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Milk' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Peanuts' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Soy' }).click();
  await page.getByRole('button', { name: 'Save Kha’s allergies' }).click();
  await expect(page.getByTestId('profile-save-feedback')).toContainText('Kha updated');

  // Your own list is untouched, and Settings shows Kha's new list.
  await page.getByRole('radio', { name: 'Alex', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Soy' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('Milk · Eggs · Soy')).toBeVisible();
  // Leaving the page brings it back to your own list.
  await page.getByRole('button', { name: 'Allergies', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Alex', exact: true })).toBeChecked();
  expect(errors).toEqual([]);
});

test('phone home and scan cards fit their content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore employer demo' }).click();
  await page.getByTestId('brand-home').click(); // phones open on Scan; the logo goes Home
  // Each card must be at least as tall as its last line of content (nothing clipped or spilling out).
  const fits = async (inner: string) => page.getByText(inner, { exact: false }).first().evaluate(el => {
    let card = el.parentElement!; while (card && getComputedStyle(card).borderTopLeftRadius !== '22px') card = card.parentElement!;
    return el.getBoundingClientRect().bottom <= card.getBoundingClientRect().bottom;
  });
  expect(await fits('Household: Kha, DFK')).toBe(true);
  await page.getByRole('button', { name: 'Scan a Product', exact: true }).click();
  expect(await fits('Manufacturer-submitted USDA FoodData Central records')).toBe(true);
});
