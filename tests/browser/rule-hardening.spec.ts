import { expect, test } from '@playwright/test';
import type { ArenaScene } from '../../src/game/scenes/ArenaScene';
import rescue from '../../docs/rules/rescue-party.json' with { type: 'json' };
import haulers from '../../docs/rules/volatile-haulers.json' with { type: 'json' };
import lastStand from '../../docs/rules/last-stand.json' with { type: 'json' };

test('wave-start rules see the correct player size before the first physics step', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#game-container')).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  const snapshot = await page.evaluate(() => {
    const s = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    const radius = s.player.body.halfWidth;
    const offset = Math.hypot(s.player.body.center.x - s.player.x, s.player.body.center.y - s.player.y);
    s.sabotage['random'] = () => 0.75;
    const queued = s.sabotage.queue({ id: 'opening', name: 'Opening', rules: [{ id: 'arrival', trigger: { type: 'wave_started' }, actions: [{ type: 'spawn', enemyType: 'hover-drone', count: 1, at: { anchor: 'player', radius: 110 }, profile: { size: 0.6 } }] }] });
    s.startWave();
    return { radius, offset, queued, warnings: s.sabotage.pendingCount };
  });
  expect(snapshot.radius).toBeCloseTo(19.22, 0);
  expect(snapshot.offset).toBeLessThan(1);
  expect(snapshot.queued).toBe(true); expect(snapshot.warnings).toBe(1);
});

for (const example of [rescue, haulers, lastStand]) test(`${example.name} runs as custom JSON through native combat and normal settlement`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#game-container')).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  await page.locator('#sabotage-debug > summary').click();
  await page.locator('#rule-json').fill(JSON.stringify(example));
  await page.getByRole('button', { name: 'Use next wave', exact: true }).click();
  await expect(page.locator('#ready-changes')).toContainText(example.name);
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  const report = await page.evaluate(id => {
    const game = window.__game;
    const s = game.scene.getScene('ArenaScene') as ArenaScene;
    game.loop.stop();
    s.enemies.clear(true, true); s.projectiles.clear(true, true); s['clearWarnings']();
    Object.assign(s, { spawnRemaining: 100_000, attackRemaining: 100_000 });
    let seed = 123;
    s.sabotage['random'] = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
    let now = performance.now();
    const step = (ms: number) => { for (let i = 0; i < Math.ceil(ms / (1000 / 60)); i++) { now += 1000 / 60; game.headlessStep(now, 1000 / 60); } };
    let observations: Record<string, unknown>;
    if (id === 'rescue-party') {
      s.run.health = 25;
      step(9000);
      const actors = s.enemies.getChildren() as import('../../src/game/entities/Enemy').Enemy[];
      const count = actors.length;
      const born = actors[0];
      const speed = born.speed; const size = born.sizeMultiplier;
      born.body.reset(800, 450); s.player.body.reset(730, 450);
      const neighbor = s.spawnEnemy('hauler', 900, 450)!;
      neighbor.body.moves = false; neighbor.setImmovable(true);
      s['damageEnemy'](born, 10_000, 0); step(800);
      observations = { count, speed, size, playerHealth: s.run.health, neighborHealth: neighbor.health, kills: s.run.kills };
    } else if (id === 'volatile-haulers') {
      s.player.body.reset(800, 250);
      const hauler = s.spawnEnemy('hauler', 800, 450)!;
      const near = s.spawnEnemy('hover-drone', 900, 450)!; near.body.moves = false;
      const far = s.spawnEnemy('hover-drone', 1250, 700)!; far.body.moves = false;
      s.sabotage['random'] = () => 0.2;
      s['damageEnemy'](hauler, 10_000, 0); s['syncStats']();
      const speed = near.speed; const farSpeed = far.speed;
      step(800); const health = near.health; step(2500);
      observations = { speed, farSpeed, health, restored: near.speed, kills: s.run.kills };
    } else {
      s.run.health = 30; s['hurtPlayer'](1, 0);
      const damage = s.sabotage.modifiers.effective('player', 'projectile_damage', s.run.damage, 'player');
      step(800);
      const pursuer = (s.enemies.getChildren() as import('../../src/game/entities/Enemy').Enemy[])[0];
      const generation = pursuer.generation; const hit = pursuer.contactDamage;
      s['damageEnemy'](pursuer, 10_000, 0); step(800);
      const child = (s.enemies.getChildren() as import('../../src/game/entities/Enemy').Enemy[])[0];
      const childGeneration = child.generation;
      s['damageEnemy'](child, 10_000, 0); const warning = s.sabotage.pendingCount;
      step(1700);
      observations = { damage, generation, hit, childGeneration, warning, pending: s.sabotage.pendingCount, enemies: s.enemies.getLength(), kills: s.run.kills, restored: s.sabotage.modifiers.effective('player', 'projectile_damage', s.run.damage, 'player') };
    }
    game.step(now, 0);
    return observations;
  }, example.id);
  if (example.id === 'rescue-party') {
    expect(report.count).toBe(2); expect(report.speed).toBeCloseTo(51.8); expect(report.size).toBeCloseTo(0.84);
    expect(report.playerHealth).toBe(17); expect(report.neighborHealth).toBe(64);
  } else if (example.id === 'volatile-haulers') {
    expect(report.speed).toBeCloseTo(103.6); expect(report.farSpeed).toBe(74); expect(report.health).toBe(6); expect(report.restored).toBe(74);
  } else {
    expect(report).toMatchObject({ damage: 18, generation: 0, hit: 7.5, childGeneration: 1, warning: 1, pending: 0, enemies: 0, kills: 2, restored: 12 });
  }
  await page.screenshot({ path: `test-results/m3-${example.id}.png`, fullPage: true });
  const clean = await page.evaluate(() => {
    const s = window.__game.scene.getScene('ArenaScene') as ArenaScene;
    s.advanceWave();
    for (let i = 0; i < 50; i++) window.__game.headlessStep(performance.now() + i * 1000 / 60, 1000 / 60);
    return { phase: s.run.phase, active: Boolean(s.sabotage.active), pending: s.sabotage.pendingCount, events: s.sabotage.eventCount, modifiers: s.sabotage.modifiers.size, listeners: s.sabotage.listenerCount, warnings: s.ruleWarnings.size, bodies: s.physics.world.bodies.size, health: s.run.health };
  });
  expect(clean).toEqual({ phase: 'shop', active: false, pending: 0, events: 0, modifiers: 0, listeners: 0, warnings: 0, bodies: 1, health: 100 });
  expect(errors).toEqual([]);
});

