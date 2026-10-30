import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import type Phaser from 'phaser';
import type { ArenaScene } from '../../src/game/scenes/ArenaScene';

declare global { interface Window { __game: Phaser.Game; deaths: { reason: string; scrap: number }[] } }

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#game-container')).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Enter the yard' })).toBeVisible();
}

async function start(page: Page): Promise<void> {
  await open(page);
  await page.getByRole('button', { name: 'Enter the yard' }).click();
  await expect(page.locator('#game-container')).toHaveAttribute('data-phase', 'playing');
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const scene = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    return {
      x: scene.player.x, y: scene.player.y, vx: scene.player.body.velocity.x, vy: scene.player.body.velocity.y,
      frame: scene.player.frame.name, animation: scene.player.anims.currentAnim?.key,
      phase: scene.run.phase, wave: scene.run.wave, health: scene.run.health, scrap: scene.run.scrap,
      damage: scene.run.damage, speed: scene.run.speed, attackMs: scene.run.attackMs,
      remainingMs: scene.run.remainingMs, kills: scene.run.kills, enemies: scene.enemies.getLength(),
      projectiles: scene.projectiles.getLength(), pickups: scene.pickups.getLength(), warnings: scene.warnings.length,
      bodies: scene.physics.world.bodies.size, deathListeners: scene.events.listenerCount('enemy-died'),
      pauseListeners: scene.input.keyboard!.listenerCount('keydown-ESC'),
      right: scene.player.body.right, bottom: scene.player.body.bottom,
    };
  });
}

test('moves immediately, normalizes diagonals, animates, stops, and respects bounds and camera', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  const origin = await snapshot(page);
  await page.keyboard.down('d');
  await expect.poll(async () => (await snapshot(page)).vx).toBe(260);
  await expect.poll(async () => (await snapshot(page)).x).toBeGreaterThan(origin.x + 15);
  const first = (await snapshot(page)).frame;
  await expect.poll(async () => (await snapshot(page)).frame).not.toBe(first);
  await page.keyboard.down('w');
  await expect.poll(async () => Math.round((await snapshot(page)).vx)).toBe(184);
  const diagonal = await snapshot(page);
  expect(Math.hypot(diagonal.vx, diagonal.vy)).toBeCloseTo(260);
  expect(diagonal.vy).toBeLessThan(0);
  await page.keyboard.up('d');
  await page.keyboard.up('w');
  await expect.poll(async () => (await snapshot(page)).vx).toBe(0);
  await expect.poll(async () => (await snapshot(page)).vy).toBe(0);
  expect((await snapshot(page)).animation).toMatch(/^idle-(right|up)$/);
  await page.evaluate(() => {
    const scene = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    scene.player.body.reset(1550, 850);
  });
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowDown');
  await expect.poll(async () => (await snapshot(page)).right).toBeGreaterThan(1560);
  await page.waitForTimeout(250);
  const bounded = await snapshot(page);
  expect(bounded.right).toBeLessThanOrEqual(1576.01);
  expect(bounded.bottom).toBeLessThanOrEqual(876.01);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowDown');
  const camera = await page.evaluate(() => {
    const c = (window.__game.scene.getScene('ArenaScene') as ArenaScene).cameras.main;
    return { x: c.scrollX, y: c.scrollY };
  });
  expect(camera.x).toBeGreaterThan(0);
  expect(camera.x).toBeLessThanOrEqual(320);
  expect(camera.y).toBeLessThanOrEqual(180);
  await page.screenshot({ path: 'test-results/m1-movement.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('automatically shoots, kills, emits one death, and drops collectible scrap', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const scene = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    window.deaths = [];
    scene.events.on('enemy-died', (event: { reason: string; scrap: number }) => window.deaths.push(event));
    scene.spawnEnemy('hover-drone', scene.player.x + 130, scene.player.y);
  });
  await expect.poll(async () => (await snapshot(page)).kills).toBeGreaterThanOrEqual(1);
  const deaths = await page.evaluate(() => window.deaths);
  expect(deaths.filter(event => event.reason === 'combat')).toHaveLength(1);
  expect(deaths[0].scrap).toBe(4);
  await expect.poll(async () => (await snapshot(page)).scrap).toBeGreaterThanOrEqual(4);
});

