import { RULE_LIMITS, actionCost, describeRuleset, validateRuleset, type Action, type EnemyKind, type Placement, type Rule, type Ruleset, type Selector, type SpawnProfile, type TriggerType } from '../../shared/rules';
import { ModifierStore } from './ModifierStore';

export interface Point { x: number; y: number }
export interface RuleEntity extends Point {
  id: string; kind: EnemyKind | 'player'; tags: readonly string[]; generation: number; radius: number;
}
export interface GameEvent {
  type: TriggerType; runId: number; wave: number; depth: number;
  subject?: RuleEntity; position?: Point; reason?: 'combat' | 'shutdown';
  damage?: number; health?: number;
}
export interface SpawnRequest extends Point { kind: EnemyKind; profile: SpawnProfile; tags: string[]; generation: number; owner: string; depth: number }
export interface BlastRequest extends Point { radius: number; damage: number; owner: string; depth: number }
export interface RuleWorld {
  bounds: { width: number; height: number };
  player(): RuleEntity;
  enemies(): RuleEntity[];
  healthPercent(): number;
  subscribe(type: TriggerType, handler: (event: GameEvent) => void): () => void;
  warn(type: 'spawn' | 'explode', at: Point, radius: number): (() => void) | undefined;
  spawn(request: SpawnRequest): void;
  explode(request: BlastRequest): void;
  removeOwned(owner: string): void;
}
interface Pending { due: number; owner: string; type: 'spawn' | 'explode'; point: Point; radius: number; cancel: () => void; run: () => void }
interface Active { data: Ruleset; owner: string; deadline: number }

export class SabotageManager {
  readonly modifiers = new ModifierStore();
  active?: Active;
  queued?: { data: Ruleset; wave: number };
  errors: string[] = [];
  revision = 0;
  wave = 0;
  now = 0;
  blocked = 0;
  private activeWave = false;
  private pending: Pending[] = [];
  private events: GameEvent[] = [];
  private off: (() => void)[] = [];
  private intervals = new Map<string, number>();
  private lastTrigger = new Map<string, number>();
  private processing = false;
  private frameActions: number = RULE_LIMITS.actionsPerFrame;
  private tokens: number = RULE_LIMITS.burst;
  private spawned = 0;

  constructor(readonly runId: number, private world: RuleWorld, private random: () => number = Math.random) {}
  get pendingCount(): number { return this.pending.length; }
  get listenerCount(): number { return this.off.length; }
  inspectPending() { return this.pending.map(p => ({ type: p.type, owner: p.owner, ...p.point, radius: p.radius, remainingMs: Math.max(0, p.due - this.now) })); }
  get remainingMs(): number { return this.active ? Math.max(0, this.active.deadline - this.now) : 0; }
  preview(input: unknown) {
    const result = validateRuleset(input);
    return result.ok ? { ...result, changes: describeRuleset(result.data) } : result;
  }

  queue(input: unknown, target = { runId: this.runId, wave: this.wave + 1 }): boolean {
    if (target.runId !== this.runId || target.wave !== this.wave + 1) return this.reject('Stale run/wave: queue changes for the next wave only.');
    const result = validateRuleset(input);
    if (!result.ok) { this.errors = result.errors; this.revision++; return false; }
    this.queued = { data: result.data, wave: target.wave };
    this.errors = []; this.revision++;
    return true;
  }

  beginWave(wave: number, durationMs: number): boolean {
    if (this.activeWave || wave !== this.wave + 1 || !Number.isFinite(durationMs) || durationMs <= 0) return this.reject('Duplicate or stale wave activation.');
    this.wave = wave;
    this.activeWave = true;
    this.now = 0; this.tokens = RULE_LIMITS.burst; this.spawned = 0; this.frameActions = RULE_LIMITS.actionsPerFrame;
    const queued = this.queued;
    this.queued = undefined;
    if (queued?.wave === wave) {
      this.active = { data: queued.data, owner: `${this.runId}:${wave}`, deadline: durationMs };
      for (const type of new Set(queued.data.rules.map(rule => rule.trigger.type))) {
        if (type !== 'interval') this.off.push(this.world.subscribe(type, event => this.receive(event)));
      }
      for (const rule of queued.data.rules) if (rule.trigger.type === 'interval') this.intervals.set(rule.id, rule.trigger.everyMs);
    }
    this.revision++;
    return true;
  }

