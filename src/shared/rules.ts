import { z } from 'zod';

export const ENEMY_KINDS = ['hover-drone', 'skitter', 'hauler'] as const;
export type EnemyKind = typeof ENEMY_KINDS[number];
export const ENTITY_LIMITS = { enemies: 70, projectiles: 48, pickups: 140, warnings: 8, effects: 60 } as const;
export const RULE_LIMITS = {
  rules: 6, actions: 3, filters: 4, tags: 4, pending: 64, events: 128,
  actionsPerEvent: 18, actionsPerFrame: 24, eventsPerFrame: 128, chainDepth: 4, waveSpawns: 48, chaos: 32, arenaMargin: 80,
  burst: 32, refillPerSecond: 8, warningMs: 750, jsonCharacters: 32_000, offspringGenerations: 1,
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
export const TRIGGER_CONTEXTS = {
  enemy_died: { enemy: true, position: true, liveEntity: null },
  enemy_spawned: { enemy: true, position: true, liveEntity: 'enemy' },
  player_damaged: { enemy: false, position: true, liveEntity: 'player' },
  wave_started: { enemy: false, position: false, liveEntity: null },
  interval: { enemy: false, position: false, liveEntity: null },
} as const satisfies Record<TriggerType, { enemy: boolean; position: boolean; liveEntity: 'player' | 'enemy' | null }>;

const FilterSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('enemy_type'), value: kind }).strict(),
  z.object({ type: z.literal('tag'), value: label }).strict(),
  z.object({ type: z.literal('chance'), value: finite().min(0).max(1) }).strict(),
  z.object({ type: z.literal('health_below'), percent: finite().min(0).max(100) }).strict(),
]);
const ENEMY_FILTERS: readonly z.infer<typeof FilterSchema>['type'][] = ['enemy_type', 'tag'];
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
export const ACTION_COSTS = { spawn: { perUnit: 3 }, explode: { fixed: 5 }, modify: { fixed: 1 } } as const;
export function actionCost(action: Action): number {
  return action.type === 'spawn' ? action.count * ACTION_COSTS.spawn.perUnit : ACTION_COSTS[action.type].fixed;
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
    const context = TRIGGER_CONTEXTS[rule.trigger.type];
    rule.filters.forEach((filter, f) => {
      if (ENEMY_FILTERS.includes(filter.type) && !context.enemy) issue('This filter needs an enemy event', ['filters', f]);
    });
    rule.actions.forEach((action, a) => {
      cost += actionCost(action);
      const placements = action.type === 'modify' ? (action.target.kind === 'enemies' && action.target.area ? [action.target.area.at] : []) : [action.at];
      if (!context.position && placements.some(at => at.anchor === 'event')) issue('This trigger has no event position', ['actions', a]);
      if (action.type !== 'modify') return;
      let player = action.target.kind === 'player';
      if (action.target.kind === 'event_entity') {
        if (!context.liveEntity) issue('This trigger has no live event entity', ['actions', a, 'target']);
        player = context.liveEntity === 'player';
      }
      if (!(player ? PLAYER_STATS : ENEMY_STATS).includes(action.stat)) issue('Stat is incompatible with its target', ['actions', a, 'stat']);
    });
  });
  if (cost > RULE_LIMITS.chaos) ctx.addIssue({ code: 'custom', path: ['rules'], message: `Ruleset exceeds the chaos budget (${cost}/${RULE_LIMITS.chaos})` });
});
export type Ruleset = z.infer<typeof RulesetSchema>;
export type Rule = Ruleset['rules'][number];
export type RuleValidation = { ok: true; data: Ruleset } | { ok: false; errors: string[] };

export function validateRuleset(input: unknown): RuleValidation {
  // Refuse oversized collections before Zod walks their elements.
  const tooMany = (value: unknown, max: number) => Array.isArray(value) && value.length > max;
  if (input && typeof input === 'object' && 'rules' in input && Array.isArray(input.rules)) {
    if (tooMany(input.rules, RULE_LIMITS.rules)) return { ok: false, errors: [`rules: At most ${RULE_LIMITS.rules} rules are allowed`] };
    for (const [i, rule] of input.rules.entries()) {
      if (!rule || typeof rule !== 'object') continue;
      for (const [field, max] of [['actions', RULE_LIMITS.actions], ['filters', RULE_LIMITS.filters]] as const) {
        if (tooMany(rule[field], max)) return { ok: false, errors: [`rules.${i}.${field}: At most ${max} entries are allowed`] };
      }
      if (Array.isArray(rule.actions)) for (const [a, action] of rule.actions.entries()) {
        if (action && typeof action === 'object' && tooMany(action.tags, RULE_LIMITS.tags)) return { ok: false, errors: [`rules.${i}.actions.${a}.tags: At most ${RULE_LIMITS.tags} tags are allowed`] };
      }
    }
  }
  const result = RulesetSchema.safeParse(input);
  return result.success ? { ok: true, data: result.data } : {
    ok: false, errors: result.error.issues.map(issue => `${issue.path.join('.') || 'ruleset'}: ${issue.message}`),
  };
}