test('settles three waves, banks half-value survivors once, repairs, buys one upgrade and wins', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  for (let wave = 0; wave < 3; wave++) {
    await page.evaluate(() => {
      const scene = window.__game.scene.getScene('ArenaScene') as ArenaScene;
      scene.enemies.clear(true, true);
      scene.run.health = 40;
      scene.run.collect(100);
      scene.spawnEnemy('hauler', 70, 70);
      scene.run.tick(scene.run.remainingMs);
    });
    await expect(page.locator('#game-container')).toHaveAttribute('data-phase', wave === 2 ? 'won' : 'shop');
    expect((await snapshot(page)).enemies).toBe(0);
    expect((await snapshot(page)).projectiles).toBe(0);
    expect((await snapshot(page)).pickups).toBe(0);
    if (wave < 2) {
      expect((await snapshot(page)).health).toBe(100);
      const before = (await snapshot(page)).scrap;
      expect(before).toBe(wave === 0 ? 106 : 152);
      await page.locator('#buy-damage').click();
      expect((await snapshot(page)).scrap).toBe(before - (60 + wave * 30));
      await expect(page.locator('#buy-attackSpeed')).toBeDisabled();
      await expect(page.locator('#buy-movementSpeed')).toBeDisabled();
      await page.screenshot({ path: `test-results/m1-shop-${wave + 1}.png`, fullPage: true });
      await page.getByRole('button', { name: `Start wave ${wave + 2}` }).click();
      expect((await snapshot(page)).wave).toBe(wave + 1);
    }
  }
  await expect(page.getByRole('heading', { name: 'The last one running.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/m1-victory.png', fullPage: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await page.evaluate(() => (window.__game.scene.getScene('ArenaScene') as ArenaScene).run.collect(1));
    await page.getByRole('button', { name: 'Restart run' }).click();
    await expect(page.locator('#game-container')).toHaveAttribute('data-phase', 'playing');
    await expect.poll(async () => (await snapshot(page)).scrap).toBe(0);
    const fresh = await snapshot(page);
    expect(fresh).toMatchObject({ wave: 0, health: 100, scrap: 0, kills: 0, damage: 12, speed: 260, attackMs: 450, enemies: 0, projectiles: 0, pickups: 0, bodies: 1, deathListeners: 1, pauseListeners: 1 });
  }
  expect(errors).toEqual([]);
});

test('dies from contact, stops the arena, and restarts with a clean run', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const scene = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    scene.run.health = 1;
    scene.spawnEnemy('hauler', scene.player.x, scene.player.y);
  });
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  expect((await snapshot(page)).health).toBe(0);
  const remaining = (await snapshot(page)).remainingMs;
  await page.waitForTimeout(150);
  expect((await snapshot(page)).remainingMs).toBe(remaining);
  await page.screenshot({ path: 'test-results/m1-loss.png', fullPage: true });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(async () => (await snapshot(page)).health).toBe(100);
  expect((await snapshot(page)).scrap).toBe(0);
  expect((await snapshot(page)).bodies).toBe(1);
});

test('pauses timers, physics and held input, and pauses when focus is lost', async ({ page }) => {
  await start(page);
  await page.keyboard.down('d');
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-container')).toHaveAttribute('data-phase', 'paused');
  const paused = await snapshot(page);
  await page.keyboard.up('d');
  await page.waitForTimeout(200);
  const later = await snapshot(page);
  expect(later.remainingMs).toBe(paused.remainingMs);
  expect(later.x).toBe(paused.x);
  await page.getByRole('button', { name: 'Resume run' }).click();
  await expect(page.locator('#game-container')).toHaveAttribute('data-phase', 'playing');
  expect((await snapshot(page)).vx).toBe(0);
  await page.evaluate(() => window.__game.events.emit('blur'));
  await expect(page.locator('#game-container')).toHaveAttribute('data-phase', 'paused');
});

