import type { EnemyKind } from '../../shared/rules';
export type { EnemyKind } from '../../shared/rules';
export type Phase = 'ready' | 'playing' | 'settling' | 'shop' | 'lost';
export type Upgrade = 'damage' | 'attackSpeed' | 'movementSpeed';
export type Facing = 'down' | 'left' | 'right' | 'up';

export const WAVES: readonly { durationMs: number; spawnMs: number; mix: readonly EnemyKind[] }[] = [
  { durationMs: 30_000, spawnMs: 950, mix: ['hover-drone'] },
  { durationMs: 45_000, spawnMs: 650, mix: ['hover-drone', 'hover-drone', 'skitter'] },
  { durationMs: 60_000, spawnMs: 480, mix: ['hover-drone', 'hover-drone', 'skitter', 'skitter', 'hauler'] },
];

export const ENEMIES: Record<EnemyKind, { health: number; speed: number; width: number; radius: number; damage: number; scrap: number }> = {
  'hover-drone': { health: 18, speed: 74, width: 72, radius: 20, damage: 12, scrap: 4 },
  skitter: { health: 10, speed: 144, width: 80, radius: 22, damage: 10, scrap: 6 },
  hauler: { health: 72, speed: 46, width: 126, radius: 38, damage: 20, scrap: 12 },
};

export { ENTITY_LIMITS as LIMITS } from '../../shared/rules';
export const SPAWN = { warningMs: 750, safeDistance: 320, margin: 70 } as const;
export const WEAPON = { range: 520, speed: 620, lifetimeMs: 1400 } as const;
export const PROGRESSION = { minSpawnMs: 220, maxHealth: 3, damage: 120, attackMs: 150, speed: 360 } as const;

export interface Point { x: number; y: number }

export function movement(x: number, y: number, speed: number): Point {
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length * speed, y: y / length * speed };
}

export function nearest<T extends Point>(origin: Point, candidates: readonly T[], range: number): T | undefined {
  let best: T | undefined;
  let bestDistance = range * range;
  for (const candidate of candidates) {
    const distance = (candidate.x - origin.x) ** 2 + (candidate.y - origin.y) ** 2;
    if (distance <= bestDistance) { best = candidate; bestDistance = distance; }
  }
  return best;
}

export function safeSpawn(position: Point, player: Point): boolean {
  return Math.hypot(position.x - player.x, position.y - player.y) >= SPAWN.safeDistance;
}

export function scrapValue(kind: EnemyKind, reason: 'combat' | 'shutdown'): number {
  return ENEMIES[kind].scrap * (reason === 'combat' ? 1 : 0.5);
}

export class Run {
  phase: Phase = 'ready';
  wave = 0;
  health = 100;
  readonly maxHealth = 100;
  scrap = 0;
  kills = 0;
  earned = 0;
  remainingMs = WAVES[0].durationMs;
  elapsedMs = 0;
  invulnerableUntil = 0;
  damage = 12;
  attackMs = 450;
  speed = 260;
  purchased?: Upgrade;
  upgrades: Record<Upgrade, number> = { damage: 0, attackSpeed: 0, movementSpeed: 0 };

  get waveConfig() {
    const opening = WAVES[Math.min(this.wave, WAVES.length - 1)];
    const extra = Math.max(0, this.wave - 2);
    return { ...opening, spawnMs: Math.max(PROGRESSION.minSpawnMs, opening.spawnMs - extra * 25), healthMultiplier: Math.min(PROGRESSION.maxHealth, 1 + extra * 0.12) };
  }
  get upgradeCost(): number { return 60 + this.wave * 30; }
  get invulnerable(): boolean { return this.elapsedMs < this.invulnerableUntil; }
  maxed(upgrade: Upgrade): boolean {
    return upgrade === 'damage' ? this.damage >= PROGRESSION.damage : upgrade === 'attackSpeed' ? this.attackMs <= PROGRESSION.attackMs : this.speed >= PROGRESSION.speed;
  }

  startWave(): boolean {
    if (this.phase !== 'ready' && this.phase !== 'shop') return false;
    if (this.phase === 'shop') this.wave++;
    this.phase = 'playing';
    this.remainingMs = this.waveConfig.durationMs;
    this.invulnerableUntil = 0;
    this.purchased = undefined;
    return true;
  }

  tick(deltaMs: number): boolean {
    if (this.phase !== 'playing' || !Number.isFinite(deltaMs) || deltaMs <= 0) return false;
    const elapsed = Math.min(deltaMs, this.remainingMs);
    this.elapsedMs += elapsed;
    this.remainingMs = Math.max(0, this.remainingMs - elapsed);
    if (this.remainingMs === 0) this.phase = 'settling';
    return this.phase === 'settling';
  }

  hurt(amount: number): boolean {
    if (this.phase !== 'playing' || this.invulnerable || !Number.isFinite(amount) || amount <= 0) return false;
    this.health = Math.max(0, this.health - amount);
    this.invulnerableUntil = this.elapsedMs + 1000;
    if (this.health === 0) this.phase = 'lost';
    return true;
  }

  collect(value: number): void {
    if ((this.phase !== 'playing' && this.phase !== 'settling') || !Number.isFinite(value) || value <= 0) return;
    this.scrap += value;
    this.earned += value;
  }

  finishWave(): boolean {
    if (this.phase !== 'settling') return false;
    this.phase = 'shop';
    this.health = this.maxHealth;
    return true;
  }

  buy(upgrade: Upgrade): boolean {
    if (this.phase !== 'shop' || this.purchased || this.scrap < this.upgradeCost) return false;
    if (!Object.hasOwn(this.upgrades, upgrade)) return false;
    if (this.maxed(upgrade)) return false;
    this.scrap -= this.upgradeCost;
    this.purchased = upgrade;
    this.upgrades[upgrade]++;
    if (upgrade === 'damage') this.damage = Math.min(PROGRESSION.damage, this.damage + 6);
    if (upgrade === 'attackSpeed') this.attackMs = Math.max(PROGRESSION.attackMs, this.attackMs * 0.75);
    if (upgrade === 'movementSpeed') this.speed = Math.min(PROGRESSION.speed, this.speed * 1.15);
    return true;
  }
}
