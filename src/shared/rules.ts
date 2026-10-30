import { z } from 'zod';

export const ENEMY_KINDS = ['hover-drone', 'skitter', 'hauler'] as const;
export type EnemyKind = typeof ENEMY_KINDS[number];
export const RULE_LIMITS = {
  rules: 6, actions: 3, filters: 4, tags: 4, pending: 64, events: 128,
  actionsPerEvent: 18, actionsPerFrame: 24, chainDepth: 4, waveSpawns: 48, chaos: 32, arenaMargin: 80,
  burst: 32, refillPerSecond: 8, warningMs: 750,
} as const;

export const STAT_LIMITS = {
  move_speed: { player: [100, 460], enemy: [25, 280] },
  projectile_damage: { player: [3, 180] },
  attack_interval: { player: [100, 1200] },
  contact_damage: { enemy: [2, 45] },
  size: { enemy: [0.4, 2] },
} as const;
export type Stat = keyof typeof STAT_LIMITS;
export const PLAYER_STATS: readonly Stat[] = ['move_speed', 'projectile_damage', 'attack_interval'];
export const ENEMY_STATS: readonly Stat[] = ['move_speed', 'contact_damage', 'size'];

const label = z.string().min(1).max(32).regex(/^[a-z][a-z0-9_-]*$/);
const finite = () => z.number().finite();
const kind = z.enum(ENEMY_KINDS);
export const PlacementSchema = z.object({
  anchor: z.enum(['event', 'player', 'arena']),
  radius: finite().min(0).max(400).default(0),
}).strict();
export const SpawnProfileSchema = z.object({
  health: finite().min(0.25).max(3).default(1),
  speed: finite().min(0.5).max(1.5).default(1),
  damage: finite().min(0.25).max(2).default(1),
  size: finite().min(0.4).max(1.5).default(1),
  reward: finite().min(0).max(1).default(0.5),
}).strict();
export type SpawnProfile = z.infer<typeof SpawnProfileSchema>;
export const DEFAULT_PROFILE: SpawnProfile = { health: 1, speed: 1, damage: 1, size: 1, reward: 1 };

const TriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('enemy_died') }).strict(),
  z.object({ type: z.literal('enemy_spawned') }).strict(),
  z.object({ type: z.literal('player_damaged') }).strict(),
  z.object({ type: z.literal('wave_started') }).strict(),
  z.object({ type: z.literal('interval'), everyMs: finite().int().min(1000).max(60_000) }).strict(),
]);
export type TriggerType = z.infer<typeof TriggerSchema>['type'];

const FilterSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('enemy_type'), value: kind }).strict(),
  z.object({ type: z.literal('tag'), value: label }).strict(),
  z.object({ type: z.literal('chance'), value: finite().min(0).max(1) }).strict(),
  z.object({ type: z.literal('health_below'), percent: finite().min(0).max(100) }).strict(),
]);
const SelectorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('player') }).strict(),
  z.object({ kind: z.literal('event_entity') }).strict(),
  z.object({
    kind: z.literal('enemies'), enemyType: kind.optional(), tag: label.optional(),
    area: z.object({ at: PlacementSchema, radius: finite().min(30).max(600) }).strict().optional(),
  }).strict(),
]);
export type Selector = z.infer<typeof SelectorSchema>;
const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('spawn'), enemyType: kind, count: finite().int().min(1).max(4),
    at: PlacementSchema, profile: SpawnProfileSchema,
    tags: z.array(label).max(RULE_LIMITS.tags).refine(tags => new Set(tags).size === tags.length, 'Tags must be unique').default([]),
  }).strict(),
  z.object({
    type: z.literal('explode'), at: PlacementSchema,
    radius: finite().min(30).max(120), damage: finite().min(1).max(30),
  }).strict(),
  z.object({
    type: z.literal('modify'), target: SelectorSchema,
    stat: z.enum(['move_speed', 'projectile_damage', 'attack_interval', 'contact_damage', 'size']),
    multiplier: finite().min(0.5).max(2),
    durationMs: z.union([z.literal('wave'), finite().int().min(250).max(15_000)]),
  }).strict(),
]);
export type Action = z.infer<typeof ActionSchema>;
export type Placement = z.infer<typeof PlacementSchema>;
export function actionCost(action: Action): number {
  return action.type === 'spawn' ? action.count * 3 : action.type === 'explode' ? 5 : 1;
}

