import type { BlastRequest, GameEvent, Point, RuleEntity, RuleWorld, SpawnRequest } from '../../src/game/rules/SabotageManager';
import type { TriggerType } from '../../src/shared/rules';

export const enemy = (id = 'robot', generation = 0, tags: string[] = []): RuleEntity => ({ id, generation, tags, kind: 'hover-drone', x: 500, y: 400, radius: 20 });

export class World implements RuleWorld {
  bounds = { width: 1600, height: 900 };
  actor: RuleEntity = { id: 'player', kind: 'player', x: 1000, y: 700, tags: [], generation: 0, radius: 20 };
  actors: RuleEntity[] = [enemy()];
  health = 40;
  listeners = new Map<TriggerType, Set<(e: GameEvent) => void>>();
  warnings: { type: string; at: Point; radius: number }[] = [];
  spawns: SpawnRequest[] = [];
  blasts: BlastRequest[] = [];
  removed: string[] = [];
  onBlast?: (request: BlastRequest) => void;
  onSpawn?: (request: SpawnRequest) => void;
  player = () => this.actor;
  enemies = () => this.actors;
  healthPercent = () => this.health;
  subscribe(type: TriggerType, handler: (e: GameEvent) => void) {
    const handlers = this.listeners.get(type) ?? new Set();
    this.listeners.set(type, handlers); handlers.add(handler);
    return () => { handlers.delete(handler); };
  }
  warn(type: 'spawn' | 'explode', at: Point, radius: number): (() => void) | undefined {
    const warning = { type, at, radius };
    this.warnings.push(warning);
    return () => { this.warnings = this.warnings.filter(w => w !== warning); };
  }
  spawn(request: SpawnRequest) { this.spawns.push(request); this.onSpawn?.(request); }
  explode(request: BlastRequest) { this.blasts.push(request); this.onBlast?.(request); }
  removeOwned(owner: string) { this.removed.push(owner); }
  emit(type: TriggerType, subject?: RuleEntity, extra: Partial<GameEvent> = {}) {
    const event: GameEvent = { type, runId: 1, wave: 1, depth: 0, subject, position: subject ? { x: subject.x, y: subject.y } : undefined, ...extra };
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }
}

