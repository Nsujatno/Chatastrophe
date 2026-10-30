import { expect, test } from '@playwright/test';
import type { ArenaScene } from '../../src/game/scenes/ArenaScene';
import { PRESETS } from '../../src/game/rules/presets';

test('Distress Signal arrivals stay on their markers through the first physics frame', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#game-container')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(preset => (window.__game.scene.getScene('ArenaScene') as ArenaScene).sabotage.queue(preset), PRESETS[4]);
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  const result = await page.evaluate(() => {
    const game = window.__game;
    const s = game.scene.getScene('ArenaScene') as ArenaScene;
    game.loop.stop();
    Object.assign(s, { spawnRemaining: 100_000, attackRemaining: 100_000 });
    let seed = 123;
    s.sabotage['random'] = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
    s['emitGameEvent']('player_damaged', s['playerSnapshot']());
    const markers = s.sabotage.inspectPending().map(p => ({ x: p.x, y: p.y }));
    s.player.body.reset(markers[0].x, markers[0].y);
    s.events.once('update', () => s.sabotage.tick(750));
    const now = performance.now();
    game.headlessStep(now, 1000 / 60);
    const spawned = (s.enemies.getChildren() as import('../../src/game/entities/Enemy').Enemy[]).filter(e => e.owner);
    const first = spawned.map(e => ({ x: e.x, y: e.y, bodyX: e.body.center.x, bodyY: e.body.center.y }));
    game.headlessStep(now + 1000 / 60, 1000 / 60);
    return { markers, first, second: spawned.map(e => ({ x: e.x, y: e.y })) };
  });
  expect(result.markers).toHaveLength(2);
  expect(result.first).toHaveLength(2);
  for (let i = 0; i < result.markers.length; i++) {
    expect(result.first[i].x).toBeCloseTo(result.markers[i].x);
    expect(result.first[i].y).toBeCloseTo(result.markers[i].y);
    // Arcade rounds scaled circle sizes to pixels; the sprite stays exactly on the marker.
    expect(Math.abs(result.first[i].bodyX - result.markers[i].x)).toBeLessThan(1);
    expect(Math.abs(result.first[i].bodyY - result.markers[i].y)).toBeLessThan(1);
    expect(Math.hypot(result.second[i].x - result.first[i].x, result.second[i].y - result.first[i].y)).toBeLessThan(4);
  }
});

test('enemies separate from one another while the player can still move through them', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#game-container')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  const result = await page.evaluate(() => {
    const game = window.__game;
    const s = game.scene.getScene('ArenaScene') as ArenaScene;
    game.loop.stop();
    Object.assign(s, { spawnRemaining: 100_000, attackRemaining: 100_000 });
    s.player.body.reset(800, 450);
    const a = s.spawnEnemy('hover-drone', 1000, 440)!;
    const b = s.spawnEnemy('hover-drone', 1000, 460)!;
    let time = performance.now();
    for (let i = 0; i < 90; i++) { time += 1000 / 60; game.headlessStep(time, 1000 / 60); }
    const separation = Math.hypot(a.body.center.x - b.body.center.x, a.body.center.y - b.body.center.y);
    const minimum = a.body.halfWidth + b.body.halfWidth;
    s.player.body.reset(a.x, a.y);
    const origin = s.player.x;
    s.input.keyboard!.keys[68].isDown = true;
    for (let i = 0; i < 12; i++) { time += 1000 / 60; game.headlessStep(time, 1000 / 60); }
    return { separation, minimum, moved: s.player.x - origin, health: s.run.health };
  });
  expect(result.separation).toBeGreaterThanOrEqual(result.minimum - 2);
  expect(result.moved).toBeGreaterThan(40);
  expect(result.health).toBeLessThan(100);
});

