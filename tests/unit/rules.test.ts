import { describe, expect, it, vi } from 'vitest';
import { RULE_LIMITS, describeRuleset, validateRuleset } from '../../src/shared/rules';
import { SabotageManager } from '../../src/game/rules/SabotageManager';
import { World, enemy } from '../helpers/ruleWorld';
import { PRESETS } from '../../src/game/rules/presets';
import { ModifierStore } from '../../src/game/rules/ModifierStore';

const modify = (stat = 'move_speed', multiplier = 1.5, durationMs: number | string = 1000) => ({ type: 'modify', target: { kind: 'player' }, stat, multiplier, durationMs });
const blast = { type: 'explode', at: { anchor: 'player' }, radius: 80, damage: 10 };
const spawn = { type: 'spawn', enemyType: 'hover-drone', count: 2, at: { anchor: 'event', radius: 90 }, profile: { size: 0.6, reward: 0.25 }, tags: ['mini'] };
const definition = (actions: unknown[] = [modify()], trigger: unknown = { type: 'player_damaged' }, filters: unknown[] = []) => ({ id: 'custom', name: 'Custom test', rules: [{ id: 'rule', trigger, filters, actions }] });
function setup(input: unknown = definition(), random?: () => number) {
  const world = new World();
  const manager = new SabotageManager(1, world, random);
  expect(manager.queue(input)).toBe(true);
  expect(manager.beginWave(1, 30_000)).toBe(true);
  return { world, manager };
}

describe('shared rule admission', () => {
  it('validates six distinct data-only presets and describes each action', () => {
    expect(PRESETS).toHaveLength(6);
    for (const set of PRESETS) {
      expect(validateRuleset(JSON.parse(JSON.stringify(set))).ok).toBe(true);
      expect(describeRuleset(set)).toHaveLength(set.rules.length);
    }
  });

  it('explains firing speed and enemy damage in plain language', () => {
    const changes = describeRuleset(PRESETS[5]);
    expect(changes[0]).toContain('you shoot 43% faster for this wave');
    expect(changes[1]).toContain('its hits hurt 40% more for this wave');
    for (const preset of PRESETS) expect(describeRuleset(preset).join(' ')).not.toMatch(/×|attack_interval|contact_damage|event_entity|\bpx\b/);
    const slow = validateRuleset(definition([modify('attack_interval', 2)]));
    if (!slow.ok) throw new Error('Invalid fixture');
    expect(describeRuleset(slow.data)[0]).toContain('you shoot 50% slower');
  });

  it.each([
    definition([modify('health')]), definition([modify('move_speed', Infinity)]), definition([modify('move_speed', 10)]),
    definition([modify('move_speed', 1, 200)]), definition([blast], { type: 'interval', everyMs: 999 }),
    definition([{ ...blast, at: { anchor: 'event' } }], { type: 'wave_started' }),
    definition([{ ...modify(), target: { kind: 'event_entity' } }], { type: 'enemy_died' }),
    definition([{ ...modify('projectile_damage'), target: { kind: 'enemies' } }]),
    definition([blast], { type: 'wave_started' }, [{ type: 'tag', value: 'mini' }]),
    definition([{ ...spawn, profile: { reward: 2 } }]), definition([{ ...spawn, generation: 0 }]),
    definition([{ ...spawn, count: 5 }]), definition([{ ...spawn, tags: ['a', 'b', 'c', 'd', 'e'] }]),
    definition([{ ...spawn, tags: ['a', 'a'] }]), definition([{ type: 'execute', code: 'alert(1)' }]),
    { ...definition(), source: 'trusted' }, { ...definition(), budget: 999 },
  ])('rejects unsupported or out-of-bound input with a field error', input => {
    const result = validateRuleset(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/rules|source|budget/);
  });

  it('rejects duplicate rules, excessive counts and a linked set over the chaos budget', () => {
    const rule = definition().rules[0];
    const inputs = [
      { ...definition(), rules: [rule, rule] },
      { ...definition(), rules: Array.from({ length: 7 }, (_, i) => ({ ...rule, id: `r${i}` })) },
      definition([modify(), modify(), modify(), modify()]),
      definition([modify()], { type: 'player_damaged' }, Array(5).fill({ type: 'chance', value: 1 })),
      { ...definition(), rules: [0, 1, 2].map(i => ({ ...rule, id: `r${i}`, actions: [{ ...spawn, count: 4 }] })) },
    ];
    for (const input of inputs) expect(validateRuleset(input).ok).toBe(false);
  });

  it('preserves a valid queue on invalid edits and rejects stale/duplicate activation', () => {
    const world = new World();
    const manager = new SabotageManager(1, world);
    expect(manager.queue(PRESETS[0])).toBe(true);
    expect(manager.queue({ ...PRESETS[1], extra: true })).toBe(false);
    expect(manager.queue(PRESETS[1], { runId: 0, wave: 1 })).toBe(false);
    expect(manager.queue(PRESETS[1], { runId: 1, wave: 2 })).toBe(false);
    expect(manager.queued?.data.id).toBe(PRESETS[0].id);
    expect(manager.beginWave(2, 30_000)).toBe(false);
    expect(manager.beginWave(1, 30_000)).toBe(true);
    expect(manager.beginWave(1, 30_000)).toBe(false);
    expect(manager.queue(PRESETS[1])).toBe(true);
    expect(manager.active?.data.id).toBe(PRESETS[0].id);
    manager.clear('wave_end');
    expect(manager.beginWave(2, 45_000)).toBe(true);
    expect(manager.active?.data.id).toBe(PRESETS[1].id);
  });
});

