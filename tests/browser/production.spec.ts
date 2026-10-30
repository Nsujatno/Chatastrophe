import { expect, test } from '@playwright/test';

test('production plays standalone without test controls, source attribution or the game bridge', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#game-container')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#sabotage-debug')).toHaveCount(0);
  expect(await page.evaluate(() => '__game' in window)).toBe(false);
  await expect(page.getByText('Test changes', { exact: false })).toHaveCount(0);
  await expect(page.locator('#ready-changes')).toBeHidden();
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await expect(page.locator('#game-container')).toHaveAttribute('data-phase', 'playing');
  await expect(page.locator('#wave-value')).toHaveText('1');
  await expect(page.locator('#time-value')).not.toHaveText('0:30');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const timer = await page.locator('#time-value').textContent();
  await page.waitForTimeout(200);
  await expect(page.locator('#time-value')).toHaveText(timer!);
  await page.getByRole('button', { name: 'Resume run' }).click();
  await expect(page.locator('#active-changes')).toBeHidden();
  await page.screenshot({ path: 'test-results/m2-production.png', fullPage: true });
  expect(errors).toEqual([]);
});