test('fullscreen keeps the game, HUD and controls visible, then restores the normal layout', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#game-container')).toHaveAttribute('data-ready', 'true');
  const normal = await page.locator('canvas').boundingBox();
  const fullscreen = page.locator('#fullscreen');
  await expect(fullscreen).toHaveText('');
  await expect(fullscreen.locator('.icon-default')).toBeVisible();
  await expect(fullscreen.locator('.icon-active')).toBeHidden();
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('game-shell');
  await expect(page.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible();
  await expect(fullscreen).toHaveAttribute('aria-pressed', 'true');
  await expect(fullscreen.locator('.icon-active')).toBeVisible();
  await expect(fullscreen.locator('.icon-default')).toBeHidden();
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await expect(page.locator('#hud')).toBeVisible();
  const bounds = await page.evaluate(() => {
    const rect = (selector: string) => {
      const box = document.querySelector(selector)!.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height };
    };
    return { shell: rect('#game-shell'), stage: rect('.stage'), canvas: rect('canvas'), controls: rect('.game-controls'), width: innerWidth, height: innerHeight };
  });
  expect(bounds.shell.width).toBe(bounds.width);
  expect(bounds.shell.height).toBe(bounds.height);
  expect(bounds.canvas.width / bounds.canvas.height).toBeCloseTo(16 / 9, 2);
  expect(bounds.canvas.bottom).toBeLessThanOrEqual(bounds.stage.bottom + 1);
  expect(bounds.canvas.top).toBeGreaterThanOrEqual(bounds.stage.top - 1);
  expect(bounds.controls.bottom).toBeLessThanOrEqual(bounds.height);
  expect(bounds.canvas.width).toBeGreaterThan(normal!.width);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('#panel-paused')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#pause .icon-active')).toBeVisible();
  await expect(page.locator('#pause .icon-default')).toBeHidden();
  await page.screenshot({ path: 'test-results/fullscreen.png' });
  await page.getByRole('button', { name: 'Exit fullscreen' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toBeVisible();
  await expect(fullscreen.locator('.icon-default')).toBeVisible();
  await expect(fullscreen.locator('.icon-active')).toBeHidden();
  await expect.poll(async () => Math.round((await page.locator('canvas').boundingBox())!.width)).toBe(Math.round(normal!.width));
  expect(errors).toEqual([]);
});

test('keeps the HUD on the side and space between upgrades and the next-wave button', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#game-container')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await page.evaluate(() => window.__game.loop.stop());
  await expect(page.locator('#health-value')).toHaveText('100 / 100');
  await expect(page.locator('.scrap-icon img')).toBeVisible();

  for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.__game.scale.refresh());
    const bounds = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON() as { top: number; right: number; bottom: number; left: number; width: number };
      return { hud: rect('#hud'), canvas: rect('canvas'), wave: rect('.wave-stat'), health: rect('.health-stat'), timer: rect('#time-value'), scrap: rect('#scrap-value'), kills: rect('#kills-value') };
    });
    expect(bounds.hud.width).toBeLessThan(160);
    expect(bounds.hud.left).toBeGreaterThanOrEqual(bounds.canvas.left);
    expect(bounds.hud.right).toBeLessThan(bounds.canvas.left + bounds.canvas.width / 2);
    expect(bounds.hud.bottom).toBeLessThanOrEqual(bounds.canvas.bottom);
    expect(bounds.wave.bottom).toBeLessThan(bounds.health.top);
    expect(bounds.health.bottom).toBeLessThan(bounds.timer.top);
    expect(bounds.timer.bottom).toBeLessThan(bounds.scrap.top);
    expect(bounds.scrap.bottom).toBeLessThan(bounds.kills.top);
    await page.screenshot({ path: `test-results/ui-hud-${size.width}.png`, fullPage: true });
  }

  await page.evaluate(() => {
    const scene = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    scene.run.collect(118);
    scene.run.tick(scene.run.remainingMs);
    const now = performance.now();
    for (let i = 0; i < 50; i++) window.__game.headlessStep(now + i * 1000 / 60, 1000 / 60);
  });
  await expect(page.locator('#panel-shop')).toBeVisible();
  for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.__game.scale.refresh());
    const gap = await page.evaluate(() => document.getElementById('next-wave')!.getBoundingClientRect().top - document.querySelector('.upgrades')!.getBoundingClientRect().bottom);
    expect(gap).toBeGreaterThanOrEqual(20);
    await expect(page.getByRole('button', { name: 'Start wave 2' })).toBeInViewport();
    await page.screenshot({ path: `test-results/ui-shop-${size.width}.png`, fullPage: true });
  }
  await page.locator('#buy-damage').click();
  await expect(page.locator('#shop-status')).toHaveText('Upgrade purchased');
  const gap = await page.evaluate(() => document.getElementById('next-wave')!.getBoundingClientRect().top - document.querySelector('.upgrades')!.getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(20);
});
