import { describe, expect, it, vi } from 'vitest';
import { RULE_LIMITS, validateRuleset } from '../../src/shared/rules';
import { SabotageManager, type GameEvent, type RuleEntity } from '../../src/game/rules/SabotageManager';
import { Run } from '../../src/game/systems/run';
import { World, enemy } from '../helpers/ruleWorld';
import rescue from '../../docs/rules/rescue-party.json' with { type: 'json' };
import haulers from '../../docs/rules/volatile-haulers.json' with { type: 'json' };
import lastStand from '../../docs/rules/last-stand.json' with { type: 'json' };

const boost = { id: 'boost', name: 'Boost', rules: [{ id: 'rush', trigger: { type: 'player_damaged' }, actions: [{ type: 'modify', target: { kind: 'player' }, stat: 'move_speed', multiplier: 1.5, durationMs: 1000 }] }] };
const random = () => { let seed = 1023; return () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; }; };
function setup(input: unknown) {
  const world = new World();
  const manager = new SabotageManager(1, world, random());
  expect(manager.queue(input)).toBe(true);
  expect(manager.beginWave(1, 60_000)).toBe(true);
  return { world, manager };
}

describe('new compositions through the existing runtime', () => {
  it('Rescue Party links a health condition, interval, tagged spawn modifiers and death blast', () => {
    const { world, manager } = setup(rescue);
    world.health = 70; manager.tick(8000); expect(manager.pendingCount).toBe(0);
    world.health = 30; world.actors = [];
    world.onSpawn = request => {
      const actor = { ...enemy(`rescue-${world.spawns.length}`, request.generation, request.tags), x: request.x, y: request.y };
      world.actors.push(actor); world.emit('enemy_spawned', actor, { depth: request.depth });
    };
    manager.tick(8000); expect(manager.pendingCount).toBe(2);
    manager.tick(750); expect(world.spawns).toHaveLength(2); expect(manager.modifiers.size).toBe(4);
    const actor = world.actors[0];
    expect(manager.modifiers.effective(actor.id, 'move_speed', 74, 'enemy')).toBeCloseTo(51.8);
    expect(manager.modifiers.effective(actor.id, 'size', 0.7, 'enemy')).toBeCloseTo(0.84);
    manager.tick(4000); expect(manager.modifiers.size).toBe(2);
    world.emit('enemy_died', actor); manager.forgetEntity(actor.id); manager.tick(750);
    expect(world.blasts[0]).toMatchObject({ x: actor.x, y: actor.y, damage: 8 });
    manager.clear('wave_end'); expect(manager.modifiers.size).toBe(0);
  });

  it('Volatile Haulers combines chance, spatial selection and multiple death actions', () => {
    const { world, manager } = setup(haulers);
    manager['random'] = () => 0.5;
    const origin = { ...enemy('hauler'), kind: 'hauler' as const };
    world.actors = [enemy('near'), { ...enemy('far'), x: 1500 }];
    world.emit('enemy_died', enemy('wrong-kind')); expect(manager.pendingCount).toBe(0);
    world.emit('enemy_died', origin); expect(manager.pendingCount).toBe(1);
    expect(manager.modifiers.effective('near', 'move_speed', 74, 'enemy')).toBeCloseTo(103.6);
    expect(manager.modifiers.effective('far', 'move_speed', 74, 'enemy')).toBe(74);
    manager.tick(750); expect(world.blasts[0]).toMatchObject({ x: origin.x, y: origin.y, radius: 110, damage: 12 });
    manager.tick(2250); expect(manager.modifiers.size).toBe(0);
  });

  it('Last Stand links a player boost, root pursuer, one child generation and a final explosion', () => {
    const { world, manager } = setup(lastStand);
    world.actors = [];
    world.onSpawn = request => {
      const actor = { ...enemy(`unit-${world.spawns.length}`, request.generation, request.tags), kind: request.kind, x: request.x, y: request.y };
      world.actors.push(actor); world.emit('enemy_spawned', actor, { depth: request.depth });
    };
    world.health = 39; world.emit('player_damaged', world.actor);
    expect(manager.modifiers.effective('player', 'projectile_damage', 24, 'player')).toBe(36);
    expect(manager.modifiers.effective('player', 'attack_interval', 300, 'player')).toBe(225);
    manager.tick(750);
    const pursuer = world.actors[0];
    expect(pursuer.tags).toEqual(['pursuer']); expect(pursuer.generation).toBe(0);
    expect(manager.modifiers.effective(pursuer.id, 'contact_damage', 5, 'enemy')).toBe(7.5);
    world.actors = []; world.emit('enemy_died', pursuer); manager.forgetEntity(pursuer.id);
    manager.tick(750); const spark = world.actors[0];
    expect(spark.tags).toEqual(['spark']); expect(spark.generation).toBe(1);
    world.actors = []; world.emit('enemy_died', spark); manager.tick(750);
    expect(world.blasts).toHaveLength(1); expect(world.blasts[0].damage).toBe(6);
    manager.tick(1000); expect(manager.modifiers.size).toBe(0);
  });
});

