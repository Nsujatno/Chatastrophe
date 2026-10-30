import { expect, test } from '@playwright/test';

test('loads artwork, renders a running scene, and survives repeated resets', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  const stage = page.locator('#game-container');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toHaveAttribute('width', '1280');
  await expect(page.locator('canvas')).toHaveAttribute('height', '720');
  await expect(page.locator('#scene-status')).toHaveText('Yard ready · idle running');

  const initialFrame = await page.locator('canvas').screenshot();
  await expect.poll(async () => (await page.locator('canvas').screenshot()).equals(initialFrame)).toBe(false);

  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByRole('button', { name: 'Reset preview' }).click();
    await expect(page.locator('#scene-status')).toHaveText('Yard ready · idle running');
    await page.getByRole('button', { name: 'Pause idle' }).click();
    await expect(page.getByRole('button', { name: 'Resume idle' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#scene-status')).toHaveText('Yard ready · idle paused');
  }
  await page.getByLabel('Field notes').uncheck();
  await expect(page.getByLabel('Field notes')).not.toBeChecked();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByLabel('Field notes').check();
  await page.screenshot({ path: 'test-results/preview-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('keeps the logical resolution and aspect ratio across window sizes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#game-container')).toHaveAttribute('data-ready', 'true');
  for (const size of [{ width: 1920, height: 1080 }, { width: 900, height: 700 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await expect.poll(async () => {
      const canvas = await page.locator('canvas').boundingBox();
      const stage = await page.locator('#game-container').boundingBox();
      if (!canvas || !stage) return false;
      return Math.abs(canvas.width / canvas.height - 16 / 9) < 0.01
        && canvas.x >= stage.x - 1 && canvas.y >= stage.y - 1
        && canvas.x + canvas.width <= stage.x + stage.width + 1
        && canvas.y + canvas.height <= stage.y + stage.height + 1;
    }).toBe(true);
    await expect(page.locator('canvas')).toHaveAttribute('width', '1280');
    await expect(page.locator('canvas')).toHaveAttribute('height', '720');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.screenshot({ path: 'test-results/preview-portrait.png', fullPage: true });
});

test('honors reduced motion and allows opting into idle motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#scene-status')).toHaveText('Yard ready · idle paused');
  await page.getByRole('button', { name: 'Resume idle' }).click();
  await expect(page.locator('#scene-status')).toHaveText('Yard ready · idle running');
});

test('reports missing artwork instead of pretending the preview is ready', async ({ page }) => {
  await page.route('**/assets/skitter.png', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#load-status')).toContainText('Could not load the artwork (skitter)');
  await expect(page.locator('#game-container')).toHaveAttribute('data-ready', 'false');
  await expect(page.getByRole('button', { name: 'Pause idle' })).toBeDisabled();
});
