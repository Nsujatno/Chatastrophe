import type { EnemyKind } from '../systems/run';

export const ENEMY_DIED = 'enemy-died';

export interface EnemyDeath {
  kind: EnemyKind;
  x: number;
  y: number;
  reason: 'combat' | 'shutdown';
  scrap: number;
}
