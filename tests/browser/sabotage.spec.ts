import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import type { ArenaScene } from '../../src/game/scenes/ArenaScene';

async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator('#game-container')).toHaveAttribute('data-ready', 'true');
  await page.locator('#sabotage-debug > summary').click();
}

async function loadPreset(page: Page, name: string) {
  if (!await page.locator('#sabotage-debug').evaluate((root: HTMLDetailsElement) => root.open)) await page.locator('#sabotage-debug > summary').click();
  await page.locator('#sabotage-debug').getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Use next wave', exact: true }).click();
}

async function state(page: Page) {
  return page.evaluate(() => {
    const s = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    return { phase: s.run.phase, wave: s.run.wave, health: s.run.health, scrap: s.run.scrap, now: s.sabotage.now,
      remaining: s.run.remainingMs, active: s.sabotage.active?.data.id ?? null, queued: s.sabotage.queued?.data.id ?? null,
      pending: s.sabotage.pendingCount, modifiers: s.sabotage.modifiers.size, listeners: s.sabotage.listenerCount, warnings: s.ruleWarnings.size,
      paused: s.paused, bodies: s.physics.world.bodies.size, x: s.player.x, y: s.player.y,
      enemies: (s.enemies.getChildren() as import('../../src/game/entities/Enemy').Enemy[]).map(e => ({ id: e.entityId, kind: e.kind, owner: e.owner, generation: e.generation, tags: [...e.tags], health: e.health, speed: e.speed, damage: e.contactDamage, size: e.sizeMultiplier, radius: e.body.halfWidth, reward: e.reward })) };
  });
}

test('edits custom JSON, previews errors safely, briefs the next wave and installs only at the boundary', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await open(page);
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await loadPreset(page, 'Glass Cannon');
  expect(await state(page)).toMatchObject({ active: null, queued: 'glass-cannon' });
  await page.locator('#rule-json').fill('{ nope');
  await page.getByRole('button', { name: 'Check rules' }).click();
  await expect(page.locator('#rule-feedback')).toContainText('Check the JSON');
  expect((await state(page)).queued).toBe('glass-cannon');
  const custom = { id: 'custom-mix', name: 'Scrapstorm', rules: [
    { id: 'quick', trigger: { type: 'wave_started' }, actions: [{ type: 'modify', target: { kind: 'player' }, stat: 'move_speed', multiplier: 1.2, durationMs: 'wave' }] },
    { id: 'big', trigger: { type: 'enemy_spawned' }, actions: [{ type: 'modify', target: { kind: 'event_entity' }, stat: 'size', multiplier: 1.2, durationMs: 'wave' }] },
  ] };
  await page.locator('#rule-json').fill(JSON.stringify(custom));
  await page.getByRole('button', { name: 'Use next wave', exact: true }).click();
  await expect(page.locator('#rule-feedback')).toContainText('Ready for wave 2');
  expect((await state(page)).active).toBeNull();
  await page.getByRole('button', { name: 'Finish this wave' }).click();
  await expect(page.locator('#panel-shop')).toBeVisible();
  await expect(page.locator('#shop-changes')).toContainText('Scrapstorm');
  await expect(page.locator('#shop-changes')).toContainText('you move 20% faster');
  const before = await state(page); await page.waitForTimeout(200);
  expect((await state(page)).remaining).toBe(before.remaining);
  await page.screenshot({ path: 'test-results/m2-briefing.png', fullPage: true });
  await page.getByRole('button', { name: 'Start wave 2' }).click();
  expect(await state(page)).toMatchObject({ active: 'custom-mix', queued: null, modifiers: 1 });
  await page.keyboard.down('d');
  await expect.poll(() => page.evaluate(() => (window.__game.scene.getScene('ArenaScene') as ArenaScene).player.body.velocity.x)).toBe(312);
  await page.keyboard.up('d');
  await expect(page.locator('#active-name')).toContainText('Scrapstorm');
  await page.getByRole('button', { name: 'Stop current changes' }).click();
  expect(await state(page)).toMatchObject({ active: null, modifiers: 0, pending: 0, warnings: 0, listeners: 0 });
  expect(errors).toEqual([]);
});

test('JSON typing accepts movement letters and arrow keys, pauses safely, and resumes deliberately', async ({ page }) => {
  await open(page); await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await page.locator('#rule-json').focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('wasd WASD');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.type('!');
  await expect(page.locator('#rule-json')).toHaveValue('wasd WAS!D');
  const paused = await state(page);
  await page.waitForTimeout(250);
  expect(await state(page)).toMatchObject({ x: paused.x, y: paused.y, remaining: paused.remaining, now: paused.now, paused: true });
  await page.getByRole('button', { name: 'Check rules' }).click();
  expect((await state(page)).paused).toBe(true);
  await page.getByRole('button', { name: 'Resume run' }).click();
  await page.keyboard.down('d');
  await expect.poll(async () => (await state(page)).x).toBeGreaterThan(paused.x + 10);
  await page.keyboard.up('d');
});

