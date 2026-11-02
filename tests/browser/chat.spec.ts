import { expect, test, type Page } from '@playwright/test';
import type { ArenaScene } from '../../src/game/scenes/ArenaScene';

async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator('#game-container')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('heading', { name: 'Twitch chat', exact: true })).toBeVisible();
  await expect(page.locator('#chat-panel')).toHaveAttribute('data-connected', 'true');
  await page.getByRole('button', { name: 'Use local test chat', exact: true }).click();
  await expect(page.locator('#chat-status')).toHaveText('Local test chat — not Twitch');
}
async function start(page: Page) { await page.getByRole('button', { name: 'Start run', exact: true }).click(); }
async function suggest(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Test chat message', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send test message', exact: true }).click();
}
async function rules(page: Page) { return page.evaluate(() => {
  const scene = window.__game.scene.getScene('ArenaScene') as ArenaScene;
  return { active: scene.sabotage.active?.data.id ?? null, queued: scene.sabotage.queued?.data.id ?? null, modifiers: scene.sabotage.modifiers.size };
}); }

test('collects plain suggestions for the next wave without changing the current game, then resets cleanly', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await open(page); await start(page);
  await suggest(page, 'Make defeated robots explode');
  await expect(page.locator('#chat-activity')).toHaveText('Suggestion collected for the next wave.');
  await expect(page.locator('#chat-suggestions')).toContainText('Suggestions for wave 2');
  await expect(page.locator('#chat-suggestions')).toContainText('1 idea');
  await expect(page.locator('#chat-messages')).toContainText('Test · TestViewer: Make defeated robots explode');
  expect(await rules(page)).toEqual({ active: null, queued: null, modifiers: 0 });
  await page.evaluate(() => (window.__game.scene.getScene('ArenaScene') as ArenaScene).advanceWave());
  await expect(page.locator('#panel-shop')).toBeVisible();
  await expect(page.locator('#chat-suggestions')).toContainText('Collection closed');
  await page.getByRole('button', { name: 'Start wave 2', exact: true }).click();
  await expect(page.locator('#chat-messages')).toContainText('Make defeated robots explode');
  expect(await rules(page)).toEqual({ active: null, queued: null, modifiers: 0 });
  await page.screenshot({ path: 'test-results/m4-suggestions.png', fullPage: true });
  await page.getByRole('button', { name: 'Restart run', exact: true }).click();
  await expect(page.locator('#chat-suggestions')).toBeEmpty();
  await expect(page.locator('#chat-messages')).toContainText('Make defeated robots explode');
  expect(errors).toEqual([]);
});

