import { STAT_LIMITS, type Stat } from '../../shared/rules';

interface Contribution { target: string; stat: Stat; multiplier: number; expiresAt: number }

export class ModifierStore {
  private contributions = new Map<string, Contribution>();
  get size(): number { return this.contributions.size; }
  inspect(now: number) {
    return [...this.contributions].map(([key, value]) => ({ key, ...value, remainingMs: Math.max(0, value.expiresAt - now) }));
  }

  apply(key: string, value: Contribution): void { this.contributions.set(key, value); }
  tick(now: number): void {
    for (const [key, value] of this.contributions) if (value.expiresAt <= now) this.contributions.delete(key);
  }
  removeTarget(target: string): void {
    for (const [key, value] of this.contributions) if (value.target === target) this.contributions.delete(key);
  }
  clear(): void { this.contributions.clear(); }

  effective(target: string, stat: Stat, base: number, kind: 'player' | 'enemy'): number {
    let multiplier = 1;
    for (const value of this.contributions.values()) if (value.target === target && value.stat === stat) multiplier *= value.multiplier;
    const limits = STAT_LIMITS[stat] as Partial<Record<'player' | 'enemy', readonly [number, number]>>;
    const bounds = limits[kind];
    if (!bounds) return base;
    return Math.max(bounds[0], Math.min(bounds[1], base * Math.max(0.25, Math.min(3, multiplier))));
  }
}