describe('adversarial event routing and ownership', () => {
  it.each(['death', 'restart'] as const)('rejects late async results and activation after %s', reason => {
    const { manager } = setup(boost);
    const captured = { runId: manager.runId, wave: manager.wave + 1 };
    manager.clear(reason);
    expect(manager.queue(lastStand, captured)).toBe(false);
    expect(manager.queued).toBeUndefined();
    expect(manager.beginWave(2, 60_000)).toBe(false);
  });

  it('bounds reentrant event work even when all filters reject and no action tokens are spent', () => {
    const { world, manager } = setup({ ...boost, rules: [{ ...boost.rules[0], filters: [{ type: 'health_below', percent: 1 }] }] });
    let evaluations = 0;
    world.healthPercent = () => {
      evaluations++;
      if (evaluations < 1000) world.emit('player_damaged', world.actor);
      return 50;
    };
    world.emit('player_damaged', world.actor);
    expect(evaluations).toBe(RULE_LIMITS.eventsPerFrame);
    expect(manager.eventCount).toBe(1);
    expect(manager.modifiers.size).toBe(0);
    manager.tick(16); expect(evaluations).toBe(RULE_LIMITS.eventsPerFrame * 2);
    manager.clear(); expect(manager.eventCount).toBe(0);
  });

  it('shares one action budget between pre-update physics events and scene-update timers', () => {
    const { world, manager } = setup(boost);
    const apply = vi.spyOn(manager.modifiers, 'apply');
    manager.beginFrame(); manager.beginFrame();
    for (let i = 0; i < 40; i++) world.emit('player_damaged', world.actor);
    manager.tick(16);
    expect(apply).toHaveBeenCalledTimes(RULE_LIMITS.actionsPerFrame);
    manager.beginFrame(); manager.tick(1000);
    expect(apply.mock.calls.length).toBeGreaterThan(RULE_LIMITS.actionsPerFrame);
    expect(apply.mock.calls.length).toBeLessThanOrEqual(RULE_LIMITS.actionsPerFrame * 2);
  });

  it('ignores detached callbacks even if they are handed current-wave metadata', () => {
    const { world, manager } = setup(boost);
    const oldHandler = [...world.listeners.get('player_damaged')!][0];
    manager.clear('wave_end'); manager.queue(boost); manager.beginWave(2, 60_000);
    const fresh: GameEvent = { type: 'player_damaged', runId: 1, wave: 2, depth: 0, subject: world.actor, position: world.actor };
    oldHandler(fresh); expect(manager.modifiers.size).toBe(0);
    world.emit('player_damaged', world.actor, fresh); expect(manager.modifiers.size).toBe(1);
    manager.clear('restart');
    const next = new SabotageManager(2, world); next.queue(boost); next.beginWave(1, 30_000);
    oldHandler({ ...fresh, runId: 2, wave: 1 }); expect(next.modifiers.size).toBe(0);
  });

  it('rejects malformed causal depths, positions and generation values', () => {
    const { world, manager } = setup(lastStand);
    world.health = 30;
    for (const depth of [NaN, Infinity, -1, 0.5, 5]) world.emit('player_damaged', world.actor, { depth });
    world.emit('player_damaged', world.actor, { position: { x: NaN, y: 100 } });
    expect(manager.pendingCount).toBe(0); expect(manager.modifiers.size).toBe(0);
    for (const generation of [-1, NaN, Infinity, 0.5, 2]) {
      world.emit('enemy_died', enemy('bad-parent', generation, ['pursuer']));
      expect(manager.pendingCount).toBe(0);
    }
  });

  it('keeps the last accepted next-wave set across 1000 invalid/stale replacements', () => {
    const { manager } = setup(rescue);
    expect(manager.queue(lastStand)).toBe(true);
    for (let i = 0; i < 1000; i++) {
      expect(manager.queue({ ...haulers, source: 'trusted', budget: Infinity })).toBe(false);
      expect(manager.queue(haulers, { runId: 0, wave: 2 })).toBe(false);
      expect(manager.queued?.data.id).toBe('last-stand');
    }
    manager.clear('wave_end'); expect(manager.beginWave(2, 60_000)).toBe(true);
    expect(manager.active?.data.id).toBe('last-stand'); expect(manager.beginWave(2, 60_000)).toBe(false);
  });
});