test('Heavy Metal scales real hauler hitboxes, preserves animation and clears back to baseline', async ({ page }) => {
  await open(page); await loadPreset(page, 'Heavy Metal');
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    s.spawnEnemy('hauler', s.player.x + 320, s.player.y + 70);
    s.spawnEnemy('skitter', s.player.x - 320, s.player.y - 70);
  });
  const actors = (await state(page)).enemies;
  expect(actors.find(e => e.kind === 'hauler')).toMatchObject({ size: 1.5, speed: 32.199999999999996, damage: 28, radius: 57 });
  expect(actors.find(e => e.kind === 'skitter')).toMatchObject({ size: 1, speed: 144, damage: 10, radius: 22 });
  await page.screenshot({ path: 'test-results/m2-heavy-metal.png', fullPage: true });
  await page.getByRole('button', { name: 'Stop current changes' }).click();
  expect((await state(page)).enemies.find(e => e.kind === 'hauler')).toMatchObject({ size: 1, speed: 46, damage: 20, radius: 38 });
});

test('warned explosions hurt both sides once, freeze on pause, and cannot survive wave expiry', async ({ page }) => {
  await open(page);
  const input = { id: 'blast-test', name: 'Blast test', rules: [{ id: 'blast', trigger: { type: 'wave_started' }, actions: [{ type: 'explode', at: { anchor: 'player' }, radius: 100, damage: 10 }] }] };
  await page.locator('#rule-json').fill(JSON.stringify(input));
  await page.getByRole('button', { name: 'Use next wave', exact: true }).click();
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    const enemy = s.spawnEnemy('hauler', s.player.x + 90, s.player.y)!;
    enemy.body.moves = false;
    Object.assign(s, { attackRemaining: 100_000, spawnRemaining: 100_000 });
  });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await state(page);
  await page.waitForTimeout(800);
  expect(await state(page)).toMatchObject({ health: 100, warnings: 1, now: paused.now, pending: 1 });
  await page.screenshot({ path: 'test-results/m2-blast-warning.png', fullPage: true });
  const canvas = await page.evaluate(() => new Promise<string>(resolve => window.__game.renderer.snapshot(result => resolve((result as HTMLImageElement).src))));
  writeFileSync('test-results/m2-blast-canvas.png', Buffer.from(canvas.split(',')[1], 'base64'));
  await page.getByRole('button', { name: 'Resume run' }).click();
  await expect.poll(async () => (await state(page)).health).toBe(90);
  expect((await state(page)).enemies.find(e => e.kind === 'hauler')?.health).toBe(62);
  expect((await state(page)).warnings).toBe(0);
  await loadPreset(page, 'Reactor Pulses');
  await page.getByRole('button', { name: 'Finish this wave' }).click();
  await expect(page.locator('#panel-shop')).toBeVisible();
  await page.getByRole('button', { name: 'Start wave 2' }).click();
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    s.sabotage.tick(5000);
  });
  expect((await state(page)).warnings).toBe(1);
  await page.getByRole('button', { name: 'Finish this wave' }).click();
  await expect(page.locator('#panel-shop')).toBeVisible();
  expect(await state(page)).toMatchObject({ active: null, pending: 0, warnings: 0, health: 100 });
});

test('Distress Signal telegraphs reduced-reward root units and manual clear removes only its actors', async ({ page }) => {
  await open(page); await loadPreset(page, 'Distress Signal');
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    Object.assign(s, { attackRemaining: 100_000, spawnRemaining: 100_000 });
    s.spawnEnemy('hover-drone', 70, 70);
    s.events.emit('player-damaged', { type: 'player_damaged', subject: { id: 'player', kind: 'player', generation: 0 }, position: { x: s.player.x, y: s.player.y }, runId: s.sabotage.runId, wave: 1, depth: 0 });
  });
  await expect.poll(async () => (await state(page)).warnings).toBe(2);
  await page.screenshot({ path: 'test-results/m2-reinforcement-warnings.png', fullPage: true });
  await expect.poll(async () => (await state(page)).enemies.filter(e => e.owner).length).toBe(2);
  for (const actor of (await state(page)).enemies.filter(e => e.owner)) expect(actor).toMatchObject({ generation: 0, health: 5, size: 0.7, reward: 1.5, tags: ['reinforcement'] });
  await page.getByRole('button', { name: 'Stop current changes' }).click();
  const clean = await state(page);
  expect(clean.enemies).toHaveLength(1); expect(clean.scrap).toBe(0);
  expect(clean.enemies[0].owner).toBeUndefined(); expect(clean.pending).toBe(0);
});