test('typing ideas leaves movement keys released and treats viewer text as plain text', async ({ page }) => {
  await open(page); await start(page);
  const input = page.getByRole('textbox', { name: 'Test chat message', exact: true });
  await input.focus(); await page.keyboard.type('wasd WASD <img src=x onerror=alert(1)>');
  await expect(input).toHaveValue('wasd WASD <img src=x onerror=alert(1)>');
  expect(await page.evaluate(() => {
    const scene = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    return { vx: scene.player.body.velocity.x, vy: scene.player.body.velocity.y, paused: scene.paused };
  })).toEqual({ vx: 0, vy: 0, paused: false });
  await page.getByRole('button', { name: 'Send test message', exact: true }).click();
  await expect(page.locator('#chat-messages')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#chat-messages img')).toHaveCount(0);
  await page.keyboard.down('d');
  await expect.poll(() => page.evaluate(() => (window.__game.scene.getScene('ArenaScene') as ArenaScene).player.body.velocity.x)).toBeGreaterThan(0);
  await page.keyboard.up('d');
});

test('connecting Twitch preserves the existing game socket', async ({ page }) => {
  let sessions = 0;
  let sockets = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/session') sessions++; });
  page.on('websocket', socket => { if (new URL(socket.url()).pathname === '/socket.io/') sockets++; });
  await page.addInitScript(() => {
    window.open = () => ({ opener: null, close() {}, location: { replace(url: string) { document.body.dataset.authorizationUrl = url; } } }) as unknown as Window;
  });
  const authorizationUrl = 'https://id.twitch.tv/oauth2/authorize?client_id=fixture-client';
  await page.route('**/api/twitch/connect', route => route.fulfill({ json: { url: authorizationUrl } }));
  await open(page);
  await page.getByRole('button', { name: 'Connect Twitch', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-authorization-url', authorizationUrl);
  await expect(page.locator('#chat-panel')).toHaveAttribute('data-connected', 'true');
  expect(sessions).toBe(1);
  expect(sockets).toBe(1);
});

test('a mismatched game address explains how to connect without opening a rejected socket', async ({ page }) => {
  let sockets = 0;
  let authorizations = 0;
  page.on('websocket', socket => { if (new URL(socket.url()).pathname === '/socket.io/') sockets++; });
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/twitch/connect') authorizations++; });
  await page.addInitScript(() => {
    window.open = () => ({ opener: null, close() { document.body.dataset.authorizationClosed = 'true'; } }) as unknown as Window;
  });
  await page.route('**/api/session', async route => {
    const response = await route.fetch();
    const session = await response.json() as Record<string, unknown>;
    await route.fulfill({ response, json: { ...session, origin: 'http://localhost:4173' } });
  });
  await page.goto('/');
  await expect(page.locator('#game-container')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#chat-status')).toHaveText('Open http://localhost:4173 to connect chat.');
  await page.getByRole('button', { name: 'Connect Twitch', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-authorization-closed', 'true');
  await expect(page.locator('#chat-status')).toHaveText('Open http://localhost:4173 to connect chat.');
  expect(sockets).toBe(0);
  expect(authorizations).toBe(0);
  await start(page);
  await expect(page.locator('#game-container')).toHaveAttribute('data-phase', 'playing');
});

test('isolates two browser sessions and keeps standalone gameplay available when the gateway is absent', async ({ page, browser }) => {
  await open(page); await start(page);
  const context = await browser.newContext(); const other = await context.newPage();
  try {
    await open(other); await start(other);
    await suggest(page, 'Give robots tiny reinforcements');
    await expect(page.locator('#chat-messages')).toContainText('Give robots tiny reinforcements');
    await expect(other.locator('#chat-messages')).toBeEmpty();
    await expect(other.locator('#chat-suggestions')).toBeEmpty();
  } finally { await context.close(); }
  await page.route('**/api/**', route => route.abort());
  await page.reload();
  await expect(page.locator('#game-container')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#chat-status')).toHaveText('Chat server unavailable. You can play without it.');
  await start(page);
  await expect(page.locator('#game-container')).toHaveAttribute('data-phase', 'playing');
});

test('shows messages before a run and between waves, restores history, and clears it on disconnect', async ({ page }) => {
  await open(page);
  await expect(page.locator('#chat-empty')).toBeVisible();
  await suggest(page, 'hello before the run');
  await expect(page.locator('#chat-messages')).toContainText('hello before the run');
  await expect(page.locator('#chat-empty')).toBeHidden();
  await expect(page.locator('#chat-suggestions')).toBeEmpty();
  await start(page);
  await page.evaluate(() => (window.__game.scene.getScene('ArenaScene') as ArenaScene).advanceWave());
  await expect(page.locator('#panel-shop')).toBeVisible();
  await suggest(page, '!hello between waves');
  await expect(page.locator('#chat-messages')).toContainText('!hello between waves');
  await expect(page.locator('#chat-suggestions')).toBeEmpty();
  await page.reload();
  await expect(page.locator('#chat-panel')).toHaveAttribute('data-connected', 'true');
  await expect(page.locator('#chat-messages li')).toHaveCount(2);
  await expect(page.locator('#chat-status')).toHaveText('Local test chat — not Twitch');
  await page.getByRole('button', { name: 'Disconnect chat', exact: true }).click();
  await expect(page.locator('#chat-messages')).toBeEmpty();
  await expect(page.locator('#chat-empty')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect Twitch', exact: true })).toBeVisible();
});

test('keeps chat beside the arena on desktop and visible below it on narrow screens', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#game-container')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('button', { name: 'Connect Twitch', exact: true })).toBeVisible();
  const desktop = await page.evaluate(() => ({
    arena: document.querySelector('.arena')!.getBoundingClientRect().toJSON(),
    chat: document.getElementById('chat-panel')!.getBoundingClientRect().toJSON(),
  }));
  expect(desktop.chat.left).toBeGreaterThan(desktop.arena.right);
  expect(desktop.chat.top).toBe(desktop.arena.top);
  expect(desktop.chat.height).toBeCloseTo(desktop.arena.height, 0);
  await page.screenshot({ path: 'test-results/chat-sidebar-desktop.png', fullPage: true });
  for (const width of [900, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const narrow = await page.evaluate(() => ({
      arena: document.querySelector('.arena')!.getBoundingClientRect().toJSON(),
      chat: document.getElementById('chat-panel')!.getBoundingClientRect().toJSON(),
      pageWidth: document.documentElement.scrollWidth,
    }));
    expect(narrow.chat.top).toBeGreaterThanOrEqual(narrow.arena.bottom);
    expect(narrow.chat.width).toBeCloseTo(narrow.arena.width, 0);
    expect(narrow.pageWidth).toBeLessThanOrEqual(width);
  }
  await page.screenshot({ path: 'test-results/chat-sidebar-mobile.png', fullPage: true });
});

test('bounds the visible feed and preserves reading position as new messages arrive', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const { csrf } = await (await fetch('/api/session')).json() as { csrf: string };
    for (let index = 0; index < 105; index++) {
      await fetch('/api/mock/message', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ viewer: 'Reader', text: `Message ${index}` }) });
    }
  });
  const messages = page.locator('#chat-messages li');
  const feed = page.getByRole('region', { name: 'Chat history', exact: true });
  await expect(messages).toHaveCount(100);
  await expect(messages.first()).toHaveText('Test · Reader: Message 5');
  await expect(messages.last()).toHaveText('Test · Reader: Message 104');
  await expect.poll(() => feed.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(2);
  await feed.evaluate(element => { element.scrollTop = 0; });
  await suggest(page, 'One more message while reading');
  await expect(messages.last()).toContainText('One more message while reading');
  expect(await feed.evaluate(element => element.scrollTop)).toBeLessThan(24);
  await expect(messages).toHaveCount(100);
  await page.screenshot({ path: 'test-results/chat-sidebar-history.png', fullPage: true });
});
