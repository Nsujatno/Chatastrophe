import { validateRuleset, type Ruleset } from '../../shared/rules';

const definitions: unknown[] = [
  { id: 'chain-reaction', name: 'Chain Reaction', rules: [
    { id: 'split', trigger: { type: 'enemy_died' }, filters: [{ type: 'enemy_type', value: 'hover-drone' }, { type: 'chance', value: 0.4 }], actions: [
      { type: 'spawn', enemyType: 'hover-drone', count: 2, at: { anchor: 'event', radius: 90 }, profile: { health: 0.5, size: 0.6, damage: 0.5, reward: 0.25 }, tags: ['mini'] },
    ] },
    { id: 'mini-blast', trigger: { type: 'enemy_died' }, filters: [{ type: 'tag', value: 'mini' }], actions: [
      { type: 'explode', at: { anchor: 'event' }, radius: 70, damage: 8 },
    ] },
  ] },
  { id: 'panic-mode', name: 'Panic Mode', rules: [
    { id: 'rush', trigger: { type: 'player_damaged' }, cooldownMs: 500, actions: [
      { type: 'modify', target: { kind: 'enemies', area: { at: { anchor: 'event' }, radius: 300 } }, stat: 'move_speed', multiplier: 1.5, durationMs: 4000 },
    ] },
  ] },
  { id: 'heavy-metal', name: 'Heavy Metal', rules: [
    { id: 'heavy', trigger: { type: 'enemy_spawned' }, filters: [{ type: 'enemy_type', value: 'hauler' }], actions: [
      { type: 'modify', target: { kind: 'event_entity' }, stat: 'size', multiplier: 1.5, durationMs: 'wave' },
      { type: 'modify', target: { kind: 'event_entity' }, stat: 'move_speed', multiplier: 0.7, durationMs: 'wave' },
      { type: 'modify', target: { kind: 'event_entity' }, stat: 'contact_damage', multiplier: 1.4, durationMs: 'wave' },
    ] },
  ] },
  { id: 'reactor-pulses', name: 'Reactor Pulses', rules: [
    { id: 'pulse', trigger: { type: 'interval', everyMs: 5000 }, actions: [
      { type: 'explode', at: { anchor: 'player', radius: 90 }, radius: 80, damage: 10 },
    ] },
  ] },
  { id: 'distress-signal', name: 'Distress Signal', rules: [
    { id: 'reinforce', trigger: { type: 'player_damaged' }, cooldownMs: 2500, actions: [
      { type: 'spawn', enemyType: 'skitter', count: 2, at: { anchor: 'event', radius: 170 }, profile: { health: 0.5, size: 0.7, damage: 0.5, reward: 0.25 }, tags: ['reinforcement'] },
    ] },
  ] },
  { id: 'glass-cannon', name: 'Glass Cannon', rules: [
    { id: 'rapid-fire', trigger: { type: 'wave_started' }, actions: [
      { type: 'modify', target: { kind: 'player' }, stat: 'attack_interval', multiplier: 0.7, durationMs: 'wave' },
    ] },
    { id: 'hard-hits', trigger: { type: 'enemy_spawned' }, actions: [
      { type: 'modify', target: { kind: 'event_entity' }, stat: 'contact_damage', multiplier: 1.4, durationMs: 'wave' },
    ] },
  ] },
];

export const PRESETS: readonly Ruleset[] = definitions.map(definition => {
  const result = validateRuleset(definition);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.data;
});