const RuleSchema = z.object({
  id: label, trigger: TriggerSchema,
  filters: z.array(FilterSchema).max(RULE_LIMITS.filters).default([]),
  actions: z.array(ActionSchema).min(1).max(RULE_LIMITS.actions),
  cooldownMs: finite().int().min(0).max(60_000).default(0),
}).strict();
export const RulesetSchema = z.object({
  id: label, name: z.string().trim().min(1).max(48),
  rules: z.array(RuleSchema).min(1).max(RULE_LIMITS.rules),
}).strict().superRefine((set, ctx) => {
  const ids = new Set<string>();
  let cost = 0;
  set.rules.forEach((rule, index) => {
    const issue = (message: string, tail: (string | number)[] = []) => ctx.addIssue({ code: 'custom', message, path: ['rules', index, ...tail] });
    if (ids.has(rule.id)) issue('Rule IDs must be unique', ['id']);
    ids.add(rule.id);
    const enemyEvent = rule.trigger.type === 'enemy_died' || rule.trigger.type === 'enemy_spawned';
    const hasPosition = enemyEvent || rule.trigger.type === 'player_damaged';
    rule.filters.forEach((filter, f) => {
      if ((filter.type === 'enemy_type' || filter.type === 'tag') && !enemyEvent) issue('This filter needs an enemy event', ['filters', f]);
    });
    rule.actions.forEach((action, a) => {
      cost += actionCost(action);
      const placements = action.type === 'modify' ? (action.target.kind === 'enemies' && action.target.area ? [action.target.area.at] : []) : [action.at];
      if (!hasPosition && placements.some(at => at.anchor === 'event')) issue('This trigger has no event position', ['actions', a]);
      if (action.type !== 'modify') return;
      let player = action.target.kind === 'player';
      if (action.target.kind === 'event_entity') {
        if (rule.trigger.type !== 'enemy_spawned' && rule.trigger.type !== 'player_damaged') issue('This trigger has no live event entity', ['actions', a, 'target']);
        player = rule.trigger.type === 'player_damaged';
      }
      if (!(player ? PLAYER_STATS : ENEMY_STATS).includes(action.stat)) issue('Stat is incompatible with its target', ['actions', a, 'stat']);
    });
  });
  if (cost > RULE_LIMITS.chaos) ctx.addIssue({ code: 'custom', path: ['rules'], message: `Ruleset exceeds the chaos budget (${cost}/${RULE_LIMITS.chaos})` });
});
export type Ruleset = z.infer<typeof RulesetSchema>;
export type Rule = Ruleset['rules'][number];

export function validateRuleset(input: unknown): { ok: true; data: Ruleset } | { ok: false; errors: string[] } {
  const result = RulesetSchema.safeParse(input);
  return result.success ? { ok: true, data: result.data } : {
    ok: false, errors: result.error.issues.map(issue => `${issue.path.join('.') || 'ruleset'}: ${issue.message}`),
  };
}

const enemyName = (kind: EnemyKind) => kind.replaceAll('-', ' ');
const percent = (ratio: number) => Math.round(Math.abs(ratio) * 100);
const seconds = (ms: number) => `${ms / 1000} ${ms === 1000 ? 'second' : 'seconds'}`;
const where = (at: Placement) => at.anchor === 'arena' ? 'somewhere in the arena' : at.anchor === 'player' ? (at.radius ? 'near you' : 'where you are standing') : (at.radius ? 'near that spot' : 'at that spot');

