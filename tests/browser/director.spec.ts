import { expect, test, type Page } from '@playwright/test';
import type { ArenaScene } from '../../src/game/scenes/ArenaScene';

test.setTimeout(75_000);

async function message(page: Page, text: string, viewer = 'TestViewer') {
  await page.getByRole('textbox', { name: 'Test viewer', exact: true }).fill(viewer);
  await page.getByRole('textbox', { name: 'Test chat message', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send test message', exact: true }).click();
}
async function openVote(page: Page) {
  await page.goto('/');
  await expect(page.locator('#game-container')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#chat-panel')).toHaveAttribute('data-connected', 'true');
  await page.getByRole('button', { name: 'Use local test chat', exact: true }).click();
  await expect(page.locator('#chat-status')).toContainText('Local test chat');
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await message(page, '[director fixture] Make shooting faster, robot deaths explode, and robots run faster');
  await expect(page.locator('#director-status')).toContainText('1 message collected');
  await page.evaluate(() => (window.__game.scene.getScene('ArenaScene') as ArenaScene).advanceWave());
  await expect(page.locator('#director-overlay')).toHaveAttribute('data-state', 'voting');
  await expect(page.getByRole('heading', { name: /Chat decides/ })).toBeVisible();
}

test('shows round ideas, counts live chat votes, installs the winning rule for one wave and cleans up', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openVote(page);
  await expect(page.locator('.director-option')).toHaveCount(3);
  await expect(page.locator('.director-option').first().locator('li')).toHaveText(['Wave starts → you: 43% faster shooting']);
  await expect(page.locator('#director-overlay')).toContainText('LOCAL TEST CHAT');
  await expect(page.locator('#next-wave')).toBeDisabled();
  await message(page, '1', 'alice'); await message(page, '2', 'alice');
  await message(page, '!vote 1', 'bob'); await message(page, '3', 'carol');
  await expect(page.locator('.director-votes').nth(0)).toHaveText('2 votes');
  await expect(page.locator('.director-votes').nth(1)).toHaveText('0 votes');
  await expect(page.locator('.director-votes').nth(2)).toHaveText('1 vote');
  await page.screenshot({ path: 'test-results/director-voting-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/director-voting-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole('heading', { name: 'Scrapstorm wins!', exact: true })).toBeVisible({ timeout: 35_000 });
  await expect(page.locator('#next-wave')).toBeEnabled();
  await page.getByRole('button', { name: 'Continue to upgrades', exact: true }).click();
  await expect(page.locator('#shop-changes')).toContainText('Scrapstorm');
  await page.getByRole('button', { name: 'Start wave 2', exact: true }).click();
  await expect(page.locator('#active-name')).toContainText('Scrapstorm');
  expect(await page.evaluate(() => (window.__game.scene.getScene('ArenaScene') as ArenaScene).sabotage.modifiers.size)).toBe(1);
  await page.evaluate(() => (window.__game.scene.getScene('ArenaScene') as ArenaScene).advanceWave());
  await expect(page.locator('#panel-shop')).toBeVisible();
  await expect(page.locator('#active-changes')).toBeHidden();
  expect(await page.evaluate(() => (window.__game.scene.getScene('ArenaScene') as ArenaScene).sabotage.modifiers.size)).toBe(0);
  expect(errors).toEqual([]);
});

test('lets the streamer skip voting and restart without stale rule activation', async ({ page }) => {
  await openVote(page);
  await page.getByRole('button', { name: 'Skip vote', exact: true }).click();
  await expect(page.locator('#director-overlay')).toBeHidden();
  await expect(page.locator('#next-wave')).toBeEnabled();
  await page.getByRole('button', { name: 'Start wave 2', exact: true }).click();
  await expect(page.locator('#active-changes')).toBeHidden();
  await page.getByRole('button', { name: 'Restart run', exact: true }).click();
  await expect(page.locator('#wave-value')).toHaveText('1');
  expect(await page.evaluate(() => {
    const scene = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    return { queued: scene.sabotage.queued, active: scene.sabotage.active, held: scene.directorPending };
  })).toEqual({ queued: undefined, active: undefined, held: false });
});