it('sustains 250 full waves with 70 actors, event floods, ruleset replacements and progression intact', () => {
  const world = new World();
  const manager = new SabotageManager(1, world, random());
  const run = new Run();
  const examples = [rescue, haulers, lastStand];
  let spawned = 0;
  let blasts = 0;
  let sequence = 0;
  let totalMs = 0;
  const owned = new Map<string, string>();
  const populate = () => {
    while (world.actors.length < 70) {
      const i = world.actors.length;
      world.actors.push({ ...enemy(`ordinary-${sequence++}`), kind: i % 5 === 0 ? 'hauler' : 'hover-drone', x: 100 + i % 10 * 140, y: 90 + Math.floor(i / 10) * 100 });
    }
  };
  const emit = (type: GameEvent['type'], actor?: RuleEntity, depth = 0) => world.emit(type, actor, { wave: manager.wave, depth });
  world.onSpawn = request => {
    spawned++;
    if (world.actors.length >= 70) return;
    const actor = { ...enemy(`owned-${sequence++}`, request.generation, request.tags), kind: request.kind, x: request.x, y: request.y };
    owned.set(actor.id, request.owner); world.actors.push(actor); emit('enemy_spawned', actor, request.depth);
  };
  world.onBlast = request => {
    blasts++;
    for (const actor of world.actors.splice(0, 4)) { manager.forgetEntity(actor.id); owned.delete(actor.id); emit('enemy_died', actor, request.depth); }
  };
  world.removeOwned = owner => {
    world.actors = world.actors.filter(actor => owned.get(actor.id) !== owner);
    for (const [id, value] of owned) if (value === owner) owned.delete(id);
  };
  world.health = 30;
  for (let wave = 1; wave <= 250; wave++) {
    expect(manager.queue(examples[(wave - 1) % 3])).toBe(true);
    run.startWave(); expect(manager.beginWave(wave, run.remainingMs)).toBe(true);
    populate(); emit('wave_started');
    const duration = run.remainingMs;
    for (let ms = 0; ms < duration; ms += 250) {
      manager.beginFrame();
      if (ms % 1000 === 0) {
        for (let event = 0; event < (ms % 4000 === 0 ? 400 : 1); event++) emit('player_damaged', world.actor);
        for (const actor of world.actors.splice(0, 4)) { manager.forgetEntity(actor.id); owned.delete(actor.id); emit('enemy_died', actor); }
      }
      manager.tick(250); run.tick(250); totalMs += 250; populate();
      if (ms % 1000 === 0) {
        expect(manager.eventCount).toBeLessThanOrEqual(RULE_LIMITS.events);
        expect(manager.pendingCount).toBeLessThanOrEqual(RULE_LIMITS.pending);
        expect(manager.modifiers.size).toBeLessThanOrEqual(71 * RULE_LIMITS.rules * RULE_LIMITS.actions);
        expect(world.actors).toHaveLength(70);
      }
    }
    manager.clear('wave_end'); run.finishWave();
    expect(manager.listenerCount).toBe(0); expect(manager.pendingCount).toBe(0);
    expect(manager.modifiers.size).toBe(0); expect(world.warnings).toHaveLength(0);
    world.actors = []; owned.clear(); world.spawns = []; world.blasts = [];
    run.scrap = 1_000_000;
    run.buy(wave % 2 === 0 ? 'attackSpeed' : 'movementSpeed');
    expect(run.speed).toBeLessThanOrEqual(360); expect(run.attackMs).toBeGreaterThanOrEqual(150);
    expect(run.waveConfig.healthMultiplier).toBeLessThanOrEqual(3);
  }
  expect(totalMs).toBe(14_955_000);
  expect(spawned).toBeGreaterThan(1000); expect(blasts).toBeGreaterThan(250);
  expect(run.upgrades.movementSpeed).toBeGreaterThan(0); expect(run.upgrades.attackSpeed).toBeGreaterThan(0);
  expect(run.speed).toBe(360); expect(run.attackMs).toBe(150); expect(manager.blocked).toBeGreaterThan(0);
  expect(validateRuleset(examples[0]).ok).toBe(true);
});