describe('composable execution', () => {
  it('ANDs enemy type, tag, chance and current player health filters', () => {
    const filters = [{ type: 'enemy_type', value: 'hover-drone' }, { type: 'tag', value: 'mini' }, { type: 'chance', value: 1 }, { type: 'health_below', percent: 50 }];
    const { world, manager } = setup(definition([modify()], { type: 'enemy_died' }, filters), () => 0.999);
    world.emit('enemy_died', enemy());
    expect(manager.modifiers.size).toBe(0);
    world.health = 50; world.emit('enemy_died', enemy('a', 1, ['mini']));
    expect(manager.modifiers.size).toBe(0);
    world.health = 49; world.emit('enemy_died', enemy('a', 1, ['mini']));
    expect(manager.modifiers.size).toBe(1);
    const never = setup(definition([modify()], { type: 'enemy_died' }, [{ type: 'chance', value: 0 }]), () => 0);
    never.world.emit('enemy_died', enemy());
    expect(never.manager.modifiers.size).toBe(0);
  });

  it('selects current enemies by tag/type/area and supports future live spawn entities', () => {
    const { world, manager } = setup(definition([{ ...modify(), target: { kind: 'enemies', enemyType: 'hover-drone', tag: 'mini', area: { at: { anchor: 'event' }, radius: 100 } } }]));
    world.actors = [enemy('near', 1, ['mini']), { ...enemy('far', 1, ['mini']), x: 50 }, enemy('untagged')];
    world.emit('player_damaged', { ...world.actor, x: 500, y: 400 });
    expect(manager.modifiers.effective('near', 'move_speed', 74, 'enemy')).toBe(111);
    expect(manager.modifiers.effective('far', 'move_speed', 74, 'enemy')).toBe(74);
    expect(manager.modifiers.effective('untagged', 'move_speed', 74, 'enemy')).toBe(74);
    const heavy = setup(PRESETS[2]);
    const hauler = { ...enemy('new'), kind: 'hauler' as const };
    heavy.world.actors.push(hauler); heavy.world.emit('enemy_spawned', hauler);
    expect(heavy.manager.modifiers.size).toBe(3);
    expect(heavy.manager.modifiers.effective('new', 'size', 1, 'enemy')).toBe(1.5);
    heavy.manager.forgetEntity('new'); expect(heavy.manager.modifiers.size).toBe(0);
  });

  it('refreshes the same action, expires short effects and preserves progression', () => {
    const { world, manager } = setup();
    world.emit('player_damaged', world.actor);
    manager.tick(800); world.emit('player_damaged', world.actor);
    expect(manager.modifiers.size).toBe(1);
    manager.tick(500);
    expect(manager.modifiers.effective('player', 'move_speed', 299, 'player')).toBe(448.5);
    manager.tick(500);
    expect(manager.modifiers.effective('player', 'move_speed', 299, 'player')).toBe(299);
  });

  it('combines distinct contributions under stat bounds, with independent expiry', () => {
    const store = new ModifierStore();
    store.apply('a', { target: 'p', stat: 'move_speed', multiplier: 1.5, expiresAt: 1000 });
    store.apply('b', { target: 'p', stat: 'move_speed', multiplier: 2, expiresAt: 2000 });
    expect(store.effective('p', 'move_speed', 260, 'player')).toBe(460);
    store.tick(1000); expect(store.effective('p', 'move_speed', 200, 'player')).toBe(400);
    store.tick(2000); expect(store.effective('p', 'move_speed', 260, 'player')).toBe(260);
    store.apply('c', { target: 'p', stat: 'attack_interval', multiplier: 0.5, expiresAt: 2000 });
    expect(store.effective('p', 'attack_interval', 150, 'player')).toBe(100);
  });

  it('telegraphs a fixed destination and uses gameplay time rather than wall time', () => {
    const { world, manager } = setup(definition([blast], { type: 'interval', everyMs: 1000 }));
    manager.tick(1000);
    expect(world.warnings).toHaveLength(1); expect(world.blasts).toHaveLength(0);
    const original = { ...world.actor }; world.actor.x = 200;
    manager.tick(749); expect(world.blasts).toHaveLength(0);
    manager.tick(1); expect(world.blasts[0]).toMatchObject({ x: original.x, y: original.y, depth: 1, owner: '1:1' });
    expect(world.warnings).toHaveLength(0);
  });

  it.each(['event', 'player', 'arena'] as const)('resolves the %s anchor inside the arena', anchor => {
    const { world, manager } = setup(definition([{ ...blast, at: { anchor, radius: 400 } }]), () => 0.99);
    world.emit('player_damaged', world.actor); manager.tick(750);
    const point = world.blasts[0];
    expect(point.x).toBeGreaterThanOrEqual(70); expect(point.x).toBeLessThanOrEqual(1530);
    expect(point.y).toBeGreaterThanOrEqual(70); expect(point.y).toBeLessThanOrEqual(830);
  });

  it('allows children to explode but forbids grandchildren and shutdown triggers', () => {
    const { world, manager } = setup(PRESETS[0], () => 0.2);
    world.actors = [];
    world.emit('enemy_died', enemy());
    expect(manager.pendingCount).toBeGreaterThan(0);
    manager.tick(750);
    expect(world.spawns[0]).toMatchObject({ generation: 1, tags: ['mini'], profile: { health: 0.5, reward: 0.25 } });
    world.emit('enemy_died', enemy('mini', 1, ['mini']));
    expect(world.warnings.filter(w => w.type === 'spawn')).toHaveLength(0);
    expect(world.warnings.filter(w => w.type === 'explode')).toHaveLength(1);
    manager.tick(750); expect(world.blasts).toHaveLength(1);
    const count = manager.pendingCount;
    world.emit('enemy_died', enemy(), { reason: 'shutdown' });
    expect(manager.pendingCount).toBe(count);
  });

  it('root spawns from player damage have generation zero and arrivals stay committed', () => {
    let seed = 123;
    const { world, manager } = setup(PRESETS[4], () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; });
    world.actors = [];
    world.emit('player_damaged', world.actor);
    expect(world.warnings).toHaveLength(2);
    const point = world.warnings[0].at; world.actor = { ...world.actor, ...point };
    manager.tick(750);
    expect(world.spawns).toHaveLength(2);
    expect(world.spawns[0]).toMatchObject({ ...point, generation: 0 });
    expect(world.spawns[0].profile.reward).toBe(0.25);
  });

  it('reserves enough separation for large spawned haulers', () => {
    const samples = [0.3, 0.4, 0, 0, 0.37, 0.4, 0, 0, 0.6, 0.4, 0, 0];
    const { world, manager } = setup(definition([{ ...spawn, enemyType: 'hauler', profile: { size: 1.5 }, at: { anchor: 'arena' } }], { type: 'wave_started' }), () => samples.shift() ?? 0.9);
    world.actors = [];
    world.emit('wave_started'); manager.tick(750);
    expect(world.spawns).toHaveLength(2);
    const [a, b] = world.spawns;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(2 * 38 * 1.5);
  });

  it('installs wave-start rules before the event and never renews expired effects', () => {
    const { world, manager } = setup(PRESETS[5]);
    world.emit('wave_started');
    expect(manager.modifiers.effective('player', 'attack_interval', 450, 'player')).toBe(315);
    manager.tick(30_000);
    expect(manager.active).toBeUndefined(); expect(manager.modifiers.size).toBe(0);
    world.emit('wave_started'); expect(manager.modifiers.size).toBe(0);
  });
});