test('twenty dense waves preserve real purchases, caps and clean restarts', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#game-container')).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  const result = await page.evaluate(examples => {
    const game = window.__game;
    const s = game.scene.getScene('ArenaScene') as ArenaScene;
    game.loop.stop();
    let now = performance.now(); let maxActors = 0; let changes = 0; let resetChecks = 0;
    const step = (frames: number) => { for (let i = 0; i < frames; i++) { now += 1000 / 60; game.headlessStep(now, 1000 / 60); } };
    const nativePreUpdateListeners = s.events.listenerCount('preupdate');
    let seed = 9202;
    for (let i = 0; i < 20; i++) {
      if (!s.sabotage.queue(examples[i % 3])) throw new Error(s.sabotage.errors.join('\n'));
      s.startWave(); changes++;
      s.sabotage['random'] = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
      Object.assign(s, { spawnRemaining: 100_000, attackRemaining: 100_000 });
      // Capacity/cleanup fixture: fund real shop purchases and prevent death from ending the stress run.
      if (i % 5 === 0) s.run.collect(100_000);
      for (let actor = 0; actor < 70; actor++) s.spawnEnemy(actor % 5 === 0 ? 'hauler' : 'hover-drone', 100 + actor % 10 * 140, 90 + Math.floor(actor / 10) * 100);
      s.run.health = 30; s['hurtPlayer'](1, 0); s.run.invulnerableUntil = s.run.elapsedMs + 60_000;
      s.sabotage.tick(8000); step(65);
      maxActors = Math.max(maxActors, s.enemies.getLength());
      if (s.enemies.getLength() > 70 || s.warnings.length + s.ruleWarnings.size > 8 || s.sabotage.eventCount > 128) throw new Error('Capacity bound exceeded');
      const speed = s.run.speed; const attack = s.run.attackMs;
      s.advanceWave(); step(50);
      if (s.run.phase !== 'shop' || s.run.speed !== speed || s.run.attackMs !== attack || s.physics.world.bodies.size !== 1 || s.sabotage.listenerCount || s.sabotage.pendingCount || s.sabotage.modifiers.size || s.ruleWarnings.size) throw new Error('Wave cleanup/progression leaked');
      s.run.buy(i % 2 === 0 ? 'movementSpeed' : 'attackSpeed');
      if (s.run.speed > 360 || s.run.attackMs < 150) throw new Error('Permanent upgrade cap exceeded');
      if (i % 5 === 4) {
        s.restartRun(); step(1);
        if (s.sabotage.wave !== 1 || s.sabotage.active || s.sabotage.queued || s.events.listenerCount('preupdate') !== nativePreUpdateListeners || s.events.listenerCount('enemy-died') !== 1 || s.input.keyboard!.listenerCount('keydown-ESC') !== 1) throw new Error('Restart leaked state or listeners');
        s.advanceWave(); step(50); resetChecks++;
      }
    }
    game.step(now, 0);
    return { maxActors, changes, resetChecks, health: s.run.health };
  }, [rescue, haulers, lastStand]);
  expect(result).toEqual({ maxActors: 70, changes: 20, resetChecks: 4, health: 100 });
  expect(errors).toEqual([]);
});