test('places warnings safely, spawns announced enemies even when approached, and caps enemies', async ({ page }) => {
  await start(page);
  await expect.poll(async () => (await snapshot(page)).warnings).toBeGreaterThan(0);
  await page.evaluate(() => {
    const scene = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    const warning = scene.warnings[0];
    if (Math.hypot(warning.x - scene.player.x, warning.y - scene.player.y) < 320) throw new Error('Unsafe warning');
    scene.player.body.reset(warning.x, warning.y);
    warning.remainingMs = 1;
  });
  await expect.poll(async () => (await snapshot(page)).warnings).toBe(0);
  expect((await snapshot(page)).enemies).toBe(1);
  const count = await page.evaluate(() => {
    const scene = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    for (let i = 0; i < 90; i++) scene.spawnEnemy('hover-drone', 70, 70);
    return scene.enemies.getLength();
  });
  expect(count).toBe(70);
});

test('keeps the full logical viewport and usable menus on desktop and portrait', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  for (const size of [{ width: 1920, height: 1080 }, { width: 900, height: 700 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await expect.poll(async () => {
      const canvas = await page.locator('canvas').boundingBox();
      const stage = await page.locator('#game-container').boundingBox();
      if (!canvas || !stage) return false;
      return Math.abs(canvas.width / canvas.height - 16 / 9) < 0.01 && canvas.width <= stage.width + 1 && canvas.height <= stage.height + 1;
    }).toBe(true);
    await expect(page.locator('canvas')).toHaveAttribute('width', '1280');
    await expect(page.locator('canvas')).toHaveAttribute('height', '720');
    await expect(page.getByRole('button', { name: 'Enter the yard' })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.screenshot({ path: 'test-results/m1-portrait.png', fullPage: true });
});

test('reports missing artwork and keeps the game unavailable', async ({ page }) => {
  await page.route('**/assets/skitter-move.png', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#load-status')).toContainText('Could not load the artwork (skitter-move)');
  await expect(page.locator('#game-container')).toHaveAttribute('data-ready', 'false');
  await expect(page.getByRole('button', { name: 'Enter the yard' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeDisabled();
});

test('keeps shots straight and removes projectiles when their lifetime ends', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const scene = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    scene.spawnEnemy('hauler', scene.player.x + 350, scene.player.y);
  });
  await expect.poll(async () => (await snapshot(page)).projectiles).toBeGreaterThan(0);
  const result = await page.evaluate(() => {
    const scene = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    const bullet = scene.projectiles.getChildren()[0] as import('../../src/game/entities/Projectile').Projectile;
    const initial = { x: bullet.body.velocity.x, y: bullet.body.velocity.y };
    const enemy = scene.enemies.getChildren()[0] as import('../../src/game/entities/Enemy').Enemy;
    enemy.body.reset(enemy.x, enemy.y + 150);
    scene.update(0, 16);
    const after = { x: bullet.body.velocity.x, y: bullet.body.velocity.y };
    scene.enemies.clear(true, true);
    bullet.remainingMs = 1;
    scene.update(16, 16);
    return { initial, after, remaining: scene.projectiles.getLength() };
  });
  expect(result.initial).toEqual(result.after);
  expect(result.remaining).toBe(0);
});

test('animates every enemy in four directions, keeps hitboxes fixed, and freezes frames on pause', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await page.evaluate(() => {
    const scene = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    for (const [index, kind] of (['hover-drone', 'skitter', 'hauler'] as const).entries()) {
      const offset = (index - 1) * 95;
      const locations = [
        { facing: 'down', x: scene.player.x + offset, y: scene.player.y - 270 },
        { facing: 'left', x: scene.player.x + 300, y: scene.player.y + offset },
        { facing: 'right', x: scene.player.x - 300, y: scene.player.y + offset },
        { facing: 'up', x: scene.player.x + offset, y: scene.player.y + 270 },
      ];
      for (const location of locations) {
        const enemy = scene.spawnEnemy(kind, location.x, location.y)!;
        enemy.health = 10_000;
        enemy.setName(`art-${kind}-${location.facing}`);
      }
    }
  });
  const states = () => page.evaluate(() => {
    const scene = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    return (scene.enemies.getChildren() as import('../../src/game/entities/Enemy').Enemy[])
      .filter(enemy => enemy.name.startsWith('art-')).map(enemy => ({
        name: enemy.name, kind: enemy.kind, facing: enemy.facing, frame: String(enemy.frame.name),
        animation: enemy.anims.currentAnim?.key, x: enemy.x, y: enemy.y, radius: enemy.body.halfWidth,
        offsetX: enemy.body.center.x - enemy.x, offsetY: enemy.body.center.y - enemy.y,
      }));
  });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  const initial = await states();
  expect(initial).toHaveLength(12);
  for (const enemy of initial) {
    const direction = enemy.name.split('-').at(-1);
    expect(enemy.facing).toBe(direction);
    expect(enemy.animation).toBe(`${enemy.kind}-move-${direction}`);
    expect(enemy.radius).toBeCloseTo({ 'hover-drone': 20, skitter: 22, hauler: 38 }[enemy.kind]);
    expect(enemy.offsetX).toBeCloseTo(0);
    expect(enemy.offsetY).toBeCloseTo(0);
  }
  const changed = new Set<string>();
  await expect.poll(async () => {
    for (const enemy of await states()) if (enemy.frame !== initial.find(item => item.name === enemy.name)!.frame) changed.add(enemy.name);
    return changed.size;
  }).toBe(12);
  await page.screenshot({ path: 'test-results/m1-enemy-directions.png', fullPage: true });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await states();
  await page.waitForTimeout(300);
  expect(await states()).toEqual(paused);
  await page.screenshot({ path: 'test-results/m1-enemy-paused.png', fullPage: true });
  const artwork = await page.evaluate(() => {
    const scene = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    return ['scrap', 'bolt', 'spawn-warning'].map(key => ({ key, width: scene.textures.get(key).source[0].width }));
  });
  for (const art of artwork) expect(art.width).toBe(1254);
  await page.getByRole('button', { name: 'Resume run' }).click();
  await expect.poll(async () => (await states()).some(enemy => enemy.frame !== paused.find(item => item.name === enemy.name)!.frame)).toBe(true);
  const resumed = await states();
  for (const enemy of resumed) expect(enemy.radius).toBeCloseTo(initial.find(item => item.name === enemy.name)!.radius);
  await page.getByRole('button', { name: 'Restart run' }).click();
  await expect.poll(async () => (await states()).length).toBe(0);
  expect(errors).toEqual([]);
});

test('survives all 135 seconds through normal physics and keyboard states', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  const result = await page.evaluate(() => {
    const game = window.__game;
    const scene = game.scene.getScene('ArenaScene') as ArenaScene;
    game.loop.stop();
    const seen = new Set<string>();
    let maxEnemies = 0;
    let time = performance.now();
    const step = 1000 / 60;
    const corners = [{ x: 1300, y: 220 }, { x: 1300, y: 680 }, { x: 300, y: 680 }, { x: 300, y: 220 }];
    let corner = 0;
    let heading = { x: 1, y: -1 };
    let combatFrame = '';
    const originalRandom = Math.random;
    let seed = 19761;
    Math.random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
    try {
      scene.restartRun();
      game.headlessStep(time, 0);
      if (scene.run.elapsedMs !== 0) throw new Error('Replay must begin on a fresh simulation frame');
      for (let frame = 0; frame < 10_000 && scene.run.phase !== 'won' && scene.run.phase !== 'lost'; frame++) {
        if (scene.run.phase === 'shop') {
          scene.run.buy(scene.run.wave === 0 ? 'damage' : 'attackSpeed');
          scene.startWave();
        }
        const target = corners[corner];
        if (Math.hypot(target.x - scene.player.x, target.y - scene.player.y) < 80) corner = (corner + 1) % corners.length;
        if (frame % 8 === 0) {
          let best = -Infinity;
          for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) {
            if (x === 0 && y === 0) continue;
            const length = Math.hypot(x, y);
            const next = { x: scene.player.x + x / length * scene.run.speed * 0.5, y: scene.player.y + y / length * scene.run.speed * 0.5 };
            if (next.x < 100 || next.x > 1500 || next.y < 100 || next.y > 800) continue;
            let clearance = 400;
            for (const enemy of scene.enemies.getChildren() as import('../../src/game/entities/Enemy').Enemy[]) {
              const rx = enemy.x - scene.player.x;
              const ry = enemy.y - scene.player.y;
              const vx = enemy.body.velocity.x - x / length * scene.run.speed;
              const vy = enemy.body.velocity.y - y / length * scene.run.speed;
              const speedSquared = vx * vx + vy * vy;
              const closestTime = speedSquared === 0 ? 0 : Math.max(0, Math.min(0.5, -(rx * vx + ry * vy) / speedSquared));
              const distance = Math.hypot(rx + vx * closestTime, ry + vy * closestTime);
              clearance = Math.min(clearance, distance - enemy.body.radius * enemy.scaleX - 20);
            }
            for (const warning of scene.warnings) {
              clearance = Math.min(clearance, Math.hypot(next.x - warning.x, next.y - warning.y) - 60);
            }
            const score = -Math.hypot(target.x - next.x, target.y - next.y) / 300 - Math.max(0, 170 - clearance) ** 2 / 2500;
            if (score > best) { best = score; heading = { x, y }; }
          }
        }
        const keys = scene.input.keyboard!.keys;
        keys[65].isDown = heading.x < 0;
        keys[68].isDown = heading.x > 0;
        keys[87].isDown = heading.y < 0;
        keys[83].isDown = heading.y > 0;
        time += step;
        game.headlessStep(time, step);
        maxEnemies = Math.max(maxEnemies, scene.enemies.getLength());
        for (const enemy of scene.enemies.getChildren() as import('../../src/game/entities/Enemy').Enemy[]) seen.add(enemy.kind);
        if (!combatFrame && scene.run.elapsedMs >= 100_000) {
          time += step;
          game.step(time, step);
          combatFrame = game.canvas.toDataURL('image/png');
        }
      }
    } finally { Math.random = originalRandom; }
    game.step(time + step, step);
    return { phase: scene.run.phase, elapsed: scene.run.elapsedMs, health: scene.run.health, kills: scene.run.kills, earned: scene.run.earned, seen: [...seen], maxEnemies, combatFrame };
  });
  const { combatFrame, ...stats } = result;
  if (combatFrame) writeFileSync('test-results/m1-combat.png', Buffer.from(combatFrame.split(',')[1], 'base64'));
  console.log('Full-run verification:', stats);
  expect(result.phase, JSON.stringify(stats)).toBe('won');
  expect(result.elapsed).toBeCloseTo(135_000);
  expect(result.health).toBeGreaterThan(0);
  expect(result.kills).toBeGreaterThan(20);
  expect(result.seen.sort()).toEqual(['hauler', 'hover-drone', 'skitter']);
  expect(result.maxEnemies).toBeLessThanOrEqual(70);
  await page.screenshot({ path: 'test-results/m1-full-run.png', fullPage: true });
});
