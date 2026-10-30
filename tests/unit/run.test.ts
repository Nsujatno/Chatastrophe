import { describe, expect, it } from 'vitest';
import { ENEMIES, Run, SPAWN, WAVES, movement, nearest, safeSpawn, scrapValue, type Upgrade } from '../../src/game/systems/run';

function shop(run: Run): void {
  run.startWave();
  run.tick(run.remainingMs);
  run.finishWave();
}

describe('survival run', () => {
  it('requires full timers and continues beyond wave three with bounded progression', () => {
    const run = new Run();
    expect(run.startWave()).toBe(true);
    expect(run.startWave()).toBe(false);
    expect(run.finishWave()).toBe(false);
    for (let wave = 0; wave < 100; wave++) {
      expect(run.wave).toBe(wave);
      expect(run.remainingMs).toBe([30_000, 45_000, 60_000][Math.min(wave, 2)]);
      expect(run.waveConfig.spawnMs).toBeGreaterThanOrEqual(220);
      expect(run.waveConfig.healthMultiplier).toBeLessThanOrEqual(3);
      expect(run.tick(run.remainingMs - 1)).toBe(false);
      expect(run.phase).toBe('playing');
      expect(run.tick(1000)).toBe(true);
      expect(run.remainingMs).toBe(0);
      expect(run.phase).toBe('settling');
      expect(run.hurt(100)).toBe(false);
      run.finishWave();
      expect(run.phase).toBe('shop');
      run.startWave();
    }
    expect(run.startWave()).toBe(false);
  });

  it.each<Upgrade>(['damage', 'attackSpeed', 'movementSpeed'])('caps %s purchases without charging for maxed choices', upgrade => {
    const run = new Run();
    for (let i = 0; i < 100; i++) {
      shop(run);
      run.scrap = 100_000;
      const maxed = run.maxed(upgrade);
      expect(run.buy(upgrade)).toBe(!maxed);
      if (maxed) expect(run.scrap).toBe(100_000);
    }
    expect(run.maxed(upgrade)).toBe(true);
    expect(run.damage).toBeLessThanOrEqual(120);
    expect(run.speed).toBeLessThanOrEqual(360);
    expect(run.attackMs).toBeGreaterThanOrEqual(150);
    expect(run.startWave()).toBe(true);
  });

  it('grants one second of invulnerability across simultaneous and sustained contacts', () => {
    const run = new Run();
    run.startWave();
    expect(run.hurt(12)).toBe(true);
    expect(run.hurt(20)).toBe(false);
    run.tick(999);
    expect(run.hurt(20)).toBe(false);
    run.tick(1);
    expect(run.hurt(20)).toBe(true);
    expect(run.health).toBe(68);
  });

  it('ends immediately on lethal contact and rejects later damage, money, or wave transitions', () => {
    const run = new Run();
    run.startWave();
    run.hurt(200);
    const remaining = run.remainingMs;
    run.tick(100_000);
    run.collect(500);
    expect(run.health).toBe(0);
    expect(run.phase).toBe('lost');
    expect(run.remainingMs).toBe(remaining);
    expect(run.scrap).toBe(0);
    expect(run.finishWave()).toBe(false);
    expect(run.startWave()).toBe(false);
  });

  it('repairs health at the break and carries the wallet and upgrades into the next wave', () => {
    const run = new Run();
    run.startWave();
    run.hurt(30);
    run.collect(100);
    run.tick(30_000);
    run.collect(16);
    run.finishWave();
    expect(run.health).toBe(100);
    expect(run.buy('damage')).toBe(true);
    expect(run.scrap).toBe(56);
    run.startWave();
    expect(run.damage).toBe(18);
    expect(run.scrap).toBe(56);
    expect(run.purchased).toBeUndefined();
    expect(run.upgrades.damage).toBe(1);
  });

  it.each<Upgrade>(['damage', 'attackSpeed', 'movementSpeed'])('charges for %s and permits only one purchase per break', upgrade => {
    const run = new Run();
    run.startWave();
    run.collect(200);
    expect(run.buy(upgrade)).toBe(false);
    run.tick(30_000);
    run.finishWave();
    expect(run.buy(upgrade)).toBe(true);
    expect(run.scrap).toBe(140);
    expect(run.buy('damage')).toBe(false);
    expect(run.buy('attackSpeed')).toBe(false);
    expect(run.buy('movementSpeed')).toBe(false);
    expect(run.upgrades[upgrade]).toBe(1);
  });

  it('allows continuing without money and rejects unaffordable and unknown upgrades', () => {
    const run = new Run();
    shop(run);
    expect(run.buy('damage')).toBe(false);
    run.scrap = 100;
    expect(run.buy('unknown' as Upgrade)).toBe(false);
    expect(run.scrap).toBe(100);
    expect(run.startWave()).toBe(true);
  });

  it('ignores invalid time, damage and currency values', () => {
    const run = new Run();
    run.startWave();
    for (const value of [NaN, Infinity, -10, 0]) {
      expect(run.tick(value)).toBe(false);
      expect(run.hurt(value)).toBe(false);
      run.collect(value);
    }
    expect(run.health).toBe(100);
    expect(run.remainingMs).toBe(30_000);
    expect(run.scrap).toBe(0);
  });
});

describe('combat and spawn rules', () => {
  it('normalizes diagonal movement, stops on zero input, and resolves opposing inputs', () => {
    expect(movement(0, 0, 260)).toEqual({ x: 0, y: 0 });
    expect(movement(-1, 0, 260)).toEqual({ x: -260, y: 0 });
    const diagonal = movement(1, -1, 260);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(260);
  });

  it('targets the closest enemy inside range', () => {
    const enemies = [{ x: 100, y: 0 }, { x: 10, y: 20 }, { x: -20, y: 0 }];
    expect(nearest({ x: 0, y: 0 }, enemies, 60)).toBe(enemies[2]);
    expect(nearest({ x: 0, y: 0 }, enemies, 10)).toBeUndefined();
    expect(nearest({ x: 0, y: 0 }, [], 60)).toBeUndefined();
  });

  it('pays half scrap for shutdowns for all enemy types', () => {
    for (const kind of ['hover-drone', 'skitter', 'hauler'] as const) {
      expect(scrapValue(kind, 'combat')).toBe(ENEMIES[kind].scrap);
      expect(scrapValue(kind, 'shutdown')).toBe(ENEMIES[kind].scrap / 2);
    }
  });

  it('requires a safe distance when choosing a warning location', () => {
    const position = { x: 500, y: 400 };
    expect(safeSpawn(position, { x: 500 + SPAWN.safeDistance, y: 400 })).toBe(true);
    expect(safeSpawn(position, { x: 550, y: 400 })).toBe(false);
  });

  it('introduces variants and increases spawn pressure while preserving base stats', () => {
    expect(WAVES[0].mix).toEqual(['hover-drone']);
    expect(WAVES[1].mix).toContain('skitter');
    expect(WAVES[1].mix).not.toContain('hauler');
    expect(WAVES[2].mix).toContain('hauler');
    expect(WAVES[0].spawnMs).toBeGreaterThan(WAVES[1].spawnMs);
    expect(WAVES[1].spawnMs).toBeGreaterThan(WAVES[2].spawnMs);
    expect(ENEMIES.skitter.speed).toBeGreaterThan(ENEMIES['hover-drone'].speed);
    expect(ENEMIES.hauler.health).toBeGreaterThan(ENEMIES['hover-drone'].health);
  });
});