export function parseRuleset(json: unknown): RuleValidation {
  if (typeof json !== 'string') return { ok: false, errors: ['Rules must be supplied as JSON text.'] };
  if (json.length > RULE_LIMITS.jsonCharacters) return { ok: false, errors: [`These rules are too long. Keep them under ${RULE_LIMITS.jsonCharacters.toLocaleString('en-US')} characters.`] };
  let input: unknown;
  try { input = JSON.parse(json); }
  catch { return { ok: false, errors: ['Could not read these rules. Check the JSON punctuation.'] }; }
  return validateRuleset(input);
}

export function getRuleCatalog() {
  return {
    version: 1,
    schema: z.toJSONSchema(RulesetSchema, { io: 'input' }),
    triggers: structuredClone(TRIGGER_CONTEXTS),
    filters: FilterSchema.options.map(option => ({ type: option.shape.type.value, requiresEnemyEvent: ENEMY_FILTERS.includes(option.shape.type.value) })),
    selectors: SelectorSchema.options.map(option => option.shape.kind.value),
    anchors: [...PlacementSchema.shape.anchor.options],
    actions: structuredClone(ACTION_COSTS),
    enemyKinds: [...ENEMY_KINDS],
    stats: { player: [...PLAYER_STATS], enemy: [...ENEMY_STATS], bounds: structuredClone(STAT_LIMITS) },
    limits: { ...RULE_LIMITS },
    entityLimits: { ...ENTITY_LIMITS },
    runtimeChecks: ['unique_rule_ids', 'unique_tags', 'trigger_filter_context', 'trigger_placement_context', 'live_entity_context', 'target_stat_compatibility', 'total_action_cost'],
    lifecycle: {
      queue: 'one_next_wave_slot', activation: 'before_wave_started', expiration: 'before_shutdown_payout',
      modifierIdentity: ['owner', 'rule', 'action', 'target', 'stat'], retrigger: 'refresh',
      pause: 'freeze_gameplay_time', offspringGenerations: RULE_LIMITS.offspringGenerations, sourceIdentity: 'application_owned',
      terminal: ['death', 'restart'],
      validation: 'JSON Schema describes structure; validateRuleset must approve the complete composition before queueing.',
    },
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

export function summarizeRuleset(set: Ruleset): string[] {
  return set.rules.map(rule => {
    const enemy = rule.filters.find(filter => filter.type === 'enemy_type');
    const tag = rule.filters.find(filter => filter.type === 'tag');
    const subject = enemy?.type === 'enemy_type' ? enemyName(enemy.value) : tag?.type === 'tag' ? `${tag.value} robot` : 'robot';
    const trigger = rule.trigger.type === 'interval' ? `Every ${rule.trigger.everyMs / 1000}s` : {
      enemy_died: `${subject} destroyed`, enemy_spawned: `${subject} appears`,
      player_damaged: 'When you get hit', wave_started: 'Wave starts',
    }[rule.trigger.type];
    const conditions = rule.filters.flatMap(filter => filter.type === 'chance' ? [`${percent(filter.value)}% chance`]
      : filter.type === 'health_below' ? [`below ${filter.percent}% HP`] : []);
    const actions = rule.actions.map(action => {
      if (action.type === 'spawn') {
        const size = action.profile.size < 0.8 ? 'tiny ' : action.profile.size > 1.2 ? 'big ' : '';
        return `${action.count} ${size}${enemyName(action.enemyType)}${action.count === 1 ? '' : 's'} appear${action.count === 1 ? 's' : ''}${action.at.anchor === 'player' ? ' near you' : ''}`;
      }
      if (action.type === 'explode') return `explosion (${action.damage} damage)`;
      const target = action.target;
      const who = target.kind === 'player' || (target.kind === 'event_entity' && rule.trigger.type === 'player_damaged') ? 'you'
        : target.kind === 'event_entity' ? 'it' : `${target.area ? 'nearby ' : ''}${target.enemyType ? enemyName(target.enemyType) + 's' : 'robots'}`;
      const amount = percent(action.multiplier - 1);
      const effect = {
        move_speed: `${amount}% ${action.multiplier > 1 ? 'faster movement' : 'slower movement'}`,
        projectile_damage: `${amount}% ${action.multiplier > 1 ? 'more' : 'less'} shot damage`,
        attack_interval: `${percent(1 / action.multiplier - 1)}% ${action.multiplier < 1 ? 'faster' : 'slower'} shooting`,
        contact_damage: `${amount}% ${action.multiplier > 1 ? 'harder' : 'weaker'} hits`,
        size: `${amount}% ${action.multiplier > 1 ? 'bigger' : 'smaller'}`,
      }[action.stat];
      return `${who}: ${effect}${action.durationMs === 'wave' ? '' : ` for ${action.durationMs / 1000}s`}`;
    });
    return `${trigger}${conditions.length ? ` (${conditions.join(', ')})` : ''} → ${actions.join(' + ')}`;
  });
}
