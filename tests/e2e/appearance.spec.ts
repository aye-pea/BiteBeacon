import { expect, test } from '@playwright/test';

// The app follows the device appearance; there is no in-app switch.
for (const [scheme, background] of [['light', 'rgb(242, 244, 239)'], ['dark', 'rgb(14, 19, 17)']] as const) {
  test(`${scheme} appearance follows the device setting`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore employer demo' }).click();
    await page.getByRole('button', { name: 'Try Peanut crunch granola' }).click();
    await expect(page.getByTestId('product-result')).toBeVisible();
    const canvas = await page.getByTestId('page-scroll').evaluate(el => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const bg = getComputedStyle(node).backgroundColor;
        if (bg !== 'rgba(0, 0, 0, 0)') return bg;
      }
      return '';
    });
    expect(canvas).toBe(background);
    expect(errors).toEqual([]);
  });
}