function describeModifier(action: Extract<Action, { type: 'modify' }>, trigger: TriggerType): string {
  const target = action.target;
  const subject = target.kind === 'player' || (target.kind === 'event_entity' && trigger === 'player_damaged') ? 'you'
    : target.kind === 'event_entity' ? 'it'
      : `${target.area ? 'nearby ' : ''}${target.enemyType ? enemyName(target.enemyType) + 's' : 'robots'}${target.tag ? ` marked ${target.tag}` : ''}`;
  const verb = (word: string) => subject === 'it' ? `${word}s` : word;
  const multiplier = action.multiplier;
  const change = percent(multiplier - 1);
  let text: string;
  switch (action.stat) {
    case 'attack_interval': text = `${subject} ${verb('shoot')} ${percent(1 / multiplier - 1)}% ${multiplier < 1 ? 'faster' : 'slower'}`; break;
    case 'projectile_damage': text = `${subject} ${verb('deal')} ${change}% ${multiplier > 1 ? 'more' : 'less'} damage per shot`; break;
    case 'move_speed': text = `${subject} ${verb('move')} ${change}% ${multiplier > 1 ? 'faster' : 'slower'}`; break;
    case 'size': text = `${subject} ${verb('become')} ${change}% ${multiplier > 1 ? 'bigger' : 'smaller'}`; break;
    case 'contact_damage': text = `${subject === 'it' ? 'its' : subject === 'you' ? 'your' : subject + "'"} hits hurt ${change}% ${multiplier > 1 ? 'more' : 'less'}`; break;
  }
  return `${text} for ${action.durationMs === 'wave' ? 'this wave' : seconds(action.durationMs)}`;
}

function describeSpawn(action: Extract<Action, { type: 'spawn' }>): string {
  const profile = action.profile;
  const details: string[] = [];
  if (profile.health !== 1) details.push(`${percent(profile.health - 1)}% ${profile.health > 1 ? 'more' : 'less'} health`);
  if (profile.speed !== 1) details.push(`${percent(profile.speed - 1)}% ${profile.speed > 1 ? 'faster' : 'slower'}`);
  if (profile.damage !== 1) details.push(`${percent(profile.damage - 1)}% ${profile.damage > 1 ? 'stronger' : 'weaker'} hits`);
  if (profile.size !== 1) details.push(`${percent(profile.size - 1)}% ${profile.size > 1 ? 'bigger' : 'smaller'}`);
  if (profile.reward !== 1) details.push(`drop ${percent(profile.reward - 1)}% less scrap`);
  if (action.tags.length) details.push(`marked ${action.tags.join(' and ')}`);
  return `after a warning, ${action.count} ${enemyName(action.enemyType)}${action.count === 1 ? ' appears' : 's appear'} ${where(action.at)}${details.length ? ` (${details.join(', ')})` : ''}`;
}

export function describeRuleset(set: Ruleset): string[] {
  return set.rules.map(rule => {
    const type = rule.filters.find(filter => filter.type === 'enemy_type');
    const tags = rule.filters.filter(filter => filter.type === 'tag');
    const robot = `${type?.type === 'enemy_type' ? enemyName(type.value) : 'robot'}${tags.length ? ` marked ${tags.map(tag => tag.value).join(' and ')}` : ''}`;
    const trigger = rule.trigger.type === 'interval' ? `Every ${seconds(rule.trigger.everyMs)}` : {
      enemy_died: `When a ${robot} is destroyed`, enemy_spawned: `When a ${robot} appears`, player_damaged: 'When you get hurt', wave_started: 'When the wave starts',
    }[rule.trigger.type];
    const conditions = rule.filters.flatMap(filter => filter.type === 'chance' ? [`${percent(filter.value)}% chance`]
      : filter.type === 'health_below' ? [`only below ${filter.percent}% health`]
        : filter.type === 'enemy_type' && filter !== type ? [`also a ${enemyName(filter.value)}`] : []);
    const actions = rule.actions.map(action => {
      if (action.type === 'spawn') return describeSpawn(action);
      if (action.type === 'explode') return `after a warning, an explosion ${where(action.at)} deals ${action.damage} damage to you and nearby robots`;
      return describeModifier(action, rule.trigger.type);
    });
    return `${trigger}${conditions.length ? ` (${conditions.join(', ')})` : ''}, ${actions.join('; ')}.${rule.cooldownMs ? ` At most once every ${seconds(rule.cooldownMs)}.` : ''}`;
  });
}