describe('bounded execution and lifetime ownership', () => {
  it.each(['manual', 'wave_end', 'death', 'restart'] as const)('cleans subscriptions, clocks, warnings and modifiers on %s', reason => {
    const { world, manager } = setup(definition([blast, modify()]));
    manager.queue(PRESETS[0]);
    world.emit('player_damaged', world.actor);
    expect(manager.pendingCount).toBe(1); expect(manager.modifiers.size).toBe(1);
    manager.clear(reason); manager.tick(10_000); world.emit('player_damaged', world.actor);
    expect(manager.pendingCount).toBe(0); expect(manager.modifiers.size).toBe(0);
    expect(manager.listenerCount).toBe(0); expect(world.warnings).toHaveLength(0); expect(world.blasts).toHaveLength(0);
    expect(world.removed).toHaveLength(reason === 'wave_end' ? 0 : 1);
    expect(Boolean(manager.queued)).toBe(reason === 'manual' || reason === 'wave_end');
  });

  it('rejects stale event ownership and prevents reentrant death callbacks from escaping cleanup', () => {
    const { world, manager } = setup(definition([blast], { type: 'enemy_died' }));
    world.emit('enemy_died', enemy(), { runId: 0 }); world.emit('enemy_died', enemy(), { wave: 2 });
    expect(manager.pendingCount).toBe(0);
    world.emit('enemy_died', enemy()); world.emit('enemy_died', enemy());
    world.onBlast = () => manager.clear('death');
    manager.tick(750);
    expect(world.blasts).toHaveLength(1); expect(manager.pendingCount).toBe(0);
    manager.tick(1000); expect(world.blasts).toHaveLength(1);
  });

  it('bounds a death/explosion chain even when every blast emits another death', () => {
    const { world, manager } = setup(definition([blast], { type: 'enemy_died' }));
    world.onBlast = request => world.emit('enemy_died', enemy(), { depth: request.depth });
    world.emit('enemy_died', enemy());
    for (let i = 0; i < 20; i++) manager.tick(750);
    expect(world.blasts).toHaveLength(RULE_LIMITS.chainDepth);
    expect(manager.pendingCount).toBe(0); expect(manager.blocked).toBeGreaterThan(0);
  });

  it('enforces cooldown and global execution budgets under a burst of events', () => {
    const input = definition([blast]);
    const { world, manager } = setup(input);
    for (let i = 0; i < 1000; i++) world.emit('player_damaged', world.actor);
    expect(manager.pendingCount).toBeLessThanOrEqual(6);
    expect(manager.blocked).toBeGreaterThan(0);
    manager.tick(750); expect(world.blasts.length).toBeLessThanOrEqual(6);
    const cooldown = setup({ ...input, rules: [{ ...input.rules[0], cooldownMs: 2000 }] });
    for (let i = 0; i < 10; i++) cooldown.world.emit('player_damaged', cooldown.world.actor);
    expect(cooldown.manager.pendingCount).toBe(1);
    cooldown.manager.tick(2000); cooldown.world.emit('player_damaged', cooldown.world.actor);
    expect(cooldown.manager.pendingCount).toBe(1);
  });

  it('caps per-frame action work and pending warning admission', () => {
    const { world, manager } = setup();
    const apply = vi.spyOn(manager.modifiers, 'apply');
    for (let i = 0; i < 1000; i++) world.emit('player_damaged', world.actor);
    expect(apply.mock.calls.length).toBe(RULE_LIMITS.actionsPerFrame);
    apply.mockClear(); manager.tick(1000);
    expect(apply.mock.calls.length).toBeLessThanOrEqual(RULE_LIMITS.actionsPerFrame);
    const rejected = setup(definition([blast]));
    rejected.world.warn = () => undefined;
    rejected.world.emit('player_damaged', rejected.world.actor);
    expect(rejected.manager.pendingCount).toBe(0);
    expect(rejected.manager.blocked).toBe(1);
  });

  it('enforces the per-wave spawn budget independently of tokens', () => {
    let seed = 11;
    const input = definition([{ ...spawn, count: 4, at: { anchor: 'arena', radius: 0 } }], { type: 'interval', everyMs: 1000 });
    const { world, manager } = setup(input, () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; });
    world.actors = [];
    for (let i = 0; i < 115; i++) manager.tick(250);
    expect(world.spawns.length).toBeGreaterThan(0);
    expect(world.spawns.length).toBe(RULE_LIMITS.waveSpawns);
    expect(manager.pendingCount).toBeLessThanOrEqual(RULE_LIMITS.pending);
    manager.clear('wave_end'); manager.beginWave(2, 45_000);
    expect(manager.active).toBeUndefined();
  });

  it('requires no ticking while paused and cleans repeated activations', () => {
    const { world, manager } = setup(definition([blast], { type: 'interval', everyMs: 1000 }));
    manager.tick(1000); const now = manager.now;
    expect(manager.now).toBe(now); expect(world.warnings).toHaveLength(1);
    for (let wave = 2; wave < 30; wave++) {
      manager.clear('wave_end'); manager.queue(PRESETS[wave % 6]); manager.beginWave(wave, 60_000);
      expect(manager.listenerCount).toBeLessThanOrEqual(2);
      manager.clear('wave_end');
      expect([...world.listeners.values()].reduce((sum, set) => sum + set.size, 0)).toBe(0);
    }
  });
});
