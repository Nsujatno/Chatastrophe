import type { EnemyKind } from '../systems/run';
import type { GameEvent } from '../rules/SabotageManager';
import type { TriggerType } from '../../shared/rules';

export const ENEMY_DIED = 'enemy-died';
export const GAME_EVENTS: Record<TriggerType, string> = {
  enemy_died: ENEMY_DIED, enemy_spawned: 'enemy-spawned', player_damaged: 'player-damaged', wave_started: 'wave-started', interval: 'rule-interval',
};

export interface EnemyDeath extends GameEvent {
  kind: EnemyKind;
  x: number;
  y: number;
  reason: 'combat' | 'shutdown';
  scrap: number;
}
