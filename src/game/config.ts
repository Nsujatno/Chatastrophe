import Phaser from 'phaser';
import { ARENA, PAPER, VIEW } from './settings';
import { ArenaScene } from './scenes/ArenaScene';

export function createGameConfig(): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: 'game-container',
    backgroundColor: PAPER,
    antialias: true,
    pixelArt: false,
    scale: {
      width: VIEW.width,
      height: VIEW.height,
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      expandParent: false,
    },
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 }, width: ARENA.width, height: ARENA.height, debug: false },
    },
    audio: { noAudio: true },
    scene: [ArenaScene],
  };
}