  tick(deltaMs: number): void {
    if (!this.activeWave || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.now += deltaMs;
    this.frameActions = RULE_LIMITS.actionsPerFrame;
    this.tokens = Math.min(RULE_LIMITS.burst, this.tokens + deltaMs / 1000 * RULE_LIMITS.refillPerSecond);
    this.modifiers.tick(this.now);
    if (!this.active) return;
    if (this.now >= this.active.deadline) { this.clear('wave_end'); return; }
    for (const pending of [...this.pending]) {
      const index = this.pending.indexOf(pending);
      if (pending.due > this.now || index < 0 || this.frameActions <= 0) continue;
      this.pending.splice(index, 1);
      pending.cancel();
      if (pending.owner === this.active?.owner) { this.frameActions--; pending.run(); }
    }
    for (const rule of this.active?.data.rules ?? []) {
      if (rule.trigger.type !== 'interval' || this.now < (this.intervals.get(rule.id) ?? Infinity)) continue;
      this.intervals.set(rule.id, this.now + rule.trigger.everyMs);
      this.enqueue({ type: 'interval', runId: this.runId, wave: this.wave, depth: 0 }, rule);
    }
    this.drain();
  }

  clear(reason: 'manual' | 'wave_end' | 'death' | 'restart' = 'manual'): void {
    const owner = this.active?.owner;
    this.active = undefined;
    for (const off of this.off) off();
    this.off = [];
    for (const pending of this.pending) pending.cancel();
    this.pending = []; this.events = []; this.intervals.clear(); this.lastTrigger.clear(); this.modifiers.clear();
    if (owner && reason !== 'wave_end') this.world.removeOwned(owner);
    if (reason !== 'manual') this.activeWave = false;
    if (reason === 'death' || reason === 'restart') this.queued = undefined;
    this.revision++;
  }

  discardQueue(): void { this.queued = undefined; this.errors = []; this.revision++; }
  forgetEntity(id: string): void { this.modifiers.removeTarget(id); }

  private reject(message: string): false { this.errors = [message]; this.revision++; return false; }
  private receive(event: GameEvent): void {
    this.enqueue(event);
    this.drain();
  }
  private enqueue(event: GameEvent, onlyRule?: Rule): void {
    if (!this.active || event.runId !== this.runId || event.wave !== this.wave || event.depth > RULE_LIMITS.chainDepth || event.reason === 'shutdown') return;
    if (this.events.length >= RULE_LIMITS.events) { this.blocked++; return; }
    if (onlyRule) this.intervalEvents.set(event, onlyRule.id);
    this.events.push(event);
  }
  private intervalEvents = new WeakMap<GameEvent, string>();

  private drain(): void {
    if (this.processing || !this.active) return;
    this.processing = true;
    try {
      while (this.active && this.events.length && this.frameActions > 0) {
        const event = this.events.shift()!;
        const active: Active = this.active;
        let eventActions = 0;
        for (const rule of active.data.rules) {
          if (this.active !== active) break;
          if (rule.trigger.type !== event.type || (event.type === 'interval' && this.intervalEvents.get(event) !== rule.id)) continue;
          if (this.now - (this.lastTrigger.get(rule.id) ?? -Infinity) < rule.cooldownMs || !this.matches(rule, event)) continue;
          this.lastTrigger.set(rule.id, this.now);
          for (const [index, action] of rule.actions.entries()) {
            if (this.active !== active) break;
            const cost = actionCost(action);
            if (this.frameActions <= 0 || eventActions >= RULE_LIMITS.actionsPerEvent || this.tokens < cost) { this.blocked++; continue; }
            eventActions++;
            this.frameActions--; this.tokens -= cost;
            this.execute(action, event, `${active.owner}:${rule.id}:${index}`);
          }
        }
      }
    } finally { this.processing = false; }
  }

  private matches(rule: Rule, event: GameEvent): boolean {
    return rule.filters.every(filter => {
      if (filter.type === 'enemy_type') return event.subject?.kind === filter.value;
      if (filter.type === 'tag') return event.subject?.tags.includes(filter.value) ?? false;
      if (filter.type === 'chance') return this.random() < filter.value;
      return this.world.healthPercent() < filter.percent;
    });
  }

  private position(at: Placement, event: GameEvent): Point | undefined {
    const margin = RULE_LIMITS.arenaMargin;
    const center = at.anchor === 'event' ? event.position : at.anchor === 'player' ? this.world.player() : {
      x: margin + this.random() * (this.world.bounds.width - margin * 2), y: margin + this.random() * (this.world.bounds.height - margin * 2),
    };
    if (!center) return;
    const angle = this.random() * Math.PI * 2;
    const distance = Math.sqrt(this.random()) * at.radius;
    return {
      x: Math.max(margin, Math.min(this.world.bounds.width - margin, center.x + Math.cos(angle) * distance)),
      y: Math.max(margin, Math.min(this.world.bounds.height - margin, center.y + Math.sin(angle) * distance)),
    };
  }

  private targets(selector: Selector, event: GameEvent): RuleEntity[] {
    if (selector.kind === 'player') return [this.world.player()];
    const enemies = this.world.enemies();
    if (selector.kind === 'event_entity') {
      if (event.subject?.kind === 'player') return [this.world.player()];
      return enemies.filter(enemy => enemy.id === event.subject?.id);
    }
    const center = selector.area ? this.position(selector.area.at, event) : undefined;
    return enemies.filter(enemy => (!selector.enemyType || enemy.kind === selector.enemyType)
      && (!selector.tag || enemy.tags.includes(selector.tag))
      && (!selector.area || (center && Math.hypot(enemy.x - center.x, enemy.y - center.y) <= selector.area.radius)));
  }

  private schedule(type: 'spawn' | 'explode', point: Point, radius: number, run: (owner: string) => void): boolean {
    if (!this.active || this.pending.length >= RULE_LIMITS.pending) { this.blocked++; return false; }
    const owner = this.active.owner;
    const cancel = this.world.warn(type, point, radius);
    if (!cancel) { this.blocked++; return false; }
    this.pending.push({ owner, type, point, radius, due: this.now + RULE_LIMITS.warningMs, cancel, run: () => run(owner) });
    return true;
  }

  private execute(action: Action, event: GameEvent, key: string): void {
    if (!this.active) return;
    if (action.type === 'modify') {
      for (const entity of this.targets(action.target, event)) {
        this.modifiers.apply(`${key}:${entity.id}:${action.stat}`, {
          target: entity.id, stat: action.stat, multiplier: action.multiplier,
          expiresAt: Math.min(this.active.deadline, action.durationMs === 'wave' ? this.active.deadline : this.now + action.durationMs),
        });
      }
      this.revision++;
      return;
    }
    const depth = event.depth + 1;
    if (depth > RULE_LIMITS.chainDepth) { this.blocked++; return; }
    if (action.type === 'explode') {
      const point = this.position(action.at, event);
      if (point) this.schedule('explode', point, action.radius, owner => this.world.explode({ ...point, radius: action.radius, damage: action.damage, depth, owner }));
      return;
    }
    const generation = event.subject && event.subject.kind !== 'player' ? event.subject.generation + 1 : 0;
    if (generation > 1) { this.blocked++; return; }
    const player = this.world.player();
    for (let i = 0; i < action.count; i++) {
      if (this.spawned >= RULE_LIMITS.waveSpawns || this.pending.length >= RULE_LIMITS.pending) { this.blocked++; break; }
      for (let attempt = 0; attempt < 20; attempt++) {
        const point = this.position(action.at, event);
        const clearance = 2 * 40 * action.profile.size + 12;
        if (!point || Math.hypot(point.x - player.x, point.y - player.y) < player.radius + clearance) continue;
        if (this.world.enemies().some(enemy => Math.hypot(enemy.x - point.x, enemy.y - point.y) < enemy.radius + clearance / 2)) continue;
        if (this.pending.some(p => p.type === 'spawn' && Math.hypot(p.point.x - point.x, p.point.y - point.y) < (p.radius + clearance) / 2)) continue;
        if (this.schedule('spawn', point, clearance, owner => this.world.spawn({ ...point, owner, kind: action.enemyType, profile: action.profile, tags: action.tags, generation, depth }))) {
          this.spawned++;
        }
        break;
      }
    }
  }
}
