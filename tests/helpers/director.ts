import { RulesetSchema } from '../../src/shared/rules.ts';

// Explicit deterministic AI fixtures, used only by the isolated test gateway.
export const DIRECTOR_FIXTURES = [
  { id: 'fixture-rapid-fire', name: 'Scrapstorm', rules: [{ id: 'shots', trigger: { type: 'wave_started' }, actions: [{ type: 'modify', target: { kind: 'player' }, stat: 'attack_interval', multiplier: 0.7, durationMs: 'wave' }] }] },
  { id: 'fixture-blasts', name: 'Hot Scrap', rules: [{ id: 'blast', trigger: { type: 'enemy_died' }, cooldownMs: 2000, actions: [{ type: 'explode', at: { anchor: 'event' }, radius: 70, damage: 8 }] }] },
  { id: 'fixture-rush', name: 'Robot Rush', rules: [{ id: 'rush', trigger: { type: 'enemy_spawned' }, actions: [{ type: 'modify', target: { kind: 'event_entity' }, stat: 'move_speed', multiplier: 1.3, durationMs: 'wave' }] }] },
].map(input => RulesetSchema.parse(input));