test('Panic Mode refreshes after real damage and expires without losing purchased movement', async ({ page }) => {
  await open(page); await loadPreset(page, 'Panic Mode');
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  const result = await page.evaluate(() => {
    const s = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    s.run.speed = 299;
    Object.assign(s, { attackRemaining: 100_000, spawnRemaining: 100_000 });
    const enemy = s.spawnEnemy('hover-drone', s.player.x, s.player.y)!;
    const hurt = () => {
      s.run.invulnerableUntil = 0;
      s.physics.overlap(s.player, enemy, () => s['contact'](enemy));
    };
    hurt(); s.sabotage.tick(1000); hurt();
    s['syncStats']();
    const speed = enemy.speed;
    const count = s.sabotage.modifiers.size;
    s.sabotage.tick(3001); s['syncStats'](); const refreshed = enemy.speed;
    s.sabotage.tick(1000); s['syncStats']();
    return { speed, count, refreshed, restored: enemy.speed, permanent: s.run.speed, health: s.run.health };
  });
  expect(result).toMatchObject({ speed: 111, count: 1, refreshed: 111, restored: 74, permanent: 299, health: 76 });
});

test('Chain Reaction splits once, pays reduced half-value on shutdown, and resets without leaks', async ({ page }) => {
  await open(page); await loadPreset(page, 'Chain Reaction');
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    Object.assign(s, { attackRemaining: 100_000, spawnRemaining: 100_000 });
    const original = s.sabotage['random']; s.sabotage['random'] = () => 0.2;
    try { const enemy = s.spawnEnemy('hover-drone', s.player.x + 200, s.player.y)!; s['damageEnemy'](enemy, 100, 0); }
    finally { s.sabotage['random'] = original; }
  });
  await expect.poll(async () => (await state(page)).enemies.filter(e => e.owner).length).toBeGreaterThan(0);
  const mini = (await state(page)).enemies.find(e => e.owner)!;
  expect(mini).toMatchObject({ generation: 1, health: 9, size: 0.6, reward: 1, tags: ['mini'] });
  await page.screenshot({ path: 'test-results/m2-mini.png', fullPage: true });
  const count = (await state(page)).enemies.filter(e => e.owner).length;
  await page.getByRole('button', { name: 'Finish this wave' }).click();
  await expect(page.locator('#panel-shop')).toBeVisible();
  expect(await state(page)).toMatchObject({ scrap: 4 + count * 0.5, active: null, warnings: 0, pending: 0, listeners: 0, modifiers: 0, enemies: [] });
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Restart run' }).click();
    await expect.poll(async () => (await state(page)).scrap).toBe(0);
    expect(await state(page)).toMatchObject({ active: null, queued: null, warnings: 0, listeners: 0, modifiers: 0, bodies: 1 });
    await expect(page.locator('#sabotage-debug')).toHaveCount(1);
  }
});

test('lethal damage clears an active ruleset, queued changes and pending arrivals before restart', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await open(page); await loadPreset(page, 'Distress Signal');
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await loadPreset(page, 'Glass Cannon');
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    const enemy = s.spawnEnemy('hover-drone', s.player.x, s.player.y)!;
    s['contact'](enemy);
    s.run.invulnerableUntil = 0; s.run.health = 1;
    s['contact'](enemy);
  });
  await expect(page.locator('#panel-lost')).toBeVisible();
  expect(await state(page)).toMatchObject({ active: null, queued: null, warnings: 0, pending: 0, listeners: 0, health: 0 });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(async () => (await state(page)).health).toBe(100);
  expect(await state(page)).toMatchObject({ active: null, queued: null, modifiers: 0, listeners: 0, bodies: 1 });
  await loadPreset(page, 'Glass Cannon');
  await page.getByRole('button', { name: 'Finish this wave' }).click();
  await expect(page.locator('#panel-shop')).toBeVisible();
  await page.getByRole('button', { name: 'Start wave 2' }).click();
  expect((await state(page)).active).toBe('glass-cannon');
  await page.getByRole('button', { name: 'Restart run' }).click();
  await page.waitForFunction(() => {
    const s = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    return s.physics.world && s.run.wave === 0 && document.getElementById('game-container')!.dataset.ready === 'true';
  });
  await expect.poll(async () => (await state(page)).active).toBeNull();
  expect((await state(page)).modifiers).toBe(0);
  expect(errors).toEqual([]);
});
